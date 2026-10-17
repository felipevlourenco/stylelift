import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { analyze, analyzeAll, analyzeInline, Edit, parseSource } from '../transform';
import { applyEdits } from './apply';

// Each directory holds `before.<ext>` and `after.<ext>`. `before` carries one cursor marker,
// `<|name>`: it is cut out of the source, marks the cursor, and names the new style key
// (`<|>` accepts the suggested default). Directory prefixes pick the action:
//   all-*     extract every inline style (no marker)
//   merge-*   merge into existing key `<|key>`
//   inline-*  inline the `styles.x` under `<|>`
const FIXTURES = join(__dirname, '../../src/test/fixtures');

for (const dir of readdirSync(FIXTURES)) {
	test(`fixture: ${dir}`, () => {
		const files = readdirSync(join(FIXTURES, dir));
		const before = files.find((f) => f.startsWith('before.'))!;
		const read = (f: string) => readFileSync(join(FIXTURES, dir, f), 'utf8');

		const marked = read(before);
		const marker = /<\|([^>]*)>/.exec(marked);
		const source = marker ? marked.replace(marker[0], '') : marked;
		const offset = marker?.index ?? 0;
		const name = marker?.[1] ?? '';

		let edits: Edit[];
		if (dir.startsWith('all-')) {
			edits = analyzeAll(source)?.edits() ?? [];
		} else if (dir.startsWith('inline-')) {
			edits = analyzeInline(source, offset)?.edits() ?? [];
		} else {
			const analysis = analyze(source, offset);
			edits = (dir.startsWith('merge-') ? analysis?.mergeEdits(name) : analysis?.edits(name || analysis.defaultName)) ?? [];
		}
		const result = applyEdits(source, edits);
		assert.equal(result, read(before.replace('before', 'after')));
		assert.deepEqual(parseSource(result)!.errors, [], 'output must still parse');
	});
}
