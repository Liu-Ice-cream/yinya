import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(resolve(root, 'website/yinya/assets'), { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ['yinya/app.js'],
  bundle: true,
  format: 'esm',
  target: 'es2020',
  outfile: 'website/yinya/assets/app.js',
  sourcemap: true,
  legalComments: 'eof',
});
console.log('音芽已构建：website/yinya/index.html');
