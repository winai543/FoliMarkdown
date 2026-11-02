"use strict";
let tableEditorSession = null;
function editableTableBlocks() {
  const blocks = [];
  let index = 0;
  visitMarkdownSource(markdownParser.lexer(editor.value), editor.value, (token, start) => {
    if (['columnRow', 'absoluteBlock'].includes(token.type)) return;
    if (token.type === 'table') blocks.push({ index, start, end: start + token.raw.length, settings: tableFromToken(token) });
    markdownParser.walkTokens([token], item => { if (item.type === 'table') index++; });
  });
  return blocks;
}
function tableChange(change, redraw = false) {
  const session = tableEditorSession;
  const previous = structuredClone(session.settings);
  try { change(session.settings); tableSource(session.settings); }
  catch (error) { session.settings = previous; $('#tableError').textContent = error.message; return; }
  session.undo.push(previous); if (session.undo.length > 100) session.undo.shift(); session.redo = [];
  if (redraw) fillTableForm(); else refreshTablePreview();
}
function tableHistory(direction) {
  const session = tableEditorSession;
  const source = direction === 'undo' ? session.undo : session.redo;
  const target = direction === 'undo' ? session.redo : session.undo;
  if (!source.length) return;
  target.push(structuredClone(session.settings)); session.settings = source.pop(); fillTableForm();
}
function tableButton(text, label, click, disabled = false) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'library-button';
  button.textContent = text; button.title = label; button.setAttribute('aria-label', label); button.disabled = disabled;
  button.addEventListener('click', click); return button;
}
function tableCellInput(value, row, column) {
  const input = document.createElement('input'); input.type = 'text'; input.value = value;
  input.dataset.row = row; input.dataset.column = column;
  input.setAttribute('aria-label', row === -1 ? `Column ${column + 1} heading` : `Row ${row + 1}, column ${column + 1}`);
  input.addEventListener('input', () => tableChange(settings => { (row === -1 ? settings.headers : settings.rows[row])[column] = input.value; }));
  input.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.ctrlKey || event.metaKey || event.isComposing) return;
    event.preventDefault();
    const next = Math.max(-1, row + (event.shiftKey ? -1 : 1));
    if (next >= tableEditorSession.settings.rows.length) {
      if (next >= TABLE_MAX_ROWS) return;
      tableChange(settings => settings.rows.push(settings.headers.map(() => '')), true);
    }
    $('#tableGrid').querySelector(`input[data-row="${next}"][data-column="${column}"]`)?.focus();
  });
  input.addEventListener('paste', event => {
    const text = event.clipboardData?.getData('text/plain');
    if (!text || !/[\t\r\n]/.test(text)) return;
    event.preventDefault();
    tableChange(settings => { tableEditorSession.settings = pasteTableCells(settings, row, column, text); }, true);
    $('#tableGrid').querySelector(`input[data-row="${row}"][data-column="${column}"]`)?.focus();
  });
  return input;
}
function moveTableColumn(index, step) {
  tableChange(settings => {
    for (const values of [settings.headers, settings.align, ...settings.rows]) [values[index], values[index + step]] = [values[index + step], values[index]];
  }, true);
}
function fillTableForm() {
  const settings = tableEditorSession.settings, columns = settings.headers.length;
  const grid = $('#tableGrid'); grid.replaceChildren();
  const head = grid.createTHead(), headings = head.insertRow();
  const corner = document.createElement('th'); corner.scope = 'col'; corner.textContent = 'Rows'; headings.append(corner);
  settings.headers.forEach((header, index) => {
    const th = document.createElement('th'); th.scope = 'col';
    const actions = document.createElement('div'); actions.className = 'table-column-actions';
    const number = document.createElement('span'); number.textContent = `Column ${index + 1}`;
    actions.append(number, tableButton('←', `Move column ${index + 1} left`, () => moveTableColumn(index, -1), index === 0),
      tableButton('→', `Move column ${index + 1} right`, () => moveTableColumn(index, 1), index === columns - 1),
      tableButton('×', `Remove column ${index + 1}`, () => tableChange(model => {
        model.headers.splice(index, 1); model.align.splice(index, 1); model.rows.forEach(row => row.splice(index, 1));
      }, true), columns === 1));
    const select = document.createElement('select');
    for (const [value, label] of [['', 'Default alignment'], ['left', 'Align left'], ['center', 'Align center'], ['right', 'Align right']]) select.add(new Option(label, value));
    select.value = settings.align[index] || ''; select.dataset.alignColumn = index; select.setAttribute('aria-label', `Column ${index + 1} alignment`);
    select.addEventListener('change', () => tableChange(model => { model.align[index] = select.value || null; }));
    th.append(actions, tableCellInput(header, -1, index), select); headings.append(th);
  });
  const body = grid.createTBody();
  settings.rows.forEach((cells, row) => {
    const tr = body.insertRow(), controls = document.createElement('th'); controls.scope = 'row';
    const number = document.createElement('span'); number.textContent = `${row + 1}`;
    const actions = document.createElement('div'); actions.className = 'table-row-actions';
    const move = step => tableChange(model => { [model.rows[row], model.rows[row + step]] = [model.rows[row + step], model.rows[row]]; }, true);
    actions.append(tableButton('↑', `Move row ${row + 1} up`, () => move(-1), row === 0),
      tableButton('↓', `Move row ${row + 1} down`, () => move(1), row === settings.rows.length - 1),
      tableButton('×', `Remove row ${row + 1}`, () => tableChange(model => model.rows.splice(row, 1), true)));
    controls.append(number, actions); tr.append(controls);
    cells.forEach((cell, column) => { const td = tr.insertCell(); td.append(tableCellInput(cell, row, column)); });
  });
  refreshTablePreview();
}
function refreshTablePreview() {
  const settings = tableEditorSession.settings;
  $('#tableError').textContent = '';
  $('#tableUndo').disabled = !tableEditorSession.undo.length; $('#tableRedo').disabled = !tableEditorSession.redo.length;
  $('#tableAddRow').disabled = settings.rows.length >= TABLE_MAX_ROWS;
  $('#tableAddColumn').disabled = settings.headers.length >= TABLE_MAX_COLUMNS;
  $('#tableSize').textContent = `${settings.headers.length} columns · ${settings.rows.length} data rows`;
  const source = tableSource(settings);
  const preview = document.createElement('div'); preview.innerHTML = renderMarkdown(source).html;
  preview.querySelectorAll('.table-editor-caption').forEach(caption => caption.remove());
  $('#tablePreview').replaceChildren(...preview.childNodes);
  $('#tableCode').textContent = source;
}
function openTableEditor(index = null) {
  if (!ready || !$('#libraryOverlay').hidden || document.querySelector('dialog[open]')) return;
  const block = index === null ? editableTableBlocks().find(item => editor.selectionStart >= item.start && editor.selectionStart < item.end)
    : editableTableBlocks().find(item => item.index === index);
  if (block && !block.settings) { toast(`This table exceeds the form limits (${TABLE_MAX_COLUMNS} columns, ${TABLE_MAX_ROWS} rows). Edit it in Markdown.`); return; }
  tableEditorSession = { settings: block?.settings || tableDefaults(), block, text: editor.value, documentId: activeId,
    start: editor.selectionStart, end: editor.selectionEnd, focus: document.activeElement, undo: [], redo: [] };
  $('#tableDialogTitle').textContent = block ? 'Edit table' : 'Create table';
  $('#tableSave').textContent = block ? 'Save changes' : 'Insert into document';
  $('#tableDialog').showModal(); fillTableForm(); $('#tableGrid input')?.focus();
}
function initializeTableEditor() {
  const dialog = $('#tableDialog');
  $('#tableAddRow').addEventListener('click', () => {
    tableChange(settings => settings.rows.push(settings.headers.map(() => '')), true);
    $('#tableGrid').querySelector('tbody tr:last-child input')?.focus();
  });
  $('#tableAddColumn').addEventListener('click', () => {
    tableChange(settings => { settings.headers.push(`Column ${settings.headers.length + 1}`); settings.align.push(null); settings.rows.forEach(row => row.push('')); }, true);
    $('#tableGrid').querySelector('thead th:last-child input')?.focus();
  });
  $('#tableUndo').addEventListener('click', () => tableHistory('undo'));
  $('#tableRedo').addEventListener('click', () => tableHistory('redo'));
  $('#tableCancel').addEventListener('click', () => dialog.close()); $('#tableClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { if (dialog.open) return; tableEditorSession?.focus?.focus(); tableEditorSession = null; });
  $('#tableForm').addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing) { event.preventDefault(); $('#tableForm').requestSubmit(); }
  });
  $('#tableForm').addEventListener('submit', event => {
    event.preventDefault(); const session = tableEditorSession;
    if (activeId !== session.documentId || editor.value !== session.text) { $('#tableError').textContent = 'The document changed. Close this form and open it again.'; return; }
    let source;
    try { source = tableSource(session.settings); } catch (error) { $('#tableError').textContent = error.message; return; }
    if (session.block) {
      const trailing = editor.value.slice(session.block.start, session.block.end).match(/\n*$/)[0];
      editor.setRangeText(source + trailing, session.block.start, session.block.end, 'end'); update(true);
    } else { editor.setSelectionRange(session.start, session.end); insertBlock(source); }
    dialog.close(); toast(session.block ? 'Table updated' : 'Table inserted');
  });
}
