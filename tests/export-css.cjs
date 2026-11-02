const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'folimarkdown-css-'));
try {
  for (const directory of ['scripts', 'styles', 'src']) {
    fs.mkdirSync(path.join(temporary, directory));
  }
  const script = path.join(temporary, 'scripts/sync-export-css.cjs');
  fs.copyFileSync(path.join(root, 'scripts/sync-export-css.cjs'), script);
  const cssFile = path.join(temporary, 'styles/app.css');
  const generatedFile = path.join(temporary, 'src/export-styles.js');
  const css = 'body {\n  color: #14685f;\n}\n';
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  fs.writeFileSync(cssFile, css);
  assert.equal(run().status, 0);
  const expected = fs.readFileSync(generatedFile, 'utf8');
  for (const sourceEnding of ['\n', '\r\n', '\r']) {
    for (const generatedEnding of ['\n', '\r\n']) {
      fs.writeFileSync(cssFile, css.replace(/\n/g, sourceEnding));
      fs.writeFileSync(generatedFile, expected.replace(/\n/g, generatedEnding));
      const checked = run('--check');
      assert.equal(checked.status, 0, checked.stderr);
      assert.equal(run().status, 0);
      assert.equal(fs.readFileSync(generatedFile, 'utf8'), expected);
    }
  }
  fs.writeFileSync(cssFile, css.replace('#14685f', '#ffffff'));
  assert.equal(run('--check').status, 1, 'A real CSS change must still be detected');
  fs.unlinkSync(generatedFile);
  assert.equal(run('--check').status, 1, 'A missing generated file must still fail');
  console.log('PASS export CSS: LF/CRLF checkouts, deterministic generation, stale and missing files');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
