import { copyFile, lstat, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(root, 'website/yinya');
const buildRoot = resolve(root, 'build');
const output = resolve(buildRoot, 'yinya-site');
// Only distribute the app and its notices, never the entire upstream website.
const files = [
  'index.html', 'style.css', 'mark.svg', 'license.txt',
  'assets/app.js', 'assets/app.js.map',
  'assets/mp3-worker.js', 'assets/mp3-worker.js.map',
  'vendor/lamejs.js', 'notices/index.html', 'notices/lamejs-LICENSE.txt',
  'notices/LGPL-3.0-only.txt', 'notices/GPL-3.0-only.txt',
];
// Check all inputs before replacing an earlier generated package.
await Promise.all(files.map(file => readFile(resolve(source, file))));
if (dirname(output) !== buildRoot || output === root) throw new Error('Invalid output path');
for (const path of [buildRoot, output]) {
  const info = await lstat(path).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (info?.isSymbolicLink()) throw new Error('Refusing to replace a linked output directory');
}
await rm(output, { recursive: true, force: true });
for (const file of files) {
  const dest = resolve(output, file);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(resolve(source, file), dest);
}
console.log('音芽静态网站包：build/yinya-site/');
