const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/chart-model.js'), 'utf8'), context);
for (const type of ['chartBar', 'chartLine', 'chartPie', 'diagramTimeline']) {
  const settings = context.chartDefaults(type);
  const source = context.chartSource(settings);
  assert.equal(context.chartSource(context.parseChartSource(source)), source);
  settings.title = 'รายงาน "Q1" <draft> #35;';
  settings.rows[0][0] = 'Label "A": #quot; <item>';
  if (type === 'diagramTimeline') settings.rows[0][1] = 'Launch: review; done';
  const escaped = context.chartSource(settings);
  const parsed = context.parseChartSource(escaped);
  assert.equal(parsed.title, settings.title);
  assert.equal(parsed.rows[0][0], settings.rows[0][0]);
  assert.equal(context.chartSource(parsed), escaped);
}
const unlabeled = context.chartDefaults('chartBar');
unlabeled.yLabel = '';
for (const maximum of ['', '50']) {
  unlabeled.minimum = maximum ? '0' : ''; unlabeled.maximum = maximum;
  const source = context.chartSource(unlabeled);
  assert.ok(!source.includes('y-axis ""'));
  assert.equal(context.chartSource(context.parseChartSource(source)), source);
}
const bar = context.chartDefaults('chartBar');
bar.minimum = '0'; bar.maximum = '50';
assert.equal(context.parseChartSource(context.chartSource(bar)).maximum, '50');
bar.maximum = '10';
assert.throws(() => context.chartSource(bar), /limits must include/);
bar.minimum = '';
assert.throws(() => context.chartSource(bar), /both axis limits/);
bar.maximum = ''; bar.rows[0][1] = '';
assert.throws(() => context.chartSource(bar), /Complete/);
const pie = context.chartDefaults('chartPie');
pie.rows[0][1] = '-1';
assert.throws(() => context.chartSource(pie), /non-negative/);
pie.rows.forEach(row => { row[1] = '0'; });
assert.throws(() => context.chartSource(pie), /above zero/);
for (const source of ['flowchart LR\nA-->B', 'timeline\n title Example\n section Advanced\n 2026 : Plan',
  context.chartSource(context.chartDefaults('chartBar')) + '\nline [1, 2, 3, 4]']) assert.equal(context.parseChartSource(source), null);
console.log('PASS chart models: editable round trips, Thai/special text, axis limits, invalid data and advanced syntax protection');
