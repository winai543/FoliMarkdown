const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
(async () => {
  const { default: puppeteer } = await import('puppeteer');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'folimarkdown-chart-ui-'));
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: process.env.PUPPETEER_NO_SANDBOX ? ['--no-sandbox'] : [], userDataDir: temporary });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.waitForFunction('ready');
    // Keep interaction tests deterministic/offline. Real Mermaid is checked separately.
    await page.evaluate(() => {
      loadMermaid = async () => ({ render: async () => ({ svg: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><text y="40">Chart preview</text></svg>' }) });
      editor.value = '# Charts\n\n'; update(true); editor.setSelectionRange(editor.value.length, editor.value.length);
    });
    await page.locator('[data-tab="chart"]').click();
    await page.locator('[data-action="chartBar"]').click();
    await page.waitForSelector('#chartDialog[open]');
    const fill = async (selector, value) => page.$eval(selector, (input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }, value);
    await fill('#chartTitle', 'ยอดขายรายเดือน');
    await fill('#chartMaximum', '50');
    assert.equal(await page.$eval('#chartSave', button => button.disabled), true);
    await fill('#chartMinimum', '0');
    await page.locator('#chartAddRow').click();
    await fill('#chartRows > :last-child input:first-child', 'May');
    await fill('#chartRows > :last-child input[type="number"]', '46');
    await page.waitForSelector('#chartPreview svg');
    await page.locator('#chartSave').click();
    await page.waitForFunction('!document.querySelector("#chartDialog").open');
    const inserted = await page.$eval('#editor', input => input.value);
    assert.match(inserted, /ยอดขายรายเดือน/);
    assert.match(inserted, /May/);
    assert.match(inserted, /18, 27, 34, 42, 46/);
    await page.locator('.diagram-edit').click();
    assert.equal(await page.$eval('#chartTitle', input => input.value), 'ยอดขายรายเดือน');
    await fill('#chartTitle', 'Updated chart');
    await page.locator('#chartSave').click();
    await page.waitForFunction('!document.querySelector("#chartDialog").open');
    assert.equal(await page.evaluate('(editor.value.match(/```mermaid/g) || []).length'), 1);
    await page.evaluate(() => perform('undo'));
    assert.equal(await page.$eval('#editor', input => input.value), inserted);
    await page.evaluate(() => perform('redo'));
    assert.ok(await page.$eval('#editor', input => input.value.includes('Updated chart')));
    assert.ok(await page.evaluate(() => !new DOMParser().parseFromString(exportHtml(), "text/html").querySelector(".diagram-edit")));
    await page.evaluate(() => { editor.setSelectionRange(editor.value.length, editor.value.length); perform('diagramTimeline'); });
    await page.waitForSelector('#chartDialog[open]');
    await fill('#chartTitle', 'Project milestones');
    await fill('#chartRows > :first-child input:last-of-type', 'Research');
    await page.locator('#chartSave').click();
    await page.waitForFunction('!document.querySelector("#chartDialog").open');
    assert.ok(await page.$eval('#editor', input => input.value.includes('2026 : Research')), await page.$eval('#editor', input => input.value));
    const beforeCancel = await page.$eval('#editor', input => input.value);
    await page.evaluate(() => { editor.setSelectionRange(editor.value.length, editor.value.length); perform('chartPie'); });
    await fill('#chartRows > :first-child input[type="number"]', '-1');
    assert.equal(await page.$eval('#chartSave', button => button.disabled), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.$eval('#editor', input => input.value), beforeCancel);
    // Identical diagrams must update the one the user selected, not the first match.
    await page.evaluate(() => {
      const source = chartSource(chartDefaults('chartLine'));
      editor.value = `\`\`\`mermaid\n${source}\n\`\`\`\n\n\`\`\`mermaid\n${source}\n\`\`\`\n`; update(true);
      openChartEditor(null, 1);
    });
    await fill('#chartTitle', 'Second only');
    await page.locator('#chartSave').click();
    await page.waitForFunction('!document.querySelector("#chartDialog").open');
    assert.deepEqual(await page.evaluate('editableChartBlocks().map(block => block.settings.title)'), ['Monthly sales', 'Second only']);
    // A source edit while the form is open must never get overwritten.
    await page.evaluate(() => openChartEditor(null, 0));
    await fill('#chartTitle', 'Do not save');
    await page.evaluate(() => { editor.value += '\nNew text'; update(true); });
    await page.locator('#chartSave').click();
    await page.waitForFunction('document.querySelector("#chartError").textContent.includes("document changed")');
    assert.match(await page.$eval('#chartError', element => element.textContent), /document changed/i);
    await page.locator('#chartCancel').click();
    await page.setViewport({ width: 390, height: 844 });
    await page.evaluate(() => openChartEditor(null, 0));
    assert.ok(await page.$eval('#chartDialog', dialog => dialog.getBoundingClientRect().width <= innerWidth));
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
    console.log('PASS chart GUI: insert, edit, validation, undo/redo, cancel, duplicate targeting, conflict protection, export and mobile');
  } finally {
    if (browser) await browser.close();
    await fs.rm(temporary, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
