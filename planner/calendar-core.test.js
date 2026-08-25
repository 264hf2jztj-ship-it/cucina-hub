const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./calendar-core.js');

test('buildMonthCells always starts on Monday and returns 42 cells', () => {
  const cells = core.buildMonthCells('2026-08-01');
  assert.equal(cells.length, 42);
  assert.equal(cells[0].date, '2026-07-27');
  assert.equal(cells.at(-1).date, '2026-09-06');
  assert.equal(cells.filter(cell => cell.inMonth).length, 31);
});

test('shiftMonth moves across year boundaries', () => {
  assert.equal(core.isoDate(core.shiftMonth('2026-12-01', 1)), '2027-01-01');
  assert.equal(core.isoDate(core.shiftMonth('2026-01-01', -1)), '2025-12-01');
});

test('groupEvents combines meals and prep by date', () => {
  const grouped = core.groupEvents(
    [{ id: 'm1', planned_date: '2026-08-25', meal_slot: 'dinner', planned_time: '20:00' }],
    [{ id: 'p1', scheduled_date: '2026-08-25', title: 'Taglia verdure', status: 'todo', scheduled_time: '18:00' }]
  );
  assert.equal(grouped.get('2026-08-25').length, 2);
  assert.equal(grouped.get('2026-08-25')[0].type, 'prep');
});

test('filterEvents keeps selected event type', () => {
  const events = [{ type: 'meal' }, { type: 'prep' }];
  assert.deepEqual(core.filterEvents(events, 'meals'), [{ type: 'meal' }]);
  assert.deepEqual(core.filterEvents(events, 'prep'), [{ type: 'prep' }]);
  assert.equal(core.filterEvents(events, 'all').length, 2);
});
