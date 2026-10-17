import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { analyze, inlineStyleRanges, keyOffset, validateName } from '../transform';
import { applyEdits } from './apply';

test('validateName: legal identifier, not already used', () => {
	const used = new Set(['container']);
	assert.equal(validateName('title', used), undefined);
	assert.equal(validateName('_a$1', used), undefined);
	assert.equal(validateName('default', used), undefined, 'reserved words are fine as property names');
	assert.match(validateName('', used)!, /not a valid identifier/);
	assert.match(validateName('1a', used)!, /not a valid identifier/);
	assert.match(validateName('my-style', used)!, /not a valid identifier/);
	assert.match(validateName('a b', used)!, /not a valid identifier/);
	assert.match(validateName('container', used)!, /already defined .*try "container2"/);
});

test('analyze reports keys already in the sheet, quoted ones included', () => {
	const src = `<View style={{ a: 1 }} />;\nconst styles = StyleSheet.create({ a: {}, 'b-c': {}, [d]: {}, ...rest });`;
	const a = analyze(src, 15)!;
	assert.deepEqual([...a.usedNames].sort(), ['a', 'b-c']);
});

test('warning when nothing is static, none otherwise', () => {
	const warn = (s: string) => analyze(s, s.indexOf('style'))!.warning;
	assert.match(warn('<View style={{ w: size }} />')!, /Nothing to extract/);
	assert.match(warn('<View style={{ ...rest, p: 1 }} />')!, /Nothing to extract/);
	assert.match(warn('<View style={{}} />')!, /Nothing to extract/);
	assert.equal(warn('<View style={{ w: size, p: 1 }} />'), undefined);
});

test('inlineStyleRanges: only styles with something static to extract', () => {
	const src = `<View style={{ a: 1 }}><View style={{ w: size }} /><View style={[s.x, { b: 2, w: size }]} /></View>`;
	const ranges = inlineStyleRanges(src).map((r) => src.slice(r.start, r.end));
	assert.deepEqual(ranges, ['{ a: 1 }', '{ b: 2, w: size }']);
});

test('keyOffset points at the new key in the edited text', () => {
	const src = `import { View } from 'react-native';\nconst a = <View style={{ a: 1, w: size }} />;\n`;
	const edits = analyze(src, src.indexOf('a: 1'))!.edits('box');
	const out = applyEdits(src, edits);
	assert.equal(out.slice(keyOffset(edits)).startsWith('box'), true);
});
