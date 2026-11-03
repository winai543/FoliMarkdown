"use strict";
const TABLE_MAX_COLUMNS = 20;
const TABLE_MAX_ROWS = 200;
function tableColumnProfiles(token) {
  const numericHeading = /\b(?:amount|balance|cost|discount|fee|price|quantity|qty|rate|revenue|subtotal|tax|total|units?)\b|(?:จำนวน|ราคา|ยอด|ภาษี|ส่วนลด)/i;
  const numericValue = /^\(?[+-]?\s*[$€£¥฿]?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*%?\)?$/;
  return token.header.map((cell, index) => {
    const heading = (cell.text || "").trim();
    const values = token.rows.map(row => (row[index]?.text || "").trim()).filter(Boolean);
    const inferredNumeric = numericHeading.test(heading) || (values.length > 0 && values.filter(value => numericValue.test(value)).length / values.length >= .75);
    const numeric = inferredNumeric;
    const longest = values.reduce((length, value) => Math.max(length, value.length), heading.length);
    const weight = numeric ? (/\b(?:qty|quantity|units?)\b|จำนวน/i.test(heading) ? .9 : 1.45)
      : Math.min(4.2, Math.max(2.1, 1.8 + Math.sqrt(longest) / 4));
    return { numeric, weight };
  });
}
function tableDefaults() {
  return { headers: ['Item', 'Description', 'Status'], align: [null, null, null],
    rows: [['First item', 'Add details', 'Draft'], ['Second item', 'Add details', 'Planned']] };
}
function tableSource(settings) {
  const columns = settings.headers.length;
  if (!columns || columns > TABLE_MAX_COLUMNS || settings.rows.length > TABLE_MAX_ROWS) throw new Error(`Use 1–${TABLE_MAX_COLUMNS} columns and up to ${TABLE_MAX_ROWS} data rows.`);
  if (settings.align.length !== columns || settings.rows.some(row => row.length !== columns)) throw new Error('Every row must have the same number of columns.');
  if (settings.align.some(align => ![null, 'left', 'center', 'right'].includes(align))) throw new Error('Choose a valid column alignment.');
  const cell = value => {
    if (typeof value !== 'string' || /[\r\n\u0000]/.test(value)) throw new Error('Use one line of text per cell.');
    return value.trim().replace(/(\\*)\|/g, (_, slashes) => slashes + (slashes.length % 2 ? '' : '\\') + '|');
  };
  const row = cells => `| ${cells.map(cell).join(' | ')} |`;
  return [row(settings.headers), row(settings.align.map(align => ({ left: ':---', center: ':---:', right: '---:' })[align] || '---')),
    ...settings.rows.map(row)].join('\n');
}
function tableFromToken(token) {
  if (token.type !== 'table') return null;
  const settings = { headers: token.header.map(cell => cell.text), align: [...token.align], rows: token.rows.map(row => row.map(cell => cell.text)) };
  try { tableSource(settings); return settings; } catch { return null; }
}
function pasteTableCells(settings, row, column, text) {
  if (!Number.isInteger(row) || row < -1 || !Number.isInteger(column) || column < 0) throw new Error('Choose a valid destination cell.');
  const values = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map(line => line.split('\t'));
  const result = structuredClone(settings);
  const columns = Math.max(result.headers.length, column + Math.max(...values.map(cells => cells.length)));
  const dataRows = Math.max(result.rows.length, row + values.length);
  if (columns > TABLE_MAX_COLUMNS || dataRows > TABLE_MAX_ROWS) throw new Error(`Pasted data exceeds ${TABLE_MAX_COLUMNS} columns or ${TABLE_MAX_ROWS} rows.`);
  while (result.headers.length < columns) { result.headers.push(`Column ${result.headers.length + 1}`); result.align.push(null); }
  while (result.rows.length < dataRows) result.rows.push([]);
  result.rows.forEach(cells => { while (cells.length < columns) cells.push(''); });
  values.forEach((cells, index) => {
    const destination = row + index === -1 ? result.headers : result.rows[row + index];
    cells.forEach((value, offset) => { destination[column + offset] = value; });
  });
  tableSource(result);
  return result;
}
