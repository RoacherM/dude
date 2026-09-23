#!/usr/bin/env bash
#
# Build the self-contained runtime staging that the packaged Dude.app
# carries as extraResources (wave 10). The staged runtime is REAL files — a
# flat (hoisted) install of @deepseek-ai/dsh at the locked version, plus the
# built dsh-plugin-dude lib — so the app can spawn dsh with Electron's
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
#   apps/desktop/staging/runtime/node_modules/  real npm tree (@deepseek-ai/dsh + deps)
#   apps/desktop/staging/plugin/                built dsh-plugin-dude (lib + package.json + cordis.patch.yml)
#
# The tree MUST stay under a directory literally named node_modules: ESM bare
# imports resolve ONLY by walking up node_modules directories (NODE_PATH is
# CJS-only). A tree renamed to anything else makes every staged inter-package
# import fall through to whatever node_modules an ancestor directory happens
# to have — inside this repo that silently loads the repo's pnpm copies (two
# instances of each package, so cross-package Symbol keys like dsh-tools'
# scheduler stop matching and the first tool dispatch dies), and outside the
# repo it refuses to boot at all.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STAGING="$REPO_ROOT/apps/desktop/staging"
RUNTIME="$STAGING/runtime"
PLUGIN="$STAGING/plugin"
# The root manifest is the one place the harness version is pinned; the
# upstream sync bumps it there.
LOCKED_DSH="@deepseek-ai/dsh@$(node -p "require('$REPO_ROOT/package.json').devDependencies['@deepseek-ai/dsh']")"
# A cache dir outside the pnpm workspace, so pnpm treats it as a standalone
# project instead of a workspace member.
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

# Always rebuild the plugin lib: a leftover lib/client.js may predate the
# current source, and the app would ship it.
echo "stage-runtime: building dsh-plugin-dude lib..." >&2
(cd "$REPO_ROOT" && pnpm --filter dsh-plugin-dude build)

rm -rf "$STAGING"
mkdir -p "$PLUGIN"

# Real-file runtime in the isolated dir: node-linker=hoisted gives a flat
# node_modules of actual directories, --prod skips dev deps, --ignore-scripts
# avoids any postinstall from the packed tree.
mkdir -p "$BUILD_DIR/runtime"
cat > "$BUILD_DIR/runtime/package.json" <<'EOF'
{ "name": "dude-runtime", "private": true }
EOF
cat > "$BUILD_DIR/runtime/.npmrc" <<'EOF'
node-linker=hoisted
EOF
echo "stage-runtime: pnpm install $LOCKED_DSH (hoisted, prod) in isolated cache..." >&2
(cd "$BUILD_DIR/runtime" && pnpm install "$LOCKED_DSH" --prod --ignore-scripts)
# pnpm 11 still materializes packages under node_modules/.pnpm even with
# node-linker=hoisted; the top-level names are relative symlinks into that
# store. Deleting .pnpm leaves a 600K husk and the packaged app cannot boot.
# Move the whole tree, including .pnpm, so those relative links stay valid.
mkdir -p "$RUNTIME"
mv "$BUILD_DIR/runtime/node_modules" "$RUNTIME/node_modules"

# The built Dude plugin rides along as an extra resource so the app's
# generated profile can point its node_modules/dsh-plugin-dude here.
echo "stage-runtime: copying dsh-plugin-dude lib..." >&2
cp -R "$REPO_ROOT/plugins/dude/lib" "$PLUGIN/lib"
cp "$REPO_ROOT/plugins/dude/package.json" "$PLUGIN/package.json"
cp "$REPO_ROOT/plugins/dude/cordis.patch.yml" "$PLUGIN/cordis.patch.yml"
# Since dsh 0.1.5 the plugin loader imports a bundle by bare name from its own
# location inside the runtime, not from the profile directory — so the same
# built plugin must also sit at the runtime's node_modules top level. The
# profile copy stays: it is what the profile manifest points at.
cp -R "$PLUGIN" "$RUNTIME/node_modules/dsh-plugin-dude"

echo "stage-runtime: complete — $(du -sh "$RUNTIME" | cut -f1) runtime, plugin staged at $STAGING." >&2
