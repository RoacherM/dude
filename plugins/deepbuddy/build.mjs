/**
 * Build for the deepbuddy plugin's two halves. Same contract as
 * workspace-shell's build: the host half as ordinary Node ESM, the browser
 * half as the CJS factory bundle the dsh client module loader registers.
 * The four loader rules (only platform modules external; everything else
 * inlines; no cross-plugin value imports; self-registration through
 * `window.__ModuleLoader__.load({ id, factory })`) are enforced here.
 */
import { readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

/** Mirrors `packages/client/web/src/platform.ts` in the harness. */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
]

/** A `@deepseek-ai/` specifier outside the platform table is a build error. */
const bundlePurity = {
  name: 'dsh-client-bundle-purity',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^@deepseek-ai\// }, (args) => {
      if (PLATFORM_MODULES.includes(args.path)) return null
      return {
        errors: [{
          text: `client bundle purity: "${args.path}" is not a platform module; `
            + 'cross-plugin value imports are forbidden — collaborate through cordis services '
            + '(type-only imports are erased and never reach this rule)',
        }],
      }
    })
  },
}

const root = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const out = join(root, 'lib')
await rm(out, { recursive: true, force: true })

await build({
  entryPoints: [join(root, 'src/host.js')],
  outfile: join(out, 'index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  packages: 'external',
  logLevel: 'info',
})

await build({
  entryPoints: [join(root, 'src/client/app/App.tsx')],
  outfile: join(out, 'client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  loader: { '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'text' },
  external: PLATFORM_MODULES,
  sourcemap: true,
  define: { 'process.env.NODE_ENV': JSON.stringify(process.env['NODE_ENV'] ?? 'production') },
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkg.name)}, factory: (require) => {\n`
      + 'var module = { exports: {} }; var exports = module.exports;',
  },
  footer: { js: 'return module.exports; } });' },
  plugins: [bundlePurity],
  logLevel: 'info',
})
