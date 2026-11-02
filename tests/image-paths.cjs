const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
(async () => {
  const { default: puppeteer } = await import('puppeteer');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'folimarkdown-image-paths-'));
  const root = path.resolve(__dirname, '..');
  const project = path.join(temporary, 'project');
  const pixel = await fs.readFile(path.join(root, 'docs/images/chart-settings.png'));
  await fs.mkdir(path.join(project, 'docs/images'), { recursive: true });
  await fs.writeFile(path.join(project, 'docs/images/pixel.png'), pixel);
  await fs.writeFile(path.join(project, 'docs/images/space name.png'), pixel);
  const markdown = '# Folder document\n\n`![Example](docs/images/pixel.png)`\n\n![Actual](docs/images/pixel.png)\n\n![Space](docs/images/space%20name.png "Caption")\n\n![Reference][photo]\n\n[photo]: docs/images/pixel.png "Reference"\n\n```md\n![Code](docs/images/pixel.png)\n```\n';
  await fs.writeFile(path.join(project, 'README.md'), markdown);
  const server = http.createServer(async (request, response) => {
    try {
      const relative = new URL(request.url, 'http://localhost').pathname;
      const file = path.resolve(root, '.' + relative);
      if (!file.startsWith(root + path.sep)) throw new Error('Invalid path');
      const data = await fs.readFile(file);
      response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html');
      response.end(data);
    } catch { response.writeHead(404); response.end(); }
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await puppeteer.launch({ headless: true, args: process.env.PUPPETEER_NO_SANDBOX ? ['--no-sandbox'] : [], userDataDir: path.join(temporary, 'profile') });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 1000 });
    for (const address of [pathToFileURL(path.join(root, 'index.html')).href, `http://127.0.0.1:${server.address().port}/index.html`]) {
      await page.goto(address);
      await page.waitForFunction('ready');
      await page.evaluate(() => { editor.value = '![UI](docs/images/folimarkdown-ui.png)'; update(true); });
      await page.waitForFunction('document.querySelector(".document img")?.naturalWidth > 0');
      const stable = await page.evaluate(async () => {
        // Allow the initial size measurement to settle, then retain the DOM node.
        await new Promise(resolve => setTimeout(resolve, 350));
        const image = document.querySelector('.document img');
        const count = pages.children.length;
        await new Promise(resolve => setTimeout(resolve, 800));
        return image.isConnected && image === document.querySelector('.document img') && count === pages.children.length;
      });
      assert.ok(stable, 'An idle loaded image must not trigger repeated repagination');
      assert.ok(await page.evaluate('safeUrl("docs/images/folimarkdown-ui.png", true).includes("docs/images/folimarkdown-ui.png")'));
    }
    await page.evaluate(() => { folderPickerMode = 'open'; });
    await (await page.$('#folderInput')).uploadFile(project);
    await page.waitForFunction('docName.value === "README" && Object.keys(documentImagePaths).length === 2');
    assert.equal(await page.$eval('#editor', input => input.value), markdown);
    await page.waitForFunction('[...document.querySelectorAll(".document img")].every(image => image.naturalWidth > 0)');
    const portable = await page.evaluate('markdownFile()');
    assert.ok(portable.includes('`![Example](docs/images/pixel.png)`'));
    assert.ok(portable.includes('```md\n![Code](docs/images/pixel.png)\n```'));
    assert.ok(portable.includes('[photo]: docs/images/pixel.png "Reference"'));
    assert.equal((portable.match(/data:image\/png;base64/g) || []).length, 3);
    const quoted = await page.evaluate(() => portablePathImages('> ```md\n> ![Same](docs/images/pixel.png)\n> ```\n>\n> ![Same](docs/images/pixel.png)\n'));
    assert.ok(quoted.startsWith('> ```md\n> ![Same](docs/images/pixel.png)\n> ```'));
    assert.equal((quoted.match(/data:image\/png;base64/g) || []).length, 1);
    assert.ok(await page.evaluate('[...new DOMParser().parseFromString(exportHtml(), "text/html").images].every(image => image.src.startsWith("data:image/png"))'));
    assert.equal(await page.evaluate('exportDocx().then(result => result.warnings)'), 0);
    await page.evaluate(() => flushDocument());
    await page.reload(); await page.waitForFunction('ready');
    assert.equal(await page.evaluate('Object.keys(documentImagePaths).length'), 2);
    const originalId = await page.evaluate('activeId');
    await page.evaluate(id => libraryAction('duplicate', id), originalId);
    const copyId = await page.evaluate('documents.find(item => item.name === "README (copy)").id');
    await page.evaluate(id => displayDocument(documents.find(item => item.id === id)), copyId);
    await page.evaluate(id => removeRecord(id), originalId);
    assert.ok(await page.evaluate('!!mappedImageData("docs/images/pixel.png")'));
    page.on('dialog', dialog => dialog.accept());
    await page.evaluate(id => libraryAction('purge', id), copyId);
    assert.equal(await page.evaluate('imageAssets.size'), 0);
    // Attach a folder to an ordinary imported file without modifying its source.
    await page.evaluate(() => libraryAction('new'));
    await (await page.$('#fileInput')).uploadFile(path.join(project, 'README.md'));
    await page.waitForFunction('docName.value === "README"');
    assert.equal(await page.evaluate('Object.keys(documentImagePaths).length'), 0);
    await page.evaluate(() => { folderPickerMode = 'link'; });
    await (await page.$('#folderInput')).uploadFile(project);
    await page.waitForFunction('Object.keys(documentImagePaths).length === 2');
    assert.equal(await page.$eval('#editor', input => input.value), markdown);
    // Choose a nested Markdown file and resolve ../ against its own directory.
    await fs.writeFile(path.join(project, 'docs/Nested.md'), '# Nested\n\n![Pixel](../docs/images/pixel.png)');
    await page.evaluate(() => { folderPickerMode = 'open'; });
    await (await page.$('#folderInput')).uploadFile(project);
    await page.waitForSelector('#folderMarkdownChoice');
    await page.select('#folderMarkdownChoice', 'docs/Nested.md');
    await page.locator('.desktop-prompt button[value="save"]').click();
    await page.waitForFunction('docName.value === "Nested"');
    assert.ok(await page.evaluate('!!mappedImageData("../docs/images/pixel.png")'));
    assert.equal(await page.evaluate('folderImagePath("docs", "../../outside.png")'), null);
    for (const invalid of ['javascript:alert(1)', 'data:image/svg+xml,evil', '//example.com/pixel.png', 'file:///etc/passwd', 'mailto:evil@example.com']) {
      assert.equal(await page.evaluate(url => safeUrl(url, true), invalid), '#');
    }
    assert.deepEqual(errors, []);
    console.log('PASS relative images: file/HTTP preview, folder open/link, nested paths, spaces, reference images, portable exports, reload, duplication, cleanup and URL safety');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
