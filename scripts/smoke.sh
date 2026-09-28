#!/usr/bin/env bash
# Smoke test: build output exists, the server boots against an EMPTY data dir,
# and the routes the dashboard depends on answer.
#
# This is deliberately dependency-free — no secrets, no network, no volume. It
# is the check that catches "the app imports a file that isn't in git", which is
# exactly how production once drifted three months ahead of main.
#
# Run locally:  npm run smoke
set -euo pipefail

PORT="${SMOKE_PORT:-5199}"
DATA_DIR="$(mktemp -d)"
export DATA_DIR PORT

cleanup() {
  [[ -n "${SRV:-}" ]] && kill "$SRV" 2>/dev/null || true
  rm -rf "$DATA_DIR"
}
trap cleanup EXIT

[[ -f dist/index.html ]] || { echo "✗ dist/index.html missing — run npm run build first"; exit 1; }

echo "→ booting server on :$PORT with DATA_DIR=$DATA_DIR"
node server.js > /tmp/smoke-server.log 2>&1 &
SRV=$!

for _ in $(seq 1 60); do
  curl -sf -o /dev/null "http://127.0.0.1:$PORT/api/status" && break
  kill -0 "$SRV" 2>/dev/null || { echo "✗ server exited during startup"; cat /tmp/smoke-server.log; exit 1; }
  sleep 0.5
done

fail=0
check() {
  local path="$1" desc="$2"
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT$path")
  if [[ "$code" == "200" ]]; then
    echo "  ✓ $desc ($path)"
  else
    echo "  ✗ $desc ($path) → HTTP $code"
    fail=1
  fi
}

echo "→ probing routes"
check "/"                    "SPA index"
check "/api/status"          "file status"
check "/api/buildings"       "building registry"
check "/api/sync-status"     "sheet auto-sync"
check "/api/strava/status"   "Strava sync"

if [[ "$fail" -ne 0 ]]; then
  echo
  echo "✗ smoke test FAILED — server log:"
  cat /tmp/smoke-server.log
  exit 1
fi

echo "✓ smoke test passed"
