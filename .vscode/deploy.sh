#!/usr/bin/env bash
# Password-based deploy. Reads connection details from .vscode/settings.json
# (which is gitignored). Until we fix SSH key auth on the Deck, this is how
# we ship builds. Usage: .vscode/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."

SETTINGS=".vscode/settings.json"
DECK_IP=$(python3 -c "import json; print(json.load(open('$SETTINGS'))['deckip'])")
DECK_PASS=$(python3 -c "import json; print(json.load(open('$SETTINGS'))['deckpass'])")
DECK_USER=$(python3 -c "import json; print(json.load(open('$SETTINGS'))['deckuser'])")
PLUGIN_NAME=$(python3 -c "import json; print(json.load(open('$SETTINGS'))['pluginname'])")
DIR_NAME=$(echo "$PLUGIN_NAME" | tr ' ' '-')

ZIP="out/${PLUGIN_NAME}.zip"
[ -f "$ZIP" ] || { echo "Zip not found at $ZIP. Run the build first."; exit 1; }
ZIP_BASE=$(basename "$ZIP")

# Force remote password auth, skip local SSH keys (which may be passphrase-locked).
SSH_OPTS="-o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password -o PubkeyAuthentication=no -o NumberOfPasswordPrompts=1"

echo "==> Transferring $ZIP to $DECK_USER@$DECK_IP:/tmp/"
expect <<EXP
set timeout 120
log_user 1
spawn scp $SSH_OPTS "$ZIP" $DECK_USER@$DECK_IP:/tmp/
expect {
    -re "${DECK_USER}@.*password:" { send "$DECK_PASS\r"; exp_continue }
    eof
}
catch wait result
exit [lindex \$result 3]
EXP
scp_status=$?
[ $scp_status -eq 0 ] || { echo "scp failed (exit $scp_status). Aborting."; exit $scp_status; }

echo "==> Extracting on Deck to /home/deck/homebrew/plugins/$DIR_NAME"
expect <<EXP
set timeout 60
log_user 1
spawn ssh -tt $SSH_OPTS $DECK_USER@$DECK_IP "sudo -S -p sudo: bash -c 'rm -rf /home/deck/homebrew/plugins/$DIR_NAME && mkdir -p /home/deck/homebrew/plugins/$DIR_NAME && chown deck:deck /home/deck/homebrew/plugins/$DIR_NAME && bsdtar -xzpf /tmp/$ZIP_BASE -C /home/deck/homebrew/plugins/$DIR_NAME --strip-components=1 && chmod -R u+rw /home/deck/homebrew/plugins/$DIR_NAME && rm /tmp/$ZIP_BASE && echo DEPLOY_OK'"
expect {
    -re "sudo:" { send "$DECK_PASS\r"; exp_continue }
    -re "${DECK_USER}@.*password:" { send "$DECK_PASS\r"; exp_continue }
    eof
}
catch wait result
exit [lindex \$result 3]
EXP
ssh_status=$?
[ $ssh_status -eq 0 ] || { echo "ssh extract failed (exit $ssh_status). Aborting."; exit $ssh_status; }

echo "==> Verifying plugin landed on Deck"
expect <<EXP
set timeout 15
log_user 1
spawn ssh $SSH_OPTS $DECK_USER@$DECK_IP "ls -la /home/deck/homebrew/plugins/$DIR_NAME/ && echo VERIFY_OK"
expect {
    -re "${DECK_USER}@.*password:" { send "$DECK_PASS\r"; exp_continue }
    eof
}
EXP

echo "==> Done. In Decky on your Deck: gear icon -> Developer -> Reload."
