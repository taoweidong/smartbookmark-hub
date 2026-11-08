const HUES = [
  '#f2b33d',
  '#4cc3ff',
  '#a8e05f',
  '#f06bd8',
  '#ff6b6b',
  '#a78bfa',
  '#2dd4bf',
  '#fb923c',
];

export function folderHue(id: string): string {
  let hash = 7;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) % 100_003;
  return HUES[hash % HUES.length];
}

export const ACCENTS: { name: 'gilt' | 'azure' | 'verdant' | 'magenta'; label: string; swatch: string }[] = [
  { name: 'gilt', label: '鎏金', swatch: '#f2b33d' },
  { name: 'azure', label: '青金', swatch: '#4cc3ff' },
  { name: 'verdant', label: '竹青', swatch: '#a8e05f' },
  { name: 'magenta', label: '胭脂', swatch: '#f06bd8' },
];