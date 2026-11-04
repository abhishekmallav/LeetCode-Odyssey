import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parse } from 'csv-parse/sync';

export function parseCatalog(csv) {
  const rows = parse(csv, { bom: true, columns: true, skip_empty_lines: true, trim: true });
  if (!rows.length) throw new Error('The problem catalog is empty.');
  const required = ['Problem No', 'Link', 'Title', 'Difficulty', 'Topics', 'company'];
  if (!required.every(field => Object.hasOwn(rows[0], field))) throw new Error('The problem CSV is missing required columns.');
  const seen = new Set();
  return rows.map(row => {
    const id = row['Problem No'];
    if (!id || seen.has(id)) throw new Error(`Blank or duplicate problem number: ${id}`);
    seen.add(id);
    if (!row.Title || !['Easy', 'Medium', 'Hard'].includes(row.Difficulty)) throw new Error(`Invalid metadata for problem ${id}`);
    if (!/^https:\/\/leetcode\.com\/problems\/[a-z0-9-]+\/description\/$/.test(row.Link)) throw new Error(`Invalid LeetCode link for ${id}`);
    return { id, title: row.Title, difficulty: row.Difficulty, topics: row.Topics.split(',').map(t => t.trim()).filter(Boolean), companies: row.company.split(';').map(c => c.trim()).filter(Boolean), url: row.Link };
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = new URL('../', import.meta.url);
  const problems = parseCatalog(await readFile(new URL('leetcode_problems.csv', root), 'utf8'));
  await mkdir(new URL('public/', root), { recursive: true });
  const target = new URL('public/problems.json', root);
  const temporary = new URL('public/problems.json.tmp', root);
  await writeFile(temporary, JSON.stringify(problems));
  await rename(temporary, target);
  console.log(`Prepared ${problems.length.toLocaleString()} problems from leetcode_problems.csv.`);
}
