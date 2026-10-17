import type { Edit } from '../transform';

export function applyEdits(source: string, edits: Edit[]): string {
	return [...edits].sort((a, b) => b.start - a.start).reduce((s, e) => s.slice(0, e.start) + e.text + s.slice(e.end), source);
}
