"use strict";
let diagramEditorSession = null;
let diagramEditorTimer;
let diagramEditorVersion = 0;
let diagramFieldSerial = 0;

function diagramChange(change, redraw = false) {
  const session = diagramEditorSession;
  session.undo.push(structuredClone(session.settings));
  if (session.undo.length > 100) session.undo.shift();
  session.redo = [];
  change(session.settings);
  if (redraw) fillDiagramForm();
  else { refreshDiagramEndpoints(); scheduleDiagramPreview(); }
}
function diagramHistory(direction) {
  const session = diagramEditorSession;
  const source = direction === 'undo' ? session.undo : session.redo;
  const target = direction === 'undo' ? session.redo : session.undo;
  if (!source.length) return;
  target.push(structuredClone(session.settings));
  session.settings = source.pop();
  fillDiagramForm();
}
function diagramButton(text, label, click, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'library-button'; button.textContent = text;
  button.title = label; button.setAttribute('aria-label', label); button.disabled = disabled;
  setEditorButtonIcon(button, text);
  button.addEventListener('click', click);
  return button;
}
function diagramField(label, value, change, options = null) {
  const wrapper = document.createElement('div'); wrapper.className = 'chart-field';
  const caption = document.createElement('label');
  const control = document.createElement(options ? 'select' : 'input');
  control.id = `diagramField${++diagramFieldSerial}`; caption.htmlFor = control.id; caption.textContent = label;
  if (options) for (const [key, text] of Object.entries(options)) control.add(new Option(text, key));
  else { control.type = 'text'; control.maxLength = 200; }
  control.value = value;
  control.addEventListener('input', () => diagramChange(() => change(control.value)));
  wrapper.append(caption, control);
  return wrapper;
}
function diagramEndpoint(label, value, change) {
  const options = Object.create(null); options[''] = 'Choose…';
  diagramEditorSession.settings.nodes.forEach((node, index) => { options[node.id] = `${index + 1}. ${node.label || 'Unnamed'}`; });
  const field = diagramField(label, value, change, options);
  field.querySelector('select').dataset.endpoint = 'true';
  return field;
}
function refreshDiagramEndpoints() {
  if (diagramEditorSession.settings.type === 'diagramTimeline') return;
  for (const select of $('#diagramDialog').querySelectorAll('[data-endpoint]')) {
    const value = select.value;
    select.replaceChildren(new Option('Choose…', ''));
    diagramEditorSession.settings.nodes.forEach((node, index) => select.add(new Option(`${index + 1}. ${node.label || 'Unnamed'}`, node.id)));
    select.value = value;
  }
}
function diagramCard(title, list, index, remove) {
  const card = document.createElement('div'); card.className = 'diagram-card';
  const header = document.createElement('div'); header.className = 'diagram-card-head';
  const heading = document.createElement('h4'); heading.textContent = title;
  const controls = document.createElement('div'); controls.className = 'diagram-card-actions';
  const move = step => diagramChange(() => { [list[index], list[index + step]] = [list[index + step], list[index]]; }, true);
  controls.append(
    diagramButton('↑', `Move ${title.toLowerCase()} up`, () => move(-1), index === 0),
    diagramButton('↓', `Move ${title.toLowerCase()} down`, () => move(1), index === list.length - 1),
    diagramButton('×', `Remove ${title.toLowerCase()}`, () => diagramChange(remove, true))
  );
  header.append(heading, controls); card.append(header);
  return card;
}
function diagramPair(...fields) {
  const pair = document.createElement('div'); pair.className = 'chart-field-pair'; pair.append(...fields); return pair;
}
function fillDiagramForm() {
  const settings = diagramEditorSession.settings;
  const flow = settings.type === 'diagramFlow', sequence = settings.type === 'diagramSequence';
  const timeline = settings.type === 'diagramTimeline';
  $('#diagramTimelineTitleField').hidden = !timeline;
  $('#diagramTimelineTitle').value = timeline ? settings.title : '';
  $('#diagramLinksHeading').hidden = timeline;
  $('#diagramLinks').hidden = timeline;
  $('#diagramType').value = settings.type;
  $('#diagramDirectionField').hidden = !flow;
  $('#diagramDirection').value = settings.direction || 'LR';
  $('#diagramNumberingField').hidden = !sequence;
  $('#diagramNumbering').checked = !!settings.autonumber;
  if (timeline) {
    $('#diagramNodeHeading').textContent = 'Milestones';
    $('#diagramAddNode').textContent = '＋ Add milestone';
    $('#diagramFormHelp').textContent = 'Enter a title, periods, and events. Use ↑ and ↓ to reorder milestones.';
    $('#diagramRemoveHelp').textContent = 'Use Undo to restore removed milestones.';
    $('#diagramLinks').replaceChildren();
    const rows = $('#diagramNodes'); rows.replaceChildren();
    settings.rows.forEach((row, index) => {
      const card = diagramCard(`Milestone ${index + 1}`, settings.rows, index, () => settings.rows.splice(index, 1));
      card.dataset.milestoneIndex = index;
      card.append(diagramPair(diagramField('Period', row[0], value => { row[0] = value; }), diagramField('Event', row[1], value => { row[1] = value; })));
      rows.append(card);
    });
    scheduleDiagramPreview();
    return;
  }
  $('#diagramNodeHeading').textContent = flow ? 'Steps' : sequence ? 'Participants' : 'Entities';
  $('#diagramLinkHeading').textContent = flow ? 'Connections' : sequence ? 'Messages (in order)' : 'Relationships';
  $('#diagramAddNode').textContent = flow ? '＋ Add step' : sequence ? '＋ Add participant' : '＋ Add entity';
  $('#diagramAddLink').textContent = flow ? '＋ Add connection' : sequence ? '＋ Add message' : '＋ Add relationship';
  $('#diagramAddLink').disabled = !settings.nodes.length;
  $('#diagramFormHelp').textContent = flow ? 'Choose shapes and connect steps. Arrow labels can be left empty.'
    : sequence ? 'Participants appear from left to right. Use ↑ and ↓ to reorder messages.'
    : 'Use letters, numbers, and underscores for entity and field names. PK = primary key, FK = foreign key, UK = unique key.';
  $('#diagramRemoveHelp').textContent = 'Removing an element also removes its connections. Use Undo to restore it.';
  const nodes = $('#diagramNodes'); nodes.replaceChildren();
  settings.nodes.forEach((node, index) => {
    const title = `${flow ? 'Step' : sequence ? 'Participant' : 'Entity'} ${index + 1}`;
    const card = diagramCard(title, settings.nodes, index, () => {
      settings.nodes.splice(index, 1); settings.links = settings.links.filter(link => link.from !== node.id && link.to !== node.id);
    });
    card.dataset.nodeId = node.id;
    const label = diagramField(flow ? 'Label' : sequence ? 'Name' : 'Entity name', node.label, value => { node.label = value; });
    label.querySelector('input').dataset.nodeLabel = 'true';
    if (flow) card.append(diagramPair(label, diagramField('Shape', node.shape, value => { node.shape = value; }, FLOW_SHAPES)));
    else if (sequence) card.append(diagramPair(label, diagramField('Style', node.role, value => { node.role = value; }, { participant: 'Participant', actor: 'Actor' })));
    else {
      card.append(label);
      const fields = document.createElement('div'); fields.className = 'diagram-attributes';
      node.attributes.forEach((attribute, fieldIndex) => {
        const row = document.createElement('div'); row.className = 'diagram-attribute-row'; row.dataset.attributeIndex = fieldIndex;
        const type = diagramField('Type', attribute.type, value => { attribute.type = value; });
        type.querySelector('input').setAttribute('list', 'diagramAttributeTypes');
        const name = diagramField('Field', attribute.name, value => { attribute.name = value; });
        const key = diagramField('Key', attribute.key, value => { attribute.key = value; }, { '': 'None', PK: 'PK', FK: 'FK', UK: 'UK', 'PK, FK': 'PK + FK', 'PK, UK': 'PK + UK', 'FK, UK': 'FK + UK', 'PK, FK, UK': 'PK + FK + UK' });
        row.append(type, name, key, diagramButton('×', `Remove field ${fieldIndex + 1}`, () => diagramChange(() => node.attributes.splice(fieldIndex, 1), true)));
        fields.append(row);
      });
      card.append(fields, diagramButton('＋ Add field', `Add field to ${node.label || title}`, () => diagramChange(() => {
        let number = 1; while (node.attributes.some(attribute => attribute.name === `field_${number}`)) number++;
        node.attributes.push({ type: 'string', name: `field_${number}`, key: '' });
      }, true)));
    }
    nodes.append(card);
  });
  if (!settings.nodes.length) { const empty = document.createElement('p'); empty.className = 'chart-help'; empty.textContent = 'Add an element to get started.'; nodes.append(empty); }
  const links = $('#diagramLinks'); links.replaceChildren();
  settings.links.forEach((link, index) => {
    const title = `${flow ? 'Connection' : sequence ? 'Message' : 'Relationship'} ${index + 1}`;
    const card = diagramCard(title, settings.links, index, () => settings.links.splice(index, 1));
    card.dataset.linkIndex = index;
    card.append(diagramPair(diagramEndpoint('From', link.from, value => { link.from = value; }), diagramEndpoint('To', link.to, value => { link.to = value; })));
    if (flow || sequence) {
      card.append(diagramPair(diagramField(sequence ? 'Message' : 'Label (optional)', link.label, value => { link.label = value; }),
        diagramField('Style', link.kind, value => { link.kind = value; }, flow ? FLOW_LINES : SEQUENCE_LINES)));
    } else {
      card.append(diagramPair(diagramField('From cardinality', link.left, value => { link.left = value; }, ER_CARDINALITIES),
        diagramField('To cardinality', link.right, value => { link.right = value; }, ER_CARDINALITIES)));
      card.append(diagramPair(diagramField('Relationship label', link.label, value => { link.label = value; }),
        diagramField('Relationship type', String(link.identifying), value => { link.identifying = value === 'true'; }, { true: 'Identifying (solid)', false: 'Non-identifying (dashed)' })));
    }
    links.append(card);
  });
  if (!settings.links.length) { const empty = document.createElement('p'); empty.className = 'chart-help'; empty.textContent = sequence ? 'Add a message to describe the interaction.' : 'No connections yet. Add one to connect your elements.'; links.append(empty); }
  scheduleDiagramPreview();
}
function scheduleDiagramPreview() {
  clearTimeout(diagramEditorTimer);
  const version = ++diagramEditorVersion;
  $('#diagramUndo').disabled = !diagramEditorSession.undo.length;
  $('#diagramRedo').disabled = !diagramEditorSession.redo.length;
  let source;
  try {
    source = diagramSource(diagramEditorSession.settings);
    $('#diagramError').textContent = ''; $('#diagramSave').disabled = false;
  } catch (error) {
    $('#diagramError').textContent = error.message; $('#diagramSave').disabled = true;
    $('#diagramCode').textContent = ''; $('#diagramPreview').textContent = 'Complete the form to see a preview.';
    $('#diagramPreviewStatus').textContent = 'Check the settings';
    return;
  }
  $('#diagramCode').textContent = source;
  $('#diagramPreviewStatus').textContent = 'Updating preview…';
  diagramEditorTimer = setTimeout(() => {
    diagramWork = diagramWork.catch(() => {}).then(async () => {
      if (version !== diagramEditorVersion || !$('#diagramDialog').open) return;
      const renderId = `folimarkdown-diagram-builder-${++diagramSerial}`;
      try {
        const mermaid = await loadMermaid();
        const result = await mermaid.render(renderId, source);
        if (version !== diagramEditorVersion || !$('#diagramDialog').open) return;
        $('#diagramPreview').innerHTML = result.svg;
        $('#diagramPreviewStatus').textContent = 'Preview up to date';
      } catch {
        document.getElementById(`d${renderId}`)?.remove();
        if (version !== diagramEditorVersion || !$('#diagramDialog').open) return;
        $('#diagramPreview').textContent = 'Preview unavailable. Check your connection. You can still save valid settings.';
        $('#diagramPreviewStatus').textContent = 'Preview unavailable';
      }
    });
  }, 250);
}
function openDiagramEditor(type = 'diagramFlow', index = null) {
  if (!ready || !$('#libraryOverlay').hidden || document.querySelector('dialog[open]')) return;
  const block = index === null ? editableChartBlocks().find(item => editor.selectionStart >= item.start && editor.selectionStart < item.end)
    : editableChartBlocks().find(item => item.index === index);
  const parsed = block && parseDiagramSource(block.source);
  if (block && !parsed) { toast('This block uses other or advanced Mermaid syntax. Edit its source in Markdown.'); return; }
  const settings = parsed || diagramDefaults(type);
  diagramEditorSession = { settings, block, text: editor.value, documentId: activeId, start: editor.selectionStart, end: editor.selectionEnd,
    focus: document.activeElement, undo: [], redo: [], drafts: new Map() };
  $('#diagramDialogTitle').textContent = block ? 'Edit diagram' : 'Create diagram';
  $('#diagramSave').textContent = block ? 'Save changes' : 'Insert into document';
  $('#diagramPreview').textContent = 'Preparing preview…';
  $('#diagramDialog').showModal(); fillDiagramForm(); $('#diagramType').focus();
}
function initializeDiagramEditor() {
  const dialog = $('#diagramDialog');
  $('#diagramType').addEventListener('change', event => {
    const session = diagramEditorSession, next = event.target.value;
    session.drafts.set(session.settings.type, structuredClone(session.settings));
    diagramChange(() => { session.settings = structuredClone(session.drafts.get(next) || diagramDefaults(next)); }, true);
  });
  $('#diagramTimelineTitle').addEventListener('input', event => diagramChange(settings => { settings.title = event.target.value; }));
  $('#diagramDirection').addEventListener('change', event => diagramChange(settings => { settings.direction = event.target.value; }));
  $('#diagramNumbering').addEventListener('change', event => diagramChange(settings => { settings.autonumber = event.target.checked; }));
  $('#diagramAddNode').addEventListener('click', () => {
    diagramChange(settings => {
    if (settings.type === 'diagramTimeline') { settings.rows.push(['', '']); return; }
    let number = 1; while (settings.nodes.some(node => node.id === `N${number}`)) number++;
    const node = { id: `N${number}`, label: settings.type === 'diagramER' ? `ENTITY_${number}` : settings.type === 'diagramSequence' ? `Participant ${number}` : `Step ${number}` };
    if (settings.type === 'diagramER') {
      let suffix = number; while (settings.nodes.some(item => item.label === node.label)) node.label = `ENTITY_${++suffix}`;
      node.attributes = [{ type: 'int', name: 'id', key: 'PK' }];
    } else if (settings.type === 'diagramSequence') node.role = 'participant';
    else node.shape = 'box';
    settings.nodes.push(node);
    }, true);
    const input = $('#diagramNodes').lastElementChild?.querySelector('[data-node-label], input');
    input?.focus(); input?.select();
  });
  $('#diagramAddLink').addEventListener('click', () => {
    diagramChange(settings => {
    const link = { from: settings.nodes[0]?.id || '', to: settings.nodes.at(-1)?.id || '', label: settings.type === 'diagramSequence' ? 'Message' : settings.type === 'diagramER' ? 'relates_to' : '' };
    if (settings.type === 'diagramER') Object.assign(link, { left: 'one', right: 'zeroMany', identifying: true });
    else link.kind = settings.type === 'diagramSequence' ? '->>' : '-->';
    settings.links.push(link);
    }, true);
    $('#diagramLinks').lastElementChild?.querySelector('select')?.focus();
  });
  $('#diagramUndo').addEventListener('click', () => diagramHistory('undo'));
  $('#diagramRedo').addEventListener('click', () => diagramHistory('redo'));
  $('#diagramCancel').addEventListener('click', () => dialog.close());
  $('#diagramClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    clearTimeout(diagramEditorTimer); diagramEditorVersion++;
    diagramEditorSession?.focus?.focus(); diagramEditorSession = null;
  });
  $('#diagramForm').addEventListener('submit', event => {
    event.preventDefault(); const session = diagramEditorSession;
    if (activeId !== session.documentId || editor.value !== session.text) { $('#diagramError').textContent = 'The document changed. Close this form and open it again.'; return; }
    let source;
    try { source = diagramSource(session.settings); } catch (error) { $('#diagramError').textContent = error.message; return; }
    if (session.block) {
      const trailing = editor.value.slice(session.block.start, session.block.end).match(/\n*$/)[0];
      editor.setRangeText(`\`\`\`mermaid\n${source}\n\`\`\`${trailing}`, session.block.start, session.block.end, 'end'); update(true);
    } else { editor.setSelectionRange(session.start, session.end); insertMermaid(source); }
    dialog.close(); toast(session.block ? 'Diagram updated' : 'Diagram inserted');
  });
}
