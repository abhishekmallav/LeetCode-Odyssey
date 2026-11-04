import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookLook, carouselLayout, carouselPose, companyLabel, contrastRatio, difficultyColors, filterProblems, inkColor, shelfCapacity, SHELF_SLOT, topicColor, topicSections, wrapIndex } from './model.ts';
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
test('book appearance and topic proportions are stable and varied', () => {
  assert.deepEqual(bookLook(problems[0]), bookLook(problems[0]));
  assert.notDeepEqual(bookLook(problems[0]), bookLook({ ...problems[0], id: '2' }));
  for (const p of problems) { assert.ok(bookLook(p).width >= 1.08); assert.ok(bookLook(p).width < 1.34); assert.ok(bookLook(p).height >= 7.1); }
  const topics = ['Array', 'Hash Table', 'Sorting', 'Binary Search'];
  for (let id = 1; id <= 4101; id++) {
    const sections = topicSections({ id: String(id), topics });
    assert.equal(sections.length, topics.length);
    assert.equal(sections[0].start, 0);
    assert.equal(sections.at(-1)!.end, 1);
    for (const [i, section] of sections.entries()) {
      assert.ok(section.end > section.start);
      if (i) assert.equal(section.start, sections[i - 1].end);
      assert.equal(section.color, topicColor(section.topic));
    }
  }
  assert.equal(topicSections({ id: '1', topics: [] }).length, 1);
  assert.equal(topicSections({ id: '1', topics: ['Array', 'Array'] }).length, 1);
  assert.notDeepEqual(topicSections({ id: '1', topics }), topicSections({ id: '2', topics }));
});
test('automatic black/white ink passes AA for topic colors and difficulty stickers', () => {
  assert.equal(inkColor('#000000'), '#ffffff');
  assert.equal(inkColor('#ffffff'), '#000000');
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  const colors = new Set(Object.values(difficultyColors));
  for (let i = 0; i < 1000; i++) colors.add(topicColor('Topic ' + i));
  assert.ok(colors.size >= 20);
  for (const color of colors) assert.ok(contrastRatio(inkColor(color), color) >= 4.5, color);
});
test('responsive shelf density sets the visible book budget', () => {
  for (const [width, expected] of [[320, 4], [390, 5], [768, 10], [1024, 13], [1440, 18], [1920, 25], [2560, 33]]) {
    assert.equal(shelfCapacity(width), expected);
  }
  assert.equal(shelfCapacity(40), 1);
});
test('the shelf curve stays subtle across phone, desktop and wide-screen layouts', () => {
  for (const width of [320, 390, 768, 1024, 1440, 1920, 2560, 3840]) {
    const { span, radius } = carouselLayout(width);
    const edge = carouselPose(span / 2, radius);
    assert.ok(edge.z < 0 && Math.abs(edge.z) < span * .025);
    assert.ok(Math.abs(edge.angle) < .1);
  }
});
test('carousel turns along an arc and rebasing leaves existing books in place', () => {
  assert.deepEqual(carouselPose(0, 30), { x: 0, z: 0, angle: 0 });
  const left = carouselPose(-10, 30), right = carouselPose(10, 30);
  assert.equal(left.x, -right.x); assert.equal(left.z, right.z);
  assert.ok(left.z < 0); assert.ok(left.angle < 0 && right.angle > 0);
  for (const oldSlot of [0, 5, 10]) {
    const phase = SHELF_SLOT + .01;
    const before = carouselPose(oldSlot * SHELF_SLOT - 9 + phase, 30);
    const after = carouselPose((oldSlot + 1) * SHELF_SLOT - 9 + (phase - SHELF_SLOT), 30);
    assert.ok(Math.hypot(before.x - after.x, before.z - after.z) < 1e-12);
    const next = carouselPose((oldSlot + 1) * SHELF_SLOT - 9 + (phase - SHELF_SLOT) + .007, 30);
    assert.ok(Math.hypot(next.x - after.x, next.z - after.z) <= .0071);
  }
});
test('shelf and detail navigation wrap at both ends', () => {
  assert.equal(wrapIndex(-1, 4101), 4100);
  assert.equal(wrapIndex(4101, 4101), 0);
  assert.equal(wrapIndex(0, 0), 0);
});
