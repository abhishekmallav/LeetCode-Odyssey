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

const topicPalette = ['#ffc400', '#5225cf', '#00a98c', '#ff681c', '#2378d4', '#ed3f92', '#a8d740', '#ac199d', '#04bac9', '#e84437', '#eee0ba', '#243b99', '#d77e11', '#8cbbef', '#7228ad', '#ee8eae', '#006d60', '#b7a5f5', '#c64316', '#dce65b'];
export const difficultyColors = { Easy: '#20ed73', Medium: '#ffe000', Hard: '#ff342d' };
export const topicColor = (topic: string) => topicPalette[Math.floor(seed(topic) * topicPalette.length)];

export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => hex.slice(1).match(/../g)!.map(c => parseInt(c, 16) / 255)
    .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
    .reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

export const inkColor = (background: string) => contrastRatio('#000000', background) >= contrastRatio('#ffffff', background) ? '#000000' : '#ffffff';

export function topicSections(problem: Pick<Problem, 'id' | 'topics'>) {
  const topics = [...new Set(problem.topics.length ? problem.topics : ['Uncategorized'])];
  const weights = topics.map(t => .65 + seed(problem.id + ':' + t) * 1.4);
  const total = weights.reduce((a, b) => a + b, 0);
  let offset = 0;
  return topics.map((topic, i) => {
    const start = offset;
    offset += weights[i] / total;
    return { topic, color: topicColor(topic), start, end: i === topics.length - 1 ? 1 : offset };
  });
}

export function bookLook(problem: Pick<Problem, 'id' | 'topics'>) {
  const sections = topicSections(problem);
  return {
    sections,
    top: sections[0].color,
    bottom: sections.at(-1)!.color,
    width: 1.08 + seed(problem.id) * .26,
    height: 7.1 + seed(problem.id + 'height') * 1.4,
    tilt: (seed(problem.id + 'tilt') - .5) * .025,
  };
}

export const SHELF_SLOT = 1.8;
export const shelfCapacity = (width: number) => Math.max(1, Math.floor(width / 76.8));
export function carouselLayout(width: number) {
  const capacity = shelfCapacity(width);
  const span = Math.max(4.5, capacity - 2) * SHELF_SLOT;
  return { capacity, span, radius: Math.max(60, span * 7.5) };
}
export function carouselPose(distance: number, radius: number) {
  const angle = distance / radius;
  return { x: Math.sin(angle) * radius, z: (Math.cos(angle) - 1) * radius, angle };
}

export const wrapIndex = (index: number, length: number) => length ? ((index % length) + length) % length : 0;
