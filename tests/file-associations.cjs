const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
(async () => {
  const config = JSON.parse(await fs.readFile(path.resolve(__dirname, '../src-tauri/tauri.conf.json'), 'utf8'));
  assert.deepEqual(config.bundle.fileAssociations[0].ext, ['md', 'markdown']);
  const { default: puppeteer } = await import('puppeteer');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'folimarkdown-file-associations-'));
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: process.env.PUPPETEER_NO_SANDBOX ? ['--no-sandbox'] : [], userDataDir: temporary });
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluateOnNewDocument(() => {
      window.nativeFiles = [{ name: 'Cold start.md', text: '# เปิดจาก OS\n\nภาษาไทย', error: null }];
      window.nativeReads = 0; window.earlyRead = false;
      window.__TAURI__ = {
        core: { invoke: async command => {
          if (command === 'take_open_files') {
            window.nativeReads++; if (!ready) window.earlyRead = true;
            return window.nativeFiles.splice(0);
          }
          return true;
        } },
        event: { listen: async (name, handler) => { window.openOSFiles = handler; return () => {}; } },
        window: { getCurrentWindow: () => ({ onCloseRequested: async () => {}, destroy: async () => {} }) }
      };
    });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.waitForFunction('ready && docName.value === "Cold start"');
    assert.equal(await page.evaluate('window.earlyRead'), false);
    assert.ok(await page.$eval('#editor', input => input.value.includes('ภาษาไทย')));
    const original = await page.evaluate(() => { editor.value += '\n\nUnsaved work'; update(true); return activeId; });
    await page.evaluate(async () => {
      window.nativeFiles.push({ name: 'Meeting.markdown', text: '# Meeting agenda', error: null }, { name: 'Missing.md', text: null, error: 'File not found' });
      await Promise.all([window.openOSFiles(), window.openOSFiles()]);
    });
    assert.equal(await page.$eval('#docName', input => input.value), 'Meeting');
    assert.ok(await page.evaluate(id => documents.find(item => item.id === id).text.includes('Unsaved work'), original));
    assert.equal(await page.evaluate('documents.filter(item => item.name === "Meeting").length'), 1);
    assert.equal(await page.evaluate('documents.some(item => item.name === "Missing")'), false);
    // Saving must succeed before native file contents are drained from the backend.
    const reads = await page.evaluate('window.nativeReads');
    await page.evaluate(async () => {
      window.originalFlush = flushDocument; flushDocument = async () => false;
      window.nativeFiles.push({ name: 'Retry.md', text: '# Retry', error: null });
      await window.openOSFiles();
    });
    assert.equal(await page.evaluate('window.nativeReads'), reads);
    assert.equal(await page.$eval('#docName', input => input.value), 'Meeting');
    await page.evaluate(async () => { flushDocument = window.originalFlush; await window.openOSFiles(); });
    assert.equal(await page.$eval('#docName', input => input.value), 'Retry');
    assert.deepEqual(errors, []);
    console.log('PASS OS file opening: association config, cold-start readiness, warm events, Unicode, save preservation, serialized batches, read errors and save-failure retry');
  } finally { if (browser) await browser.close(); await fs.rm(temporary, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
