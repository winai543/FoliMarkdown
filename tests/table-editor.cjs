const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
(async () => {
  const { default: puppeteer } = await import('puppeteer');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'folimarkdown-table-ui-'));
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: process.env.PUPPETEER_NO_SANDBOX ? ['--no-sandbox'] : [], userDataDir: temporary });
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href); await page.waitForFunction('ready');
    await page.evaluate(() => { editor.value = '# Tables\n\n'; update(true); editor.setSelectionRange(editor.value.length, editor.value.length); });
    const click = selector => page.locator(selector).click();
    const cell = (row, column) => `#tableGrid input[data-row="${row}"][data-column="${column}"]`;
    const fill = (selector, value) => page.$eval(selector, (input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }, value);
    const save = async () => { await click('#tableSave'); await page.waitForFunction('!document.querySelector("#tableDialog").open'); };
    await click('[data-tab="insert"]'); await click('[data-action="table"]');
    await page.waitForSelector('#tableDialog[open]');
    await fill(cell(-1, 0), 'Name'); await fill(cell(0, 0), 'ไทย | English'); await fill(cell(0, 1), '**Bold**');
    assert.equal(await page.$eval('#tablePreview strong', element => element.textContent), 'Bold');
    await page.select('#tableGrid select[data-align-column="1"]', 'center');
    await click('#tableAddRow'); await click('#tableAddColumn');
    assert.equal(await page.evaluate('tableEditorSession.settings.rows.length'), 3);
    assert.equal(await page.evaluate('tableEditorSession.settings.headers.length'), 4);
    await click(cell(2, 0)); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate('tableEditorSession.settings.rows.length'), 4);
    assert.equal(await page.$eval('#tableDialog', dialog => dialog.open), true);
    await click('#tableUndo'); assert.equal(await page.evaluate('tableEditorSession.settings.rows.length'), 3);
    await click('#tableRedo'); assert.equal(await page.evaluate('tableEditorSession.settings.rows.length'), 4);
    await click('button[aria-label="Remove row 4"]');
    await page.$eval(cell(1, 1), input => {
      const clipboard = new DataTransfer(); clipboard.setData('text/plain', 'A\tB\nC\tD');
      input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }));
    });
    assert.equal(await page.evaluate('tableEditorSession.settings.rows[2][2]'), 'D');
    await click('button[aria-label="Move column 1 right"]');
    assert.equal(await page.evaluate('tableEditorSession.settings.headers[1]'), 'Name');
    await click('button[aria-label="Move row 1 down"]');
    await click('button[aria-label="Remove column 4"]');
    await click('#tableUndo'); assert.equal(await page.evaluate('tableEditorSession.settings.headers.length'), 4);
    await save();
    const inserted = await page.$eval('#editor', input => input.value);
    // Edit controls overlay the table and never add height or move its rows.
    await page.mouse.move(0, 0);
    const tableGeometry = () => page.$eval('#pages .document table', table => ({
      top: table.getBoundingClientRect().top, height: table.getBoundingClientRect().height,
      firstRow: table.rows[0].getBoundingClientRect().top
    }));
    const normalGeometry = await tableGeometry();
    assert.equal(await page.$eval('#pages .table-edit', button => getComputedStyle(button).opacity), '0');
    await page.hover('#pages .document table');
    assert.equal(await page.$eval('#pages .table-edit', button => getComputedStyle(button).opacity), '1');
    assert.deepEqual(await tableGeometry(), normalGeometry);
    await page.screenshot({ path: '/tmp/mdword-floating-table-edit.png' });
    await page.$eval('#pages .table-editor-caption', caption => caption.style.display = 'none');
    assert.deepEqual(await tableGeometry(), normalGeometry, 'Removing edit control leaves table layout unchanged');
    await page.$eval('#pages .table-editor-caption', caption => caption.style.removeProperty('display'));
    await page.mouse.move(0, 0);
    await page.focus('#pages .table-edit');
    assert.equal(await page.$eval('#pages .table-edit', button => getComputedStyle(button).opacity), '1');

    assert.ok(inserted.includes('ไทย \\| English') && inserted.includes('**Bold**'));
    assert.equal(await page.evaluate('editableTableBlocks().length'), 1);
    await click('#pages .document .table-edit');
    await fill(cell(-1, 0), 'Updated'); await save();
    assert.equal(await page.evaluate('editableTableBlocks().length'), 1);
    await page.evaluate(() => perform('undo')); assert.equal(await page.$eval('#editor', input => input.value), inserted);
    await page.evaluate(() => perform('redo')); assert.ok(await page.$eval('#editor', input => input.value.includes('Updated')));
    const beforeCancel = await page.$eval('#editor', input => input.value);
    await click('#pages .document .table-edit'); await fill(cell(-1, 0), 'Discard'); await page.keyboard.press('Escape');
    assert.equal(await page.$eval('#editor', input => input.value), beforeCancel);
    await page.evaluate(() => flushDocument()); await page.reload(); await page.waitForFunction('ready');
    assert.ok(await page.$eval('#editor', input => input.value.includes('Updated')));
    // Reference definitions and identical tables must not shift the replaced block.
    await page.evaluate(() => {
      const source = tableSource(tableDefaults());
      editor.value = `[ref]: https://example.com\n\n${source}\n\n${source}\n`; update(true); openTableEditor(1);
    });
    await fill(cell(-1, 0), 'Second only'); await save();
    assert.deepEqual(await page.evaluate('editableTableBlocks().map(block => block.settings.headers[0])'), ['Item', 'Second only']);
    assert.ok(await page.$eval('#editor', input => input.value.startsWith('[ref]: https://example.com')));
    await page.evaluate(() => openTableEditor(0)); await fill(cell(-1, 0), 'Do not save');
    await page.evaluate(() => { editor.value += '\nNew content'; update(true); }); await click('#tableSave');
    await page.waitForFunction('document.querySelector("#tableError").textContent.includes("document changed")'); await click('#tableCancel');
    // A split table repeats its edit control, but every fragment edits the same source.
    await page.evaluate(() => {
      const model = tableDefaults(); model.rows = Array.from({ length: 100 }, (_, index) => [`Row ${index}`, 'Description', 'Ready']);
      editor.value = tableSource(model); update(true);
    });
    assert.ok(await page.$$eval('#pages .document table', tables => tables.length > 1));
    assert.equal(await page.$$eval('#pages .document tbody', bodies => bodies.reduce((sum, body) => sum + body.rows.length, 0)), 100);
    assert.ok(await page.$$eval('#pages .document .table-edit', buttons => buttons.every(button => button.dataset.tableIndex === '0')));
    await page.evaluate(() => [...pages.querySelectorAll('.table-edit')].at(-1).click());
    assert.equal(await page.evaluate('tableEditorSession.settings.rows.length'), 100); await click('#tableCancel');
    const exported = await page.evaluate(() => {
      const output = new DOMParser().parseFromString(exportHtml(), 'text/html');
      return { controls: output.querySelectorAll('.table-edit, .table-editor-caption').length,
        rows: [...output.querySelectorAll('tbody')].reduce((sum, body) => sum + body.rows.length, 0) };
    });
    assert.deepEqual(exported, { controls: 0, rows: 100 });
    assert.equal(await page.evaluate('exportDocx().then(result => result.warnings)'), 0);
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.evaluate(() => setView('preview'));
    assert.equal(await page.$eval('#pages .table-edit', button => getComputedStyle(button).opacity), '1', 'Touch devices keep edit controls visible');
    await page.evaluate(() => openTableEditor(0));
    assert.ok(await page.$eval('#tableDialog', dialog => dialog.getBoundingClientRect().width <= innerWidth));
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
    console.log('PASS table GUI: editing, formatting, alignment, row/column operations, paste, keyboard navigation, undo/redo, persistence, split-table editing, exports and mobile');
  } finally {
    if (browser) await browser.close(); await fs.rm(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
