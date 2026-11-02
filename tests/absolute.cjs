const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
(async () => {
  const { default: puppeteer } = await import('puppeteer');
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'folimarkdown-absolute-'));
  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, args: process.env.PUPPETEER_NO_SANDBOX ? ['--no-sandbox'] : [], userDataDir: temporary });
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href); await page.waitForFunction('ready');
    const setSource = text => page.evaluate(text => { editor.value = text; update(true); setView('preview'); }, text);
    const floating = (position, text) => `::: absolute [${position}]\n${text}\n:::\n`;
    await setSource(floating('top-right', '**ป้ายประกาศ**\nเนื้อหานี้จะลอยอยู่มุมขวาบนของ Container เสมอ') + '\n# Document\n\nNormal text.');
    assert.equal(await page.$$eval('#pages .markdown-absolute', items => items.length), 1);
    assert.equal(await page.$eval('#pages .markdown-absolute strong', element => element.textContent), 'ป้ายประกาศ');
    assert.ok(await page.$eval('#pages .markdown-absolute', element => Math.abs(element.getBoundingClientRect().right - element.offsetParent.getBoundingClientRect().right) < 1));
    const bodyTop = await page.$eval('#pages h1', element => element.getBoundingClientRect().top);
    await page.$eval('#pages .markdown-absolute', element => element.remove());
    assert.equal(await page.$eval('#pages h1', element => element.getBoundingClientRect().top), bodyTop);
    await setSource(floating('x=10, y=50', 'Coordinates'));
    assert.deepEqual(await page.$eval('#pages .markdown-absolute', element => ({ left: getComputedStyle(element).left, top: getComputedStyle(element).top })), { left: '10px', top: '50px' });
    for (const anchor of ['top-left', 'bottom-left', 'bottom-right']) {
      await setSource(floating(anchor, 'Corner'));
      assert.equal(await page.$$eval('#pages .markdown-absolute', items => items.length), 1);
    }
    for (const invalid of ['x=10; color:red, y=50', 'x=10, x=20', 'x=Infinity, y=5', 'unknown']) {
      await setSource(floating(invalid, 'Literal content'));
      assert.equal(await page.$$eval('#pages .markdown-absolute', items => items.length), 0);
      assert.ok(await page.$eval('#pages .page-body', element => element.textContent.includes('Literal content')));
    }
    await setSource('```text\n' + floating('top-right', 'Code example') + '```');
    assert.equal(await page.$$eval('#pages .markdown-absolute', items => items.length), 0);
    await setSource('::: absolute [top-right]\nUnclosed');
    assert.equal(await page.$$eval('#pages .markdown-absolute', items => items.length), 0);
    // An absolute inside a column belongs to that column, not to the page.
    const left = Array.from({ length: 55 }, (_, i) => `Paragraph ${i}: text to span several pages.`).join('\n\n');
    await setSource('::: row\n::: col\n' + floating('top-right', '**Only once**') + '\n' + left + '\n:::\n::: col\nRight column\n:::\n:::\n');
    assert.equal(await page.$$eval('#pages .markdown-absolute', items => items.length), 1);
    assert.equal(await page.$eval('#pages .markdown-absolute', element => element.offsetParent.className), 'markdown-col');
    assert.ok(await page.$$eval('#pages .page', items => items.length > 1));
    assert.equal(await page.$$eval('#pages .markdown-col > p', items => items.filter(item => item.textContent.startsWith('Paragraph')).length), 55);
    await page.evaluate(() => { const template = DOCUMENT_TEMPLATES.find(item => item.id === 'resume'); displayDocument(newRecord(template.name, template.text, template.layout)); setView('preview'); });
    await page.waitForFunction('document.querySelector("#pages .markdown-absolute img")?.naturalWidth > 0');
    assert.ok(await page.$eval('#pages .markdown-absolute img', image => image.naturalWidth > 1 && image.getBoundingClientRect().height > 0));
    assert.ok(await page.$eval('#pages .markdown-absolute', element => Math.abs(element.getBoundingClientRect().right - element.offsetParent.getBoundingClientRect().right) < 1));
    const html = await page.evaluate(() => exportHtml());
    assert.ok(html.includes('markdown-absolute') && html.includes('data:image/png;base64,'));
    const docx = await page.evaluate(async () => { const result = await exportDocx(); return { warnings: result.warnings, text: new TextDecoder().decode(await result.blob.arrayBuffer()) }; });
    assert.equal(docx.warnings, 0);
    assert.ok(docx.text.includes('<v:textbox') && docx.text.includes('mso-position-horizontal:right;'));
    assert.ok(docx.text.includes('word/media/image1.png'));
    assert.ok(!docx.text.includes('::: absolute'));
    await page.screenshot({ path: '/tmp/mdword-resume-absolute.png' });
    await page.setViewport({ width: 390, height: 844 });
    assert.ok(await page.$eval('#pages .markdown-absolute img', image => image.getBoundingClientRect().width > 0));
    assert.deepEqual(errors, []);
    console.log('PASS absolute: anchors, pixel offsets, safe options, fenced/malformed input, nested containers, pagination without duplication, offline resume photo and HTML/DOCX export');
  } finally { if (browser) await browser.close(); await fs.rm(temporary, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
