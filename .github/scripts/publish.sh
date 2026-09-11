#!/usr/bin/env bash
# Publishes a packaged extension, retrying the Marketplace call.
#
# vsce does not retry a timed out gallery request (microsoft/vscode-vsce#926), and
# a single slow response is enough to fail a release that is otherwise fine.
# --skip-duplicate makes a retry safe after a request that timed out on the
# response but landed on the server.
set -uo pipefail

PACKAGE="${1:?usage: publish.sh <path to vsix>}"
# Each failed attempt costs three minutes: that is typed-rest-client's socket
# timeout, and it is what "Request timeout: /_apis/gallery" actually means.
ATTEMPTS="${PUBLISH_ATTEMPTS:-3}"
DELAY="${PUBLISH_DELAY:-20}"
VSCE="${VSCE_COMMAND:-npx @vscode/vsce@3.9.2}"

echo "::group::Marketplace reachability"
node "$(dirname "$0")/diagnose-marketplace.js" || echo "diagnostic failed to run"
echo "::endgroup::"

# The publish request is the only one that carries the token, and it is the only
# one that hangs: unauthenticated requests to the same host answer in under a
# second. Ask whether the token itself is accepted, with a short leash so the
# answer does not cost another three minute socket timeout.
echo "::group::Token check"
if timeout 90 $VSCE verify-pat rayhuang2006 -p "$VSCE_PAT"; then
    echo "The token is accepted."
else
    status=$?
    if [ "$status" -eq 124 ]; then
        echo "The token check itself timed out, so the hang is in the authenticated path, not in publishing."
    else
        echo "The token was rejected (exit ${status})."
    fi
fi
echo "::endgroup::"

# The host publishes AAAA records and GitHub's hosted runners have no IPv6 route.
# An address that drops packets rather than refusing them looks exactly like a
# server that never answers, so prefer the family the runner can actually use.
export NODE_OPTIONS="${NODE_OPTIONS:-} --dns-result-order=ipv4first"

for attempt in $(seq 1 "$ATTEMPTS"); do
    echo "::group::Publish attempt ${attempt} of ${ATTEMPTS}"
    output=$($VSCE publish --packagePath "$PACKAGE" --skip-duplicate -p "$VSCE_PAT" 2>&1)
    status=$?
    echo "$output"
    echo "::endgroup::"

    if [ "$status" -eq 0 ]; then
        # --skip-duplicate exits zero without uploading anything, which must not be
        # reported as a successful publish.
        if echo "$output" | grep -q "already published"; then
            echo "Nothing was uploaded: this version is already on the Marketplace."
        else
            echo "Published on attempt ${attempt}."
        fi
        exit 0
    fi

    if [ "$attempt" -lt "$ATTEMPTS" ]; then
        echo "Attempt ${attempt} failed; retrying in ${DELAY}s."
        sleep "$DELAY"
        DELAY=$((DELAY * 2))
    fi
done

echo "Could not publish after ${ATTEMPTS} attempts."
exit 1
