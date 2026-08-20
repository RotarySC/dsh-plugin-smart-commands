import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as esbuild from 'esbuild'

const root = fileURLToPath(new URL('..', import.meta.url))
const outfile = join(root, 'dist', 'client.js')
const packageId = '@deepseek-ai/dsh-plugin-smart-commands'

await mkdir(dirname(outfile), { recursive: true })
await esbuild.build({
  absWorkingDir: root,
  entryPoints: ['src/client/index.ts'],
  outfile,
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  logLevel: 'info',
  external: ['react', 'react/jsx-runtime', 'react-dom', '@deepseek-ai/dsh-typert-protocol'],
  banner: {
    js: `window.__ModuleLoader__.load({
	id: ${JSON.stringify(packageId)},
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
`,
  },
  footer: {
    js: `
		return module.exports;
	}
});
`,
  },
})
