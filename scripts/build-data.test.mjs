import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCatalog } from './build-data.mjs';
const header = '\ufeffProblem No,Link,Title,Difficulty,Topics,company\r\n';
const row = '1,https://leetcode.com/problems/two-sum/description/,"Title, with comma",Easy,"Array, Hash Table",Amazon; Google\r\n';
test('CSV quoted fields, BOM, and semicolon companies survive conversion', () => {
  const [problem] = parseCatalog(header + row);
  assert.equal(problem.title, 'Title, with comma');
  assert.deepEqual(problem.topics, ['Array', 'Hash Table']);
  assert.deepEqual(problem.companies, ['Amazon', 'Google']);
});
test('invalid catalogs fail before producing frontend data', () => {
  assert.throws(() => parseCatalog(header + row + row), /duplicate/);
  assert.throws(() => parseCatalog(header + row.replace('Easy', 'Unknown')), /Invalid metadata/);
  assert.throws(() => parseCatalog(header + row.replace('https://leetcode.com/', 'https://other.com/')), /Invalid LeetCode link/);
  assert.throws(() => parseCatalog('Title\nTwo Sum\n'), /required columns/);
});
