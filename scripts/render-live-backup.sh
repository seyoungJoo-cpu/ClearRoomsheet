#!/usr/bin/env bash
# Run ONLY in the actual running Render makeroom service shell.
# Coordinate a maintenance window: pause PAD uploads and all staff edits.
# Does not print operational records or modify existing source data.
set -Eeuo pipefail
umask 077

ROOT="${MAKEROOM_APP_ROOT:-/opt/render/project/src}"
OUT="${1:-$HOME}"
if [[ ! -d "$ROOT" ]]; then
  echo "ERROR: active app folder missing" >&2; exit 2
fi
cd "$ROOT"
if [[ ! -f sync-state.json ]]; then
  echo "ERROR: no sync-state.json. Stop: backup cannot be verified." >&2; exit 3
fi

node -e 'JSON.parse(require("fs").readFileSync("sync-state.json","utf8")); console.log("Pre-backup JSON: OK")'
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="$OUT/makeroom-operation-$STAMP.tar.gz"

files=(sync-state.json)
for file in push-subs.json .vapid-keys.json .push-vapid-marker.txt close-day-archives hkvacroom6563812.xml hk_allstatus6563818.xml; do
  if [[ -e "$file" ]]; then files+=("$file"); fi
done

BEFORE="$(sha256sum sync-state.json | cut -d ' ' -f 1)"
if ! tar -czf "$ARCHIVE" -- "${files[@]}"; then
  echo "ERROR: tar failed; removing incomplete backup" >&2
  rm -f "$ARCHIVE"; exit 4
fi
AFTER="$(sha256sum sync-state.json | cut -d ' ' -f 1)"
if [[ "$BEFORE" != "$AFTER" ]]; then
  echo "ERROR: live state changed during capture; pause ALL writers then retry" >&2
  rm -f "$ARCHIVE"; exit 5
fi
gzip -t "$ARCHIVE"
tar -xOf "$ARCHIVE" sync-state.json |
  node -e 'let v="";process.stdin.on("data",b=>v+=b).on("end",()=>{JSON.parse(v); console.log("Archived JSON: OK")})'
chmod 600 "$ARCHIVE"
echo "Archive: $ARCHIVE"
sha256sum "$ARCHIVE"
echo "TRANSFER this archive to company-approved encrypted storage using SCP."
echo "VERIFY copy checksum and restore on separate test instance before altering/deploying."
