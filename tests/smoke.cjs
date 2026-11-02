// Run with Node.js and Puppeteer installed in the development environment.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');

(async () => {
  const { default: puppeteer } = await import('puppeteer');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'folimarkdown-test-'));
  const server = http.createServer(async (request, response) => {
    try {
      const file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
      if (!file.startsWith(root + path.sep)) throw new Error('Invalid path');
      const content = await fs.readFile(file);
      response.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html');
      response.end(content);
    } catch { response.writeHead(404); response.end(); }
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await puppeteer.launch({ headless: true, args: process.env.PUPPETEER_NO_SANDBOX ? ['--no-sandbox'] : [], userDataDir: path.join(temporary, 'profile') });
    const errors = [];
    const page = await browser.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 1000 });
    const client = await page.createCDPSession();
    await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: temporary });
    const downloaded = async filename => {
      for (let attempt = 0; attempt < 200; attempt++) {
        try { return await fs.readFile(path.join(temporary, filename)); }
        catch { await new Promise(resolve => setTimeout(resolve, 100)); }
      }
      throw new Error('Download did not finish: ' + filename);
    };
    for (const url of [pathToFileURL(path.join(root, 'index.html')).href,
      `http://127.0.0.1:${server.address().port}/index.html`]) {
      await page.goto(url);
      await page.waitForFunction('ready');
      assert.match(await page.title(), /FoliMarkdown/);
      const scheme = new URL(url).protocol;
      const result = await page.evaluate(async () => {
        docName.value = 'Smoke document';
        const id = await storeImageAsset('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=');
        editor.value = '# Smoke heading\n\nHello **world**.\n\n- [x] Done\n- [ ] Pending\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n![Pixel](asset:' + id + ')\n\n<!-- pagebreak -->\n\n## Second page\n\nFinal paragraph.';
        update(true);
        layout = { ...layout, paperSize: 'letter', orientation: 'landscape', margin: 'narrow' };
        syncLayoutControls();
        paginate();
        $('#search').value = 'world';
        $('#replacement').value = 'reader';
        replaceAll();
        const replaced = editor.value.includes('reader');
        perform('undo');
        const undone = editor.value.includes('world');
        perform('redo');
        const redone = editor.value.includes('reader');
        await flushDocument();
        const portable = markdownFile();
        const html = exportHtml();
        let readable;
        try { readable = !!$('#appStyle').sheet.cssRules.length; } catch { readable = false; }
        return { html, portable, replaced, undone, redone, readable, count: pages.children.length };
      });
      assert.ok(result.replaced && result.undone && result.redone, 'Find/replace and undo/redo');
      assert.equal(result.readable, scheme === 'http:');
      assert.equal(result.count, 2);
      assert.ok(result.portable.includes('data:image/png;base64,') && !result.portable.includes('asset:'));
      assert.ok(result.html.includes('@media print') && result.html.includes('.document li.task'));
      assert.ok(!result.html.includes('src="src/') && !result.html.includes('styles/app.css'));
      const exported = path.join(temporary, scheme.slice(0, -1) + '.html');
      await fs.writeFile(exported, result.html);
      const preview = await browser.newPage();
      await preview.goto(pathToFileURL(exported).href);
      await preview.waitForFunction('[...document.images].every(image => image.complete)');
      const screen = await preview.evaluate(() => ({
        count: document.querySelectorAll('.page').length,
        width: document.querySelector('.page').getBoundingClientRect().width,
        font: getComputedStyle(document.querySelector('.document')).fontSize,
        image: document.querySelector('img').naturalWidth,
        scripts: document.scripts.length,
        zoom: getComputedStyle(document.querySelector('.page')).zoom
      }));
      assert.deepEqual(screen, { count: 2, width: 1056, font: '14px', image: 1, scripts: 0, zoom: '1' });
      await preview.emulateMediaType('print');
      assert.equal(await preview.$eval('.pages', element => getComputedStyle(element).display), 'block');
      assert.equal(await preview.$eval('.page', element => getComputedStyle(element).breakAfter), 'page');
      await preview.close();
      await page.reload();
      await page.waitForFunction('ready');
      assert.ok(await page.$eval('#editor', element => element.value.includes('reader')), 'Saved document survives reload');
      console.log('PASS', scheme, 'editing, persistence, portable Markdown, standalone HTML and print styles');
    }
    // Exercise the download actions and library on the HTTP origin.
    await page.evaluate(() => perform('download'));
    assert.match((await downloaded('Smoke document.md')).toString(), /page-settings:layout/);
    await page.evaluate(() => perform('export'));
    assert.match((await downloaded('Smoke document.html')).toString(), /<!doctype html>/);
    await page.evaluate(() => perform('docx'));
    const docx = await downloaded('Smoke document.docx');
    assert.equal(docx.subarray(0, 2).toString(), 'PK');
    assert.ok(docx.includes(Buffer.from('<Application>FoliMarkdown</Application>')));
    await page.evaluate(() => perform('pdf'));
    assert.equal((await downloaded('Smoke document.pdf')).subarray(0, 5).toString(), '%PDF-');
    const importPath = path.join(temporary, 'Imported.md');
    await fs.copyFile(path.join(temporary, 'Smoke document.md'), importPath);
    await (await page.$('#fileInput')).uploadFile(importPath);
    await page.waitForFunction('docName.value === "Imported"');
    assert.equal(await page.evaluate('layout.orientation'), 'landscape');
    await page.evaluate(() => openLibrary());
    await page.waitForFunction('!document.querySelector("#libraryOverlay").hidden');
    await page.click('[data-library-action="duplicate"]');
    await page.waitForFunction('documents.some(item => item.name === "Imported (copy)")');
    page.on('dialog', dialog => dialog.accept());
    const copyId = await page.evaluate('documents.find(item => item.name === "Imported (copy)").id');
    await page.evaluate(id => libraryAction('delete', id), copyId);
    assert.equal(await page.evaluate(id => !!documents.find(item => item.id === id).deletedAt, copyId), true);
    await page.evaluate(id => libraryAction('restore', id), copyId);
    assert.equal(await page.evaluate(id => documents.find(item => item.id === id).deletedAt, copyId), null);
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(() => setView('preview'));
    assert.ok(await page.$eval('.preview-side', element => element.getBoundingClientRect().width > 0));
    const desktopPage = await browser.newPage();
    desktopPage.on('pageerror', error => errors.push(error.message));
    await desktopPage.evaluateOnNewDocument(() => {
      window.nativeCalls = [];
      window.__TAURI__ = {
        core: { invoke: async (command, args) => {
          window.nativeCalls.push({ command, args });
          return true;
        } },
        window: { getCurrentWindow: () => ({
          onCloseRequested: async callback => { window.nativeClose = callback; return () => {}; },
          destroy: async () => { window.nativeDestroyed = true; }
        }) }
      };
    });
    await desktopPage.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await desktopPage.waitForFunction('ready && window.nativeClose');
    await desktopPage.evaluate(() => perform('download'));
    const nativeSaved = await desktopPage.evaluate('window.nativeCalls.find(item => item.command === "save_export")');
    assert.match(Buffer.from(nativeSaved.args.data).toString(), /page-settings:layout/);
    await desktopPage.evaluate(() => openLibrary());
    await desktopPage.click('[data-library-action="rename"]');
    await desktopPage.waitForSelector('.desktop-prompt[open]');
    await desktopPage.$eval('#desktopPromptName', input => { input.value = 'Desktop renamed'; });
    await desktopPage.click('.desktop-prompt button[value="save"]');
    await desktopPage.waitForFunction('documents.some(item => item.name === "Desktop renamed")');
    const renamedId = await desktopPage.evaluate('documents.find(item => item.name === "Desktop renamed").id');
    await desktopPage.evaluate(id => libraryAction('delete', id), renamedId);
    assert.ok(await desktopPage.evaluate('window.nativeCalls.some(item => item.command === "confirm_action")'));
    await desktopPage.evaluate(() => closeLibrary());
    await desktopPage.evaluate(() => {
      editor.value += '\n\n[External](https://example.com)';
      update(true);
    });
    await desktopPage.locator('.document a[href="https://example.com"]').click();
    await desktopPage.waitForFunction('window.nativeCalls.some(item => item.command === "open_external")');
    await desktopPage.evaluate(async () => {
      await window.nativeClose({ preventDefault: () => { window.nativeClosePrevented = true; } });
    });
    assert.ok(await desktopPage.evaluate('window.nativeDestroyed && window.nativeClosePrevented'));
    await desktopPage.close();
    console.log('PASS desktop integration (mock IPC): save, rename, native confirmation, external link and save-on-close');
    assert.deepEqual(errors, []);
    console.log('PASS downloads: Markdown, HTML, DOCX, PDF; import, duplicate, trash, restore and mobile preview');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
