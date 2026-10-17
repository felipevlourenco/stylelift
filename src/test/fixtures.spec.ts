import { strict as assert } from 'node:assert';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
// Optional: `options.json` (settings), `before.styles.ts` (existing separate styles file) and
// `after.styles.ts` (what that file must contain afterwards).
const FIXTURES = join(__dirname, '../../src/test/fixtures');

for (const dir of readdirSync(FIXTURES)) {
	test(`fixture: ${dir}`, () => {
		const files = readdirSync(join(FIXTURES, dir));
		const before = files.find((f) => f.startsWith('before.') && !f.startsWith('before.styles.'))!;
		const read = (f: string) => readFileSync(join(FIXTURES, dir, f), 'utf8');

		const marked = read(before);
		const marker = /<\|([^>]*)>/.exec(marked);
		const source = marker ? marked.replace(marker[0], '') : marked;
		const offset = marker?.index ?? 0;
		const name = marker?.[1] ?? '';

		const optionsFile = join(FIXTURES, dir, 'options.json');
		const siblingFile = join(FIXTURES, dir, 'before.styles.ts');
		const options = {
			...(existsSync(optionsFile) ? JSON.parse(read('options.json')) : {}),
			siblingText: existsSync(siblingFile) ? read('before.styles.ts') : undefined,
		};

		let edits: Edit[];
		if (dir.startsWith('all-')) {
			edits = analyzeAll(source, options)?.edits() ?? [];
		} else if (dir.startsWith('inline-')) {
			edits = analyzeInline(source, offset, options)?.edits() ?? [];
		} else {
			const analysis = analyze(source, offset, options);
			edits = (dir.startsWith('merge-') ? analysis?.mergeEdits(name) : analysis?.edits(name || analysis.defaultName)) ?? [];
		}
		const result = applyEdits(source, edits.filter((e) => !e.file));
		const sibling = edits.filter((e) => e.file);
		if (existsSync(join(FIXTURES, dir, 'after.styles.ts'))) {
			assert.ok(sibling.length, 'expected edits to the separate styles file');
			assert.equal(new Set(sibling.map((e) => e.file)).size, 1);
			const created = sibling.find((e) => e.create);
			const sibResult = created ? created.text : applyEdits(options.siblingText, sibling);
			assert.equal(sibResult, read('after.styles.ts'));
			assert.deepEqual(parseSource(sibResult)!.errors, [], 'separate file must still parse');
		} else {
			assert.deepEqual(sibling, [], 'no edits to other files expected');
		}
		assert.equal(result, read(before.replace('before', 'after')));
		assert.deepEqual(parseSource(result)!.errors, [], 'output must still parse');
	});
}
