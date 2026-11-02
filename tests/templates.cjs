const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
(async () => {
  const { default: puppeteer } = await import('puppeteer');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'folimarkdown-templates-'));
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: process.env.PUPPETEER_NO_SANDBOX ? ['--no-sandbox'] : [], userDataDir: temporary });
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.waitForFunction('ready');
    const original = await page.evaluate(() => {
      editor.value = '# Original\n\nKeep my unsaved work.'; update(true);
      layout.orientation = 'landscape';
      return { id: activeId, count: documents.length, text: editor.value };
    });
    const click = selector => page.locator(selector).click();
    const assertTaskLayout = async () => {
      const checks = await page.$$eval('#templatePreview li.task', items => items.map(item => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
        let text;
        while (walker.nextNode()) if (walker.currentNode.textContent.trim()) { text = walker.currentNode; break; }
        if (!checkbox || !text) return false;
        const range = document.createRange();
        const start = text.textContent.search(/\S/);
        range.setStart(text, start); range.setEnd(text, start + 1);
        const box = checkbox.getBoundingClientRect(), label = range.getBoundingClientRect();
        return box.width <= 20 && box.height <= 20 && box.right <= label.left
          && box.top < label.bottom && box.bottom > label.top;
      }));
      assert.ok(checks.every(Boolean), 'Task checkboxes stay compact and inline with their labels');
    };

    await click('#templatesTop');
    assert.equal(await page.$$eval('[data-template-id]', buttons => buttons.length), 9);
    await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(() => ({ id: activeId, count: documents.length, text: editor.value })), original);
    const ids = await page.evaluate('DOCUMENT_TEMPLATES.map(template => template.id)');
    for (const id of ids) {
      await click('#templatesTop'); await click(`[data-template-id="${id}"]`);
      assert.ok((await page.$eval('#templatePreview', element => element.textContent)).trim().length > 100);
      assert.equal(await page.$$eval('#templatePreview .table-edit', items => items.length), 0);
      await assertTaskLayout();
      await click('#templateCreate');
      await page.waitForFunction('!document.querySelector("#templateDialog").open');
      assert.equal(await page.evaluate(id => editor.value === DOCUMENT_TEMPLATES.find(item => item.id === id).text, id), true);
      assert.equal(await page.evaluate('layout.orientation'), id === 'student-certificate' ? 'landscape' : 'portrait');
      if (id === 'student-certificate') {
        await page.evaluate(() => paginate());
        assert.equal(await page.$$eval('#pages .page', pages => pages.length), 1, 'Certificate fits one landscape page');
      }
      assert.equal(await page.evaluate('layout.pageNumbers'), !['student-certificate', 'wedding-invitation'].includes(id));
    }
    assert.equal(await page.evaluate(id => documents.find(item => item.id === id).text, original.id), original.text);
    assert.equal(await page.evaluate('documents.length'), original.count + 9);
    await page.evaluate(() => flushDocument());
    await page.reload(); await page.waitForFunction('ready');
    assert.equal(await page.$eval('#docName', input => input.value), 'Travel itinerary');
    await click('#libraryTop'); await click('#libraryTemplates'); await click('#templateCancel');
    assert.equal(await page.$eval('#libraryOverlay', element => element.hidden), false);
    await click('#libraryTemplates'); await click('#templateCreate');
    await page.waitForFunction('!document.querySelector("#templateDialog").open');
    assert.equal(await page.$eval('#libraryOverlay', element => element.hidden), true);
    // A failed save must keep both the source document and the dialog available.
    await page.evaluate(() => { window.savedFlush = flushDocument; flushDocument = async () => false; });
    const beforeFailure = await page.evaluate('activeId');
    await click('#templatesTop'); await click('#templateCreate');
    await page.waitForFunction('document.querySelector("#templateError").textContent.length > 0');
    assert.equal(await page.evaluate('activeId'), beforeFailure);
    await page.evaluate(() => { flushDocument = window.savedFlush; });
    await click('#templateCancel');
    await page.setViewport({ width: 390, height: 844 });
    await click('#templatesTop'); await click('[data-template-id="invoice"]');
    assert.equal(await page.$eval('#templateDialog', dialog => dialog.scrollWidth <= dialog.clientWidth), true);
    await click('[data-template-id="itinerary"]');
    await assertTaskLayout();
    await page.screenshot({ path: '/tmp/mdword-templates-mobile.png' });
    await click('#templateCancel');
    await page.setViewport({ width: 1440, height: 1000 });
    await click('[data-tab="file"]'); await click('[data-action="templates"]');
    await click('[data-template-id="itinerary"]');
    await assertTaskLayout();
    await page.$eval('#templatePreview h2', heading => heading.scrollIntoView());
    await page.screenshot({ path: '/tmp/mdword-templates-desktop.png' });
    assert.deepEqual(errors, []);
    console.log('PASS templates: all nine previews, creation, save preservation, cancel, layouts, persistence, library/file entry points, save failure and mobile');
  } finally {
    if (browser) await browser.close();
    await fs.rm(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
