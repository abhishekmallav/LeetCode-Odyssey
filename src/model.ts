export type Difficulty = 'Easy' | 'Medium' | 'Hard';
export interface Problem { id: string; title: string; difficulty: Difficulty; topics: string[]; companies: string[]; url: string }
export interface Filters { query: string; difficulty: string; topic: string; company: string }
export const popularCompanies = ['Amazon', 'Google', 'Microsoft', 'Meta', 'Netflix', 'Citadel', 'J.P. Morgan', 'Citigroup', 'Nvidia', 'Apple', 'Uber'];
export const companyLabel = (company: string) => ({ 'J.P. Morgan': 'JPMorgan', Citigroup: 'Citi' }[company] || company);

export function filterProblems(problems: Problem[], filters: Filters): Problem[] {
  const query = filters.query.trim().toLocaleLowerCase().replace(/^#/, '');
  return problems.filter(p => (!query || p.id === query || p.title.toLocaleLowerCase().includes(query))
    && (!filters.difficulty || p.difficulty === filters.difficulty)
    && (!filters.topic || p.topics.includes(filters.topic))
    && (!filters.company || p.companies.includes(filters.company)));
}

export function seed(id: string): number {
  let value = 2166136261;
  for (const c of id) value = Math.imul(value ^ c.charCodeAt(0), 16777619);
  return (value >>> 0) / 4294967296;
}

export function bookLook(problem: Pick<Problem, 'id' | 'difficulty'>) {
  const n = seed(problem.id);
  const hue = problem.difficulty === 'Easy' ? 125 + n * 30 : problem.difficulty === 'Medium' ? 41 + n * 12 : n * 12;
  const variation = seed(problem.id + 'gradient');
  const saturation = 75 + seed(problem.id + 'saturation') * 17;
  const topLight = problem.difficulty === 'Hard' ? 74 + variation * 5 : 65 + variation * 9;
  const bottomLight = problem.difficulty === 'Hard' ? 70 + n * 5 : problem.difficulty === 'Medium' ? 53 + n * 9 : 51 + n * 9;
  const angle = 115 + seed(problem.id + 'angle') * 80;
  const top = `hsl(${hue.toFixed(1)} ${saturation.toFixed(1)}% ${topLight.toFixed(1)}%)`;
  const bottom = `hsl(${(hue + variation * 5).toFixed(1)} ${(saturation - 4).toFixed(1)}% ${bottomLight.toFixed(1)}%)`;
  return {
    top, bottom, angle,
    width: .94 + n * .35,
    height: 3.25 + seed(problem.id + 'height') * .63,
    tilt: (seed(problem.id + 'tilt') - .5) * .045,
  };
}

export const wrapIndex = (index: number, length: number) => length ? ((index % length) + length) % length : 0;
