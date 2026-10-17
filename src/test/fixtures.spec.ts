import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { analyze, Edit, parseSource } from '../transform';

// Each directory holds `before.<ext>` and `after.<ext>`. `before` carries one cursor marker,
// `<|name>`: it is cut out of the source, marks the cursor, and names the new style key
// (`<|>` accepts the suggested default).
const FIXTURES = join(__dirname, '../../src/test/fixtures');

export function applyEdits(source: string, edits: Edit[]): string {
	return [...edits].sort((a, b) => b.start - a.start).reduce((s, e) => s.slice(0, e.start) + e.text + s.slice(e.end), source);
}

for (const dir of readdirSync(FIXTURES)) {
	test(`fixture: ${dir}`, () => {
		const files = readdirSync(join(FIXTURES, dir));
		const before = files.find((f) => f.startsWith('before.'))!;
		const read = (f: string) => readFileSync(join(FIXTURES, dir, f), 'utf8');

		const marked = read(before);
		const marker = /<\|([^>]*)>/.exec(marked)!;
		const source = marked.replace(marker[0], '');
		const analysis = analyze(source, marker.index);

		const result = applyEdits(source, analysis?.edits(marker[1] || analysis.defaultName) ?? []);
		assert.equal(result, read(before.replace('before', 'after')));
		assert.deepEqual(parseSource(result)!.errors, [], 'output must still parse');
	});
}
