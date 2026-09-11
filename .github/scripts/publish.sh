#!/usr/bin/env bash
# Publishes a packaged extension, retrying the Marketplace call.
#
# vsce does not retry a timed out gallery request (microsoft/vscode-vsce#926), and
# a single slow response is enough to fail a release that is otherwise fine.
# --skip-duplicates makes a retry safe after a request that timed out on the
# response but landed on the server.
set -uo pipefail

PACKAGE="${1:?usage: publish.sh <path to vsix>}"
ATTEMPTS="${PUBLISH_ATTEMPTS:-5}"
DELAY="${PUBLISH_DELAY:-15}"
VSCE="${VSCE_COMMAND:-npx @vscode/vsce@3.9.2}"

for attempt in $(seq 1 "$ATTEMPTS"); do
    echo "::group::Publish attempt ${attempt} of ${ATTEMPTS}"
    if $VSCE publish --packagePath "$PACKAGE" --skip-duplicates -p "$VSCE_PAT"; then
        echo "::endgroup::"
        echo "Published on attempt ${attempt}."
        exit 0
    fi
    echo "::endgroup::"

    if [ "$attempt" -lt "$ATTEMPTS" ]; then
        echo "Attempt ${attempt} failed; retrying in ${DELAY}s."
        sleep "$DELAY"
        DELAY=$((DELAY * 2))
    fi
done

echo "Could not publish after ${ATTEMPTS} attempts."
exit 1
