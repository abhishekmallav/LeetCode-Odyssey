import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookLook, companyLabel, filterProblems, wrapIndex } from './model.ts';
import type { Problem } from './model.ts';
const problems: Problem[] = [
  { id: '1', title: 'Two Sum', difficulty: 'Easy', topics: ['Array', 'Hash Table'], companies: ['Amazon', 'Google'], url: '' },
  { id: '41', title: 'First Missing Positive', difficulty: 'Hard', topics: ['Array'], companies: ['Citigroup'], url: '' },
];
const filters = { query: '', difficulty: '', topic: '', company: '' };
test('all filters combine and search supports problem numbers and titles', () => {
  assert.equal(filterProblems(problems, { ...filters, query: '#41' })[0].id, '41');
  assert.equal(filterProblems(problems, { ...filters, query: 'two SUM', company: 'Amazon', topic: 'Array', difficulty: 'Easy' }).length, 1);
  assert.equal(filterProblems(problems, { ...filters, company: 'Amazon', difficulty: 'Hard' }).length, 0);
  assert.equal(filterProblems(problems, { ...filters, query: '   ' }).length, 2);
  assert.equal(companyLabel('Citigroup'), 'Citi');
});
test('book appearance is stable, varied, and bound to difficulty', () => {
  assert.deepEqual(bookLook(problems[0]), bookLook(problems[0]));
  assert.notDeepEqual(bookLook(problems[0]), bookLook({ ...problems[0], id: '2' }));
  for (const p of problems) { assert.ok(bookLook(p).width >= .94); assert.ok(bookLook(p).width < 1.3); assert.ok(bookLook(p).height < 4); }
  assert.ok(bookLook(problems[0]).top.startsWith('hsl(1'));
});
test('each difficulty has saturated, varied gradients within its own color family', () => {
  for (const [difficulty, minHue, maxHue] of [['Easy', 125, 160], ['Medium', 41, 58], ['Hard', 0, 17]] as const) {
    const gradients = new Set<string>();
    const angles = new Set<number>();
    for (let id = 1; id <= 4101; id++) {
      const look = bookLook({ id: String(id), difficulty });
      for (const color of [look.top, look.bottom]) {
        const [hue, saturation] = color.match(/[\d.]+/g)!.map(Number);
        assert.ok(hue >= minHue && hue <= maxHue, color);
        assert.ok(saturation >= 71, color);
      }
      gradients.add(`${look.top}/${look.bottom}`);
      angles.add(look.angle);
    }
    assert.ok(gradients.size > 4000);
    assert.ok(angles.size > 4000);
  }
});
test('shelf and detail navigation wrap at both ends', () => {
  assert.equal(wrapIndex(-1, 4101), 4100);
  assert.equal(wrapIndex(4101, 4101), 0);
  assert.equal(wrapIndex(0, 0), 0);
});
