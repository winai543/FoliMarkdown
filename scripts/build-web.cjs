// Copy only public application assets; never bundle the repository or Rust sources.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
execFileSync(process.execPath, [path.join(__dirname, 'sync-export-css.cjs'), '--check'], { stdio: 'inherit' });
const output = path.join(root, 'dist');
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output);
for (const name of ['index.html', 'src', 'styles', 'vendor']) {
  fs.cpSync(path.join(root, name), path.join(output, name), { recursive: true });
}
fs.cpSync(path.join(root, 'docs/images'), path.join(output, 'docs/images'), { recursive: true });
console.log('Prepared public frontend in dist/');
