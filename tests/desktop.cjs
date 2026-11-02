const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const scripts = [...html.matchAll(/<script src="(src\/[^\"]+)"/g)].map(match => match[1]);
new vm.Script(scripts.map(read).join('\n'));
const config = JSON.parse(read('src-tauri/tauri.conf.json'));
assert.equal(config.app.withGlobalTauri, true);
assert.equal(config.app.windows[0].dragDropEnabled, false);
for (const icon of config.bundle.icon) assert.ok(fs.existsSync(path.join(root, 'src-tauri', icon)));
execFileSync(process.execPath, [path.join(root, 'scripts/build-web.cjs')], { stdio: 'inherit' });
assert.deepEqual(fs.readdirSync(path.join(root, 'dist')).sort(), ['docs', 'index.html', 'src', 'styles', 'vendor']);
for (const file of [...scripts, 'index.html', 'styles/app.css']) {
  assert.equal(read('dist/' + file), read(file));
}

(async () => {
  const calls = [];
  let response = true;
  const context = vm.createContext({ Blob, Uint8Array, Array, console, setTimeout,
    window: { __TAURI__: { core: { invoke: async (command, args) => {
      calls.push({ command, args });
      if (response instanceof Error) throw response;
      return response;
    } } } },
    document: { addEventListener() {} }
  });
  vm.runInContext(read('src/desktop.js') + '\n' + read('src/files.js'), context);
  const output = await vm.runInContext('download("รายงาน.md", "Hello ภาษาไทย", "text/markdown")', context);
  assert.equal(output, true);
  assert.equal(calls[0].command, 'save_export');
  assert.equal(calls[0].args.filename, 'รายงาน.md');
  assert.equal(Buffer.from(calls[0].args.data).toString(), 'Hello ภาษาไทย');
  response = false;
  assert.equal(await vm.runInContext('download("Cancel.pdf", new Blob([new Uint8Array([0, 255])]), "application/pdf")', context), false);
  assert.deepEqual(Array.from(calls[1].args.data), [0, 255]);
  response = new Error('Permission denied');
  await assert.rejects(vm.runInContext('download("Error.html", "html", "text/html")', context), /Permission denied/);
  response = true;
  assert.equal(await vm.runInContext('confirmDocumentAction("Delete?")', context), true);
  assert.equal(calls.at(-1).command, 'confirm_action');
  context.ready = true;
  context.draftSnapshot = () => calls.push({ command: 'draft' });
  context.flushDocument = async () => false;
  context.window.__TAURI__.window = { getCurrentWindow: () => ({
    onCloseRequested: async callback => { context.closeHandler = callback; },
    destroy: async () => calls.push({ command: 'destroy' })
  }) };
  await vm.runInContext('initializeDesktop()', context);
  let prevented = false;
  await context.closeHandler({ preventDefault: () => { prevented = true; } });
  assert.ok(prevented);
  assert.ok(!calls.some(call => call.command === 'destroy'), 'Failed save keeps the window open');
  context.flushDocument = async () => { calls.push({ command: 'persist' }); return true; };
  await context.closeHandler({ preventDefault() {} });
  assert.deepEqual(calls.slice(-3).map(call => call.command), ['draft', 'persist', 'destroy']);
  console.log('PASS native export UTF-8/binary payloads, cancellation, errors, confirmation, script order and desktop asset isolation');
})().catch(error => { console.error(error); process.exitCode = 1; });
