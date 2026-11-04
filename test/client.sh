#!/bin/bash
# Client suite (Vitest through ng test) in a Linux node container (host Node 22 is too old for the Angular CLI). From the project root:
#   bash test/client.sh
# Green means exit code 0 AND no `Errors` line in the Vitest summary (an unhandled error fails the run even when every test passes).
# The exit code of `ng test` itself is kept (never pipe it through tail); this script exits with it, or with 1 when an Errors line is found.
# Run it alone, not next to other Docker jobs.
cd "$(dirname "$0")/.."
out=$(MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W 2>/dev/null || pwd)/client:/src:ro" node:24 bash -c 'mkdir /work && cd /src && tar --exclude=node_modules --exclude=dist --exclude=.angular -cf - . | tar -xf - -C /work && cd /work && npm ci --no-audit --no-fund >/dev/null 2>&1 && npx ng test --watch=false > /tmp/ng.out 2>&1; code=$?; cat /tmp/ng.out; echo "NG_EXIT=$code"')
echo "$out" | sed 's/\x1b\[[0-9;]*m//g' | grep -E "Test Files|Tests |Errors|Unhandled|FAIL|NG_EXIT"
code=$(echo "$out" | sed -n 's/^NG_EXIT=//p' | tail -1)
if echo "$out" | sed 's/\x1b\[[0-9;]*m//g' | grep -qE "^\s*Errors\s"; then echo "FAIL: the summary has an Errors line"; exit 1; fi
exit "${code:-1}"
