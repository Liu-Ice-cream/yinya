import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const files = git(['ls-files', '-z']).split('\0').filter(Boolean);
const findings = [];
const patterns = [
  ['private key', /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/],
  ['GitHub credential', /(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{20,}/],
  ['AWS access key', /(?:AKIA|ASIA)[A-Z0-9]{16}/],
  ['local machine path', /[A-Za-z]:[\\/]+(?:Users|git-project)[\\/]+[^\s"'<>]+/i],
  ['home directory path', /\/(?:Users|home)\/[A-Za-z0-9_.-]+\//],
];
for (const file of files) {
  if (/(?:^|\/)(?:\.env(?:\..*)?|credentials\.json|secrets\.json|id_rsa|id_ed25519)$/.test(file) && !file.endsWith('.env.example')) findings.push([file, 'credential file']);
  if (/(?:^|\/)(?:\.local-notes|private-notes|local-notes|\.aws|\.codex|\.tools)\//.test(file)) findings.push([file, 'local private directory']);
  const data = await readFile(resolve(root, file));
  // Do not print matching content, keys or private paths in CI logs.
  if (data.includes(0)) continue;
  const text = data.toString('utf8');
  for (const [kind, pattern] of patterns) if (pattern.test(text)) findings.push([file, kind]);
}
const identity = git(['log', '-1', '--format=%ae%n%ce']).trim().split('\n');
if (identity.some(email => !/^[^\s<>]+@users\.noreply\.github\.com$/.test(email))) findings.push(['HEAD identity', 'use a GitHub noreply email']);
if (findings.length) {
  console.error('Privacy check failed (file and category only):');
  for (const [file, kind] of findings) console.error(`${file}: ${kind}`);
  process.exitCode = 1;
} else {
  console.log(`Privacy check passed: ${files.length} tracked files and current commit identity.`);
}
