const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({});
for (const file of ['chart-model.js', 'diagram-model.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
for (const type of ['diagramFlow', 'diagramSequence', 'diagramER']) {
  const settings = context.diagramDefaults(type);
  const source = context.diagramSource(settings);
  assert.ok(context.parseDiagramSource(source), source);
  assert.equal(context.diagramSource(context.parseDiagramSource(source)), source);
  settings.links[0].label = 'ตรวจ "รายการ" | 50% #quot; <draft> : done';
  const escaped = context.diagramSource(settings);
  const parsed = context.parseDiagramSource(escaped);
  assert.equal(parsed.links[0].label, settings.links[0].label);
  assert.equal(context.diagramSource(parsed), escaped);
  settings.links[0].to = 'MISSING';
  assert.throws(() => context.diagramSource(settings), /both ends/);
}
for (const shape of ['box', 'rounded', 'diamond', 'circle']) {
  const settings = context.diagramDefaults('diagramFlow'); settings.nodes[0].shape = shape;
  const source = context.diagramSource(settings);
  assert.equal(context.diagramSource(context.parseDiagramSource(source)), source);
}
for (const kind of ['-->', '-.->', '==>', '---']) {
  const settings = context.diagramDefaults('diagramFlow'); settings.links[0].kind = kind;
  assert.equal(context.parseDiagramSource(context.diagramSource(settings)).links[0].kind, kind);
}
for (const kind of ['->>', '-->>', '->', '-->', '-x', '--x', '-)', '--)']) {
  const settings = context.diagramDefaults('diagramSequence'); settings.links[0].kind = kind; settings.autonumber = true;
  assert.equal(context.parseDiagramSource(context.diagramSource(settings)).links[0].kind, kind);
}
const sequence = context.diagramDefaults('diagramSequence'); sequence.links = [];
assert.throws(() => context.diagramSource(sequence), /at least one message/);
for (const left of ['one', 'zeroOne', 'many', 'zeroMany']) for (const right of ['one', 'zeroOne', 'many', 'zeroMany']) {
  const settings = context.diagramDefaults('diagramER'); Object.assign(settings.links[0], { left, right, identifying: false });
  const source = context.diagramSource(settings);
  assert.equal(context.diagramSource(context.parseDiagramSource(source)), source);
}
const er = context.diagramDefaults('diagramER');
er.nodes[1].label = er.nodes[0].label;
assert.throws(() => context.diagramSource(er), /Entity names must be unique/);
er.nodes[1].label = 'ORDER'; er.nodes[0].attributes.push({ type: 'string', name: 'id', key: '' });
assert.throws(() => context.diagramSource(er), /Field names must be unique/);
const legacy = [
  'flowchart TD\n A[Start] --> B{Approved?}\n B -->|Yes| C((End))\n B -->|"No"| D(Revise)',
  'flowchart LR\n A["Start"] --> B{"Check"}\n B -- Yes --> C["Proceed"]\n B -- No --> D["Revise"]\n D --> B',
  'sequenceDiagram\n participant U as User\n participant S as System\n U->>S: Request\n S-->>U: Response',
  'erDiagram\n USER ||--o{ ORDER : places\n USER {\n int id PK\n string name\n }\n ORDER {\n int id PK\n int user_id FK\n }'
];
for (const source of legacy) assert.ok(context.parseDiagramSource(source), source);
for (const source of ['flowchart LR\n subgraph Group\n A-->B\n end', 'sequenceDiagram\n loop Repeat\n A->>B: Hi\n end', 'erDiagram\n USER {\n int id PK "comment"\n }', 'flowchart LR\n A-->B\n style A fill:red']) assert.equal(context.parseDiagramSource(source), null);
const timeline = context.diagramDefaults('diagramTimeline');
const timelineSource = context.diagramSource(timeline);
assert.equal(context.diagramSource(context.parseDiagramSource(timelineSource)), timelineSource);
console.log('PASS diagram models: all types, shapes, arrow styles, cardinalities, legacy templates, Unicode, validation and advanced-source protection');
