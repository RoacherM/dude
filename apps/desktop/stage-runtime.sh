#!/usr/bin/env bash
#
# Build the self-contained runtime staging that the packaged DeepBuddy.app
# carries as extraResources (wave 10). The staged runtime is REAL files — a
# flat (hoisted) install of @deepseek-ai/dsh at the locked version, plus the
# built dsh-plugin-deepbuddy lib — so the app can spawn dsh with Electron's
# bundled Node (ELECTRON_RUN_AS_NODE) WITHOUT depending on the repo's pnpm
# symlink layout (which would break inside a .app bundle and fight dev
# hot-reload).
#
# pnpm installs into an isolated cache dir OUTSIDE the pnpm workspace (a
# workspace subdir would both conflict — the repo's node_modules was installed
# with devDeps while --prod wants to drop them — and pollute the repo root).
# The result is copied into apps/desktop/staging for electron-builder's
# extraResources. node-linker=hoisted gives real directories (no per-package
# symlinks to a central store); the global pnpm store makes re-runs cheap.
#
# Produces:
#   apps/desktop/staging/runtime/    real npm-dependency tree (@deepseek-ai/dsh + deps)
#   apps/desktop/staging/plugin/     built dsh-plugin-deepbuddy (lib + package.json + cordis.patch.yml)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGING="$REPO_ROOT/apps/desktop/staging"
RUNTIME="$STAGING/runtime"
PLUGIN="$STAGING/plugin"
LOCKED_DSH='@deepseek-ai/dsh@0.1.1-rc.2'
# A cache dir outside the pnpm workspace, so pnpm treats it as a standalone
# project instead of a workspace member.
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

# The plugin lib is a build artifact — build it if missing (it never edits the
# plugin source; it only produces lib/index.js + lib/client.js).
if [[ ! -f "$REPO_ROOT/plugins/deepbuddy/lib/client.js" ]]; then
  echo "stage-runtime: building dsh-plugin-deepbuddy lib..." >&2
  (cd "$REPO_ROOT" && pnpm --filter dsh-plugin-deepbuddy build)
fi

rm -rf "$STAGING"
mkdir -p "$PLUGIN"

# Real-file runtime in the isolated dir: node-linker=hoisted gives a flat
# node_modules of actual directories, --prod skips dev deps, --ignore-scripts
# avoids any postinstall from the packed tree.
mkdir -p "$BUILD_DIR/runtime"
cat > "$BUILD_DIR/runtime/package.json" <<'EOF'
{ "name": "deepbuddy-runtime", "private": true }
EOF
cat > "$BUILD_DIR/runtime/.npmrc" <<'EOF'
node-linker=hoisted
EOF
echo "stage-runtime: pnpm install $LOCKED_DSH (hoisted, prod) in isolated cache..." >&2
(cd "$BUILD_DIR/runtime" && pnpm install "$LOCKED_DSH" --prod --ignore-scripts)
# Clear the pnpm workspace marker if pnpm created a nested store node_modules.
rm -rf "$BUILD_DIR/runtime/node_modules/.pnpm"
# Move the real tree into the staging (mv is cheaper than cp for 269M).
mv "$BUILD_DIR/runtime/node_modules" "$RUNTIME"

# The built DeepBuddy plugin rides along as an extra resource so the app's
# generated profile can point its node_modules/dsh-plugin-deepbuddy here.
echo "stage-runtime: copying dsh-plugin-deepbuddy lib..." >&2
cp -R "$REPO_ROOT/plugins/deepbuddy/lib" "$PLUGIN/lib"
cp "$REPO_ROOT/plugins/deepbuddy/package.json" "$PLUGIN/package.json"
cp "$REPO_ROOT/plugins/deepbuddy/cordis.patch.yml" "$PLUGIN/cordis.patch.yml"

echo "stage-runtime: complete — $(du -sh "$RUNTIME" | cut -f1) runtime, plugin staged at $STAGING." >&2
