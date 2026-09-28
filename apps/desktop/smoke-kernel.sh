#!/usr/bin/env bash
#
# Boot the built Dude.app (dist/mac-arm64) on a kernel and screenshot the window.
#
#   bash smoke-kernel.sh              the app's bundled baseline kernel
#   bash smoke-kernel.sh 0.1.7-rc.1   that dsh version, installed the way the
#                                     hot update does (kernel.js installRuntime)
#
# Runs under a scratch HOME so ~/.dude is never touched: the app derives
# ~/.dude from os.homedir(), which follows $HOME. Settings and credentials are
# copied in so the UI gets past onboarding. Output goes to $OUT (default
# /tmp/dude-smoke): app.log and screenshot.png.
set -euo pipefail

APP="$(cd "$(dirname "$0")" && pwd)/dist/mac-arm64/Dude.app"
BIN="$APP/Contents/MacOS/Dude"
RES="$APP/Contents/Resources"
OUT="${OUT:-/tmp/dude-smoke}"
FAKE_HOME="$OUT/home"

rm -rf "$OUT"
mkdir -p "$FAKE_HOME/.dude"
for f in settings.yaml .credentials.yaml; do
  [ -f "$HOME/.dude/$f" ] && cp "$HOME/.dude/$f" "$FAKE_HOME/.dude/"
done

if [ -n "${1:-}" ]; then
  echo "smoke: installing dsh $1 into the scratch ~/.dude/runtime" >&2
  # kernel.js is inside app.asar; Electron's Node reads asar paths directly.
  HOME="$FAKE_HOME" ELECTRON_RUN_AS_NODE=1 "$BIN" -e "
    require('$RES/app.asar/kernel.js')
      .installRuntime('$1', '$RES/pnpm/bin/pnpm.mjs', require('$RES/app.asar/kernel.js').packageCount('$RES/dsh-runtime'))
      .then((dir) => console.log('installed', dir), (e) => { console.error(e); process.exit(1) })
  " > "$OUT/install.log" 2>&1
fi

echo "smoke: launching $APP" >&2
HOME="$FAKE_HOME" DSH_DESKTOP_SCREENSHOT="$OUT/screenshot.png" "$BIN" > "$OUT/app.log" 2>&1 &
PID=$!
for _ in $(seq 90); do
  [ -f "$OUT/screenshot.png" ] && break
  kill -0 "$PID" 2>/dev/null || break
  sleep 1
done
kill "$PID" 2>/dev/null || true
wait "$PID" 2>/dev/null || true

echo "electron: $(HOME="$FAKE_HOME" ELECTRON_RUN_AS_NODE=1 "$BIN" -p process.versions.electron)"
grep -m1 -o 'starting kernel .*' "$OUT/app.log" || true
grep -m1 -o 'dsh web: http[^ ]*' "$OUT/app.log" | sed 's/?token=.*//' || true
if [ -f "$OUT/screenshot.png" ]; then
  echo "ok: $OUT/screenshot.png"
else
  echo "FAILED: no screenshot, see $OUT/app.log" >&2
  tail -20 "$OUT/app.log" >&2
  exit 1
fi
