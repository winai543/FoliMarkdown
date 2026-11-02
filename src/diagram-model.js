"use strict";
const DIAGRAM_TYPES = { diagramFlow: "Flowchart", diagramSequence: "Sequence", diagramER: "ER Diagram", diagramTimeline: "Timeline" };
const FLOW_SHAPES = { box: "Process", rounded: "Start / end", diamond: "Decision", circle: "Circle" };
const FLOW_LINES = { '-->': "Arrow", '-.->': "Dashed arrow", '==>': "Thick arrow", '---': "Line" };
const SEQUENCE_LINES = { '->>': "Message", '-->>': "Reply", '->': "Open arrow", '-->': "Dashed open arrow", '-x': "Cross", '--x': "Dashed cross", '-)': "Async message", '--)': "Async reply" };
const ER_CARDINALITIES = { one: "Exactly one (1)", zeroOne: "Zero or one (0..1)", many: "One or more (1..*)", zeroMany: "Zero or more (0..*)" };
const ER_LEFT = { one: '||', zeroOne: '|o', many: '}|', zeroMany: '}o' };
const ER_RIGHT = { one: '||', zeroOne: 'o|', many: '|{', zeroMany: 'o{' };
function diagramDefaults(type) {
  if (type === 'diagramTimeline') return chartDefaults(type);
  if (type === 'diagramFlow') return { type, direction: 'LR', nodes: [
    { id: 'A', label: 'Start', shape: 'rounded' }, { id: 'B', label: 'Approved?', shape: 'diamond' },
    { id: 'C', label: 'Proceed', shape: 'box' }, { id: 'D', label: 'Revise', shape: 'box' }
  ], links: [{ from: 'A', to: 'B', kind: '-->', label: '' }, { from: 'B', to: 'C', kind: '-->', label: 'Yes' }, { from: 'B', to: 'D', kind: '-->', label: 'No' }, { from: 'D', to: 'B', kind: '-->', label: '' }] };
  if (type === 'diagramSequence') return { type, autonumber: false,
    nodes: [{ id: 'U', label: 'User', role: 'actor' }, { id: 'S', label: 'System', role: 'participant' }],
    links: [{ from: 'U', to: 'S', kind: '->>', label: 'Request' }, { from: 'S', to: 'U', kind: '-->>', label: 'Response' }] };
  return { type: 'diagramER', nodes: [
    { id: 'USER', label: 'USER', attributes: [{ type: 'int', name: 'id', key: 'PK' }, { type: 'string', name: 'name', key: '' }] },
    { id: 'ORDER', label: 'ORDER', attributes: [{ type: 'int', name: 'id', key: 'PK' }, { type: 'int', name: 'user_id', key: 'FK' }] }
  ], links: [{ from: 'USER', to: 'ORDER', left: 'one', right: 'zeroMany', identifying: true, label: 'places' }] };
}
function diagramText(value, name, optional = false) {
  if (typeof value !== 'string' || /[\r\n\u0000-\u001f]/.test(value)) throw new Error(`${name} must be a single line of text.`);
  if (!optional && !value.trim()) throw new Error(`Enter ${name.toLowerCase()}.`);
  return value.trim();
}
function diagramSource(settings) {
  if (settings.type === 'diagramTimeline') return chartSource(settings);
  if (!DIAGRAM_TYPES[settings.type]) throw new Error('Choose a diagram type.');
  if (!settings.nodes.length) throw new Error('Add at least one step, participant, or entity.');
  const ids = new Set(), names = new Set();
  const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
  for (const node of settings.nodes) {
    if (!identifier.test(node.id) || node.id === 'end' || ids.has(node.id)) throw new Error('Each element must have a unique valid identifier.');
    ids.add(node.id);
    const label = diagramText(node.label, settings.type === 'diagramER' ? 'Entity name' : 'Label');
    if (settings.type === 'diagramFlow' && !Object.hasOwn(FLOW_SHAPES, node.shape)) throw new Error('Choose a step shape.');
    if (settings.type === 'diagramSequence' && !['actor', 'participant'].includes(node.role)) throw new Error('Choose a participant style.');
    if (settings.type === 'diagramER') {
      if (!identifier.test(label) || names.has(label)) throw new Error('Entity names must be unique and use letters, numbers, or underscores, starting with a letter or underscore.');
      names.add(label);
      const fields = new Set();
      for (const attribute of node.attributes) {
        if (!/^[A-Za-z_][A-Za-z0-9_\[\](),-]*$/.test(attribute.type)) throw new Error('Enter a field type, such as int, string, or varchar(255).');
        if (!identifier.test(attribute.name) || fields.has(attribute.name)) throw new Error('Field names must be unique within an entity and use letters, numbers, or underscores.');
        if (!['', 'PK', 'FK', 'UK', 'PK, FK', 'PK, UK', 'FK, UK', 'PK, FK, UK'].includes(attribute.key)) throw new Error('Choose a supported key.');
        fields.add(attribute.name);
      }
    }
  }
  const quote = text => `"${chartEncode(text.trim()).replace(/\|/g, '#124;').replace(/%/g, '#37;')}"`;
  for (const link of settings.links) {
    if (!ids.has(link.from) || !ids.has(link.to)) throw new Error('Choose both ends of each connection.');
    diagramText(link.label, settings.type === 'diagramSequence' ? 'Message' : 'Connection label', settings.type === 'diagramFlow');
    if (settings.type === 'diagramFlow' && !Object.hasOwn(FLOW_LINES, link.kind)) throw new Error('Choose a connection style.');
    if (settings.type === 'diagramSequence' && !Object.hasOwn(SEQUENCE_LINES, link.kind)) throw new Error('Choose a message style.');
    if (settings.type === 'diagramER' && (!Object.hasOwn(ER_LEFT, link.left) || !Object.hasOwn(ER_RIGHT, link.right))) throw new Error('Choose the cardinality at both ends.');
  }
  if (settings.type === 'diagramFlow') {
    if (!['LR', 'RL', 'TB', 'TD', 'BT'].includes(settings.direction)) throw new Error('Choose a flow direction.');
    const shapes = { box: ['[', ']'], rounded: ['(', ')'], diamond: ['{', '}'], circle: ['((', '))'] };
    return [`flowchart ${settings.direction}`, ...settings.nodes.map(node => `    ${node.id}${shapes[node.shape][0]}${quote(node.label)}${shapes[node.shape][1]}`),
      ...settings.links.map(link => `    ${link.from} ${link.kind}${link.label.trim() ? `|${quote(link.label)}|` : ''} ${link.to}`)].join('\n');
  }
  if (settings.type === 'diagramSequence') {
    if (!settings.links.length) throw new Error('Add at least one message.');
    const text = value => chartEncode(value.trim()).replace(/%/g, '#37;');
    return ['sequenceDiagram', ...(settings.autonumber ? ['    autonumber'] : []),
      ...settings.nodes.map(node => `    ${node.role} ${node.id} as ${text(node.label)}`),
      ...settings.links.map(link => `    ${link.from}${link.kind}${link.to}: ${text(link.label)}`)].join('\n');
  }
  const entity = id => settings.nodes.find(node => node.id === id).label.trim();
  return ['erDiagram', ...settings.nodes.map(node => node.attributes.length
    ? `    ${node.label.trim()} {\n${node.attributes.map(attribute => `        ${attribute.type} ${attribute.name}${attribute.key ? ' ' + attribute.key : ''}`).join('\n')}\n    }`
    : `    ${node.label.trim()}`), ...settings.links.map(link => `    ${entity(link.from)} ${ER_LEFT[link.left]}${link.identifying ? '--' : '..'}${ER_RIGHT[link.right]} ${entity(link.to)} : ${quote(link.label)}`)].join('\n');
}
function diagramDecode(text) {
  return chartDecode(text.replace(/#(124|37);/g, (_, code) => code === '124' ? '|' : '%'));
}
function parseDiagramSource(source) {
  const timeline = parseChartSource(source);
  if (timeline?.type === 'diagramTimeline') return timeline;
  const lines = source.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const nodes = [], links = [];
  let settings;
  const id = '[A-Za-z_][A-Za-z0-9_]*';
  const add = (name, extra = {}) => {
    let node = nodes.find(item => item.id === name);
    if (!node) { node = { id: name, label: name, ...extra }; nodes.push(node); }
    return node;
  };
  if (/^(flowchart|graph) (LR|RL|TB|TD|BT)$/.test(lines[0])) {
    settings = { type: 'diagramFlow', direction: lines[0].split(' ')[1], nodes, links };
    const readNode = input => {
      const match = new RegExp(`^(${id})`).exec(input);
      if (!match) return null;
      let rest = input.slice(match[0].length).trim();
      let label = null, shape = 'box';
      for (const [open, close, kind] of [['((', '))', 'circle'], ['[', ']', 'box'], ['{', '}', 'diamond'], ['(', ')', 'rounded']]) {
        if (!rest.startsWith(open)) continue;
        const content = rest.slice(open.length);
        if (content.startsWith('"')) {
          const quoted = /^"([^"\n]*)"/.exec(content);
          if (!quoted || !content.slice(quoted[0].length).startsWith(close)) return null;
          label = quoted[1]; rest = content.slice(quoted[0].length + close.length).trim();
        } else {
          const end = content.indexOf(close);
          if (end < 0 || content.slice(0, end).includes('"')) return null;
          label = content.slice(0, end); rest = content.slice(end + close.length).trim();
        }
        shape = kind; break;
      }
      const node = add(match[1], { shape: 'box' });
      if (label !== null) {
        label = diagramDecode(label);
        if (node.defined && (node.label !== label || node.shape !== shape)) return null;
        Object.assign(node, { label, shape, defined: true });
      }
      return { node, rest };
    };
    for (const line of lines.slice(1)) {
      const from = readNode(line);
      if (!from) return null;
      if (!from.rest) continue;
      const labeled = /^(-->|-\.->|==>|---)(?:\|(?:"([^"\n]*)"|([^|"\n]+))\|)?\s*(.+)$/.exec(from.rest);
      let edge = labeled ? ['', labeled[1], labeled[2] ?? labeled[3] ?? '', labeled[4]] : null;
      if (!edge) {
        const legacy = /^--\s+([^|]+?)\s+-->\s*(.+)$/.exec(from.rest);
        if (legacy) edge = ['', '-->', legacy[1].trim(), legacy[2]];
      }
      if (!edge) return null;
      const to = readNode(edge[3]);
      if (!to || to.rest) return null;
      links.push({ from: from.node.id, to: to.node.id, kind: edge[1], label: diagramDecode(edge[2] || '') });
    }
    nodes.forEach(node => delete node.defined);
  } else if (lines[0] === 'sequenceDiagram') {
    settings = { type: 'diagramSequence', autonumber: false, nodes, links };
    for (const line of lines.slice(1)) {
      if (line === 'autonumber' && !settings.autonumber) { settings.autonumber = true; continue; }
      const participant = new RegExp(`^(participant|actor) (${id})(?: as (.+))?$`).exec(line);
      if (participant) {
        if (nodes.some(node => node.id === participant[2])) return null;
        add(participant[2], { label: diagramDecode(participant[3] || participant[2]), role: participant[1] });
        continue;
      }
      const message = new RegExp(`^(${id})\\s*(-->>|->>|-->|->|--x|-x|--\\)|-\\))\\s*(${id})\\s*:\\s*(.+)$`).exec(line);
      if (!message) return null;
      add(message[1], { role: 'participant' }); add(message[3], { role: 'participant' });
      links.push({ from: message[1], kind: message[2], to: message[3], label: diagramDecode(message[4]) });
    }
  } else if (lines[0] === 'erDiagram') {
    settings = { type: 'diagramER', nodes, links };
    let active = null;
    for (const line of lines.slice(1)) {
      if (active) {
        if (line === '}') { active = null; continue; }
        const field = /^([A-Za-z_][A-Za-z0-9_\[\](),-]*)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+((?:PK|FK|UK)(?:,\s*(?:PK|FK|UK))*))?$/.exec(line);
        if (!field) return null;
        active.attributes.push({ type: field[1], name: field[2], key: field[3] ? field[3].split(/,\s*/).sort((a, b) => ['PK', 'FK', 'UK'].indexOf(a) - ['PK', 'FK', 'UK'].indexOf(b)).join(', ') : '' });
        continue;
      }
      const declaration = new RegExp(`^(${id})(?:\\s*\\{)?$`).exec(line);
      if (declaration) {
        const node = add(declaration[1], { attributes: [] });
        if (line.endsWith('{')) { if (node.defined) return null; node.defined = true; active = node; }
        continue;
      }
      const relationship = new RegExp(`^(${id})\\s+(\\|\\||\\|o|}\\||}o)(--|\\.\\.)(\\|\\||o\\||\\|\\{|o\\{)\\s+(${id})\\s*:\\s*(?:"([^"\\n]*)"|([^"\\n]+))$`).exec(line);
      if (!relationship) return null;
      add(relationship[1], { attributes: [] }); add(relationship[5], { attributes: [] });
      links.push({ from: relationship[1], to: relationship[5], left: Object.keys(ER_LEFT).find(key => ER_LEFT[key] === relationship[2]), right: Object.keys(ER_RIGHT).find(key => ER_RIGHT[key] === relationship[4]), identifying: relationship[3] === '--', label: diagramDecode(relationship[6] ?? relationship[7].trim()) });
    }
    if (active) return null;
    nodes.forEach(node => delete node.defined);
  } else return null;
  try { diagramSource(settings); return settings; } catch { return null; }
}
