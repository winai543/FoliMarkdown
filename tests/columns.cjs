const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
(async () => {
  const { default: puppeteer } = await import('puppeteer');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'folimarkdown-columns-'));
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: process.env.PUPPETEER_NO_SANDBOX ? ['--no-sandbox'] : [], userDataDir: temporary });
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href); await page.waitForFunction('ready');
    const row = (...columns) => '::: row\n' + columns.map(text => '::: col\n' + text + '\n:::').join('\n\n') + '\n:::\n';
    const source = row('**คอลัมน์ที่ 1**\nเนื้อหาของฝั่งซ้าย ใส่ Markdown ปกติได้เลย\n- รายการ 1\n- รายการ 2', '**คอลัมน์ที่ 2**\nเนื้อหาฝั่งขวา');
    const setSource = text => page.evaluate(text => { editor.value = text; update(true); setView('preview'); }, text);
    await setSource(source);
    assert.equal(await page.$$eval('#pages .markdown-row', rows => rows.length), 1);
    assert.equal(await page.$$eval('#pages .markdown-col strong', items => items.length), 2);
    assert.equal(await page.$$eval('#pages .markdown-col li', items => items.length), 2);
    assert.equal(await page.$eval('#pages .page-body', body => body.textContent.includes(':::')), false);
    const sideBySide = await page.$$eval('#pages .markdown-col', cols => {
      const [left, right] = cols.map(col => col.getBoundingClientRect());
      return Math.abs(left.top - right.top) < 1 && left.right < right.left;
    });
    assert.ok(sideBySide);
    const weighted = row('Wide content', 'Narrow content').replace('::: col\n', '::: col [2]\n');
    await setSource(weighted);
    const widths = await page.$$eval('#pages .markdown-col', columns => columns.map(column => column.getBoundingClientRect().width));
    assert.ok(Math.abs(widths[0] / widths[1] - 2) < .01, 'Widths follow a 2:1 ratio');
    const weightedDocx = await page.evaluate(async () => new TextDecoder().decode(await (await exportDocx()).blob.arrayBuffer()));
    const grid = /<w:tblGrid>(.*?)<\/w:tblGrid>/.exec(weightedDocx)[1];
    const gridWidths = [...grid.matchAll(/w:w="(\d+)"/g)].map(match => Number(match[1]));
    assert.ok(Math.abs(gridWidths[0] / gridWidths[1] - 2) < .01, 'DOCX preserves column ratios');
    await setSource(weighted.replace('[2]', '[.5]'));
    const decimal = await page.$$eval('#pages .markdown-col', columns => columns.map(column => column.getBoundingClientRect().width));
    assert.ok(Math.abs(decimal[0] / decimal[1] - .5) < .01);
    for (const invalid of ['0', '-1', 'NaN', '2; color:red', '1001']) {
      await setSource(weighted.replace('[2]', `[${invalid}]`));
      assert.equal(await page.$$eval('#pages .markdown-row', rows => rows.length), 0);
    }
    // Nested rows and literal fenced examples never consume container delimiters.
    await setSource(row('# Outer\n\n' + row('## Inner\n\n```text\n::: row\n::: col\n::: \n```', 'Nested right'), 'Outer right'));
    assert.equal(await page.$$eval('#pages .markdown-row', rows => rows.length), 2);
    assert.ok(await page.$eval('#pages pre', element => element.textContent.includes('::: col')));
    assert.deepEqual(await page.evaluate('headings.map(heading => heading.line)'), [2, 6]);
    await setSource('::: row\n::: col\nUnclosed content');
    assert.equal(await page.$$eval('#pages .markdown-row', rows => rows.length), 0);
    assert.ok(await page.$eval('#pages .page-body', element => element.textContent.includes('Unclosed content')));
    await setSource(row('<script>alert(1)</script>\n\n[bad](javascript:alert(1))', '- [ ] Task'));
    assert.equal(await page.$$eval('#pages script', scripts => scripts.length), 0);
    assert.equal(await page.$eval('#pages a', link => link.getAttribute('href')), '#');
    // Table indices and exact source ranges remain correct across duplicate columns.
    const table = '| Name | Value |\n| --- | --- |\n| Item | 1 |';
    await setSource(row(table, table) + '\n' + table);
    assert.deepEqual(await page.evaluate('editableTableBlocks().map(block => block.index)'), [0, 1, 2]);
    assert.equal(await page.$$eval('#pages .table-edit', buttons => buttons.length), 3);
    await page.evaluate(() => openTableEditor(1));
    await page.$eval('#tableGrid input[data-row="-1"][data-column="0"]', input => { input.value = 'Changed'; input.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.locator('#tableSave').click();
    assert.deepEqual(await page.evaluate('editableTableBlocks().map(block => block.settings.headers[0])'), ['Name', 'Changed', 'Name']);
    // Charts inside columns retain source indices and use the same edit dialog.
    await page.evaluate(() => { loadMermaid = async () => ({ render: async () => ({ svg: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><text y="40">Chart</text></svg>' }) }); });
    const chart = '```mermaid\npie showData\n  title Sample\n  "One" : 10\n  "Two" : 20\n```';
    await setSource(row(chart, chart));
    assert.deepEqual(await page.evaluate('editableChartBlocks().map(block => block.index)'), [0, 1]);
    await page.evaluate(() => openChartEditor(null, 1));
    assert.equal(await page.$eval('#chartTitle', input => input.value), 'Sample');
    await page.locator('#chartCancel').click();
    // A long table and long text can continue in separate columns without losing rows.
    const longTable = '| Name | Value |\n| --- | --- |\n' + Array.from({ length: 80 }, (_, i) => `| Row ${i} | ${i} |`).join('\n');
    const longText = 'Long text content. '.repeat(450);
    await setSource(row(longTable, longText));
    assert.equal(await page.$$eval('#pages .markdown-col tbody tr', rows => rows.length), 80);
    assert.equal(await page.$$eval('#pages .markdown-col:nth-child(2) p', paragraphs => paragraphs.map(p => p.textContent).join('').trim()), longText.trim());
    assert.ok(await page.$$eval('#pages .page-body', bodies => bodies.every(body => !body.lastElementChild || body.lastElementChild.getBoundingClientRect().bottom <= body.getBoundingClientRect().bottom + 1)));
    // Long columns split independently, preserving every paragraph exactly once.
    const left = Array.from({ length: 55 }, (_, i) => `Left paragraph ${i}: example text for pagination.`).join('\n\n');
    const right = Array.from({ length: 20 }, (_, i) => `Right paragraph ${i}: independent content.`).join('\n\n');
    await setSource(row(left, right).replace('::: col\n', '::: col [2]\n'));
    assert.ok(await page.$$eval('#pages .markdown-row', rows => rows.every(row => {
      const [left, right] = [...row.children].map(col => col.getBoundingClientRect().width);
      return Math.abs(left / right - 2) < .01;
    })), 'Split pages preserve ratios');
    const paragraphs = await page.$$eval('#pages .markdown-col > p', items => items.map(item => item.textContent));
    assert.equal(paragraphs.length, 75); assert.equal(new Set(paragraphs).size, 75);
    assert.ok(await page.$$eval('#pages .page', pages => pages.length > 1));
    assert.ok(await page.$$eval('#pages .markdown-row', rows => rows.every(row => row.querySelectorAll(':scope > .markdown-col').length === 2)));
    assert.ok(await page.$$eval('#pages .page-body', bodies => bodies.every(body => !body.lastElementChild || body.lastElementChild.getBoundingClientRect().bottom <= body.getBoundingClientRect().bottom + 1)));
    const exported = await page.evaluate(() => new DOMParser().parseFromString(exportHtml(), 'text/html').querySelectorAll('.markdown-row').length);
    assert.ok(exported > 1);
    await setSource(source);
    const docx = await page.evaluate(async () => { const result = await exportDocx(); return { warnings: result.warnings, contents: new TextDecoder().decode(await result.blob.arrayBuffer()) }; });
    assert.equal(docx.warnings, 0); assert.ok(docx.contents.includes('<w:tblLayout w:type="fixed"/>'));
    assert.ok(docx.contents.includes('คอลัมน์ที่ 1') && docx.contents.includes('คอลัมน์ที่ 2'));
    assert.ok(!docx.contents.includes('::: row'));
    await page.screenshot({ path: '/tmp/mdword-columns.png' });
    await page.setViewport({ width: 390, height: 844 });
    assert.ok(await page.$$eval('#pages .markdown-col', columns => columns.every(col => col.clientWidth > 0)));
    assert.deepEqual(errors, []);
    console.log('PASS columns: Thai Markdown, nested rows, code fences, malformed input, safe HTML, heading offsets, table editing, multi-page preservation, HTML/DOCX export and mobile');
  } finally { if (browser) await browser.close(); await fs.rm(temporary, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
