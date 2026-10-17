import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { analyze, validateName } from '../transform';

test('validateName: legal identifier, not already used', () => {
	const used = new Set(['container']);
	assert.equal(validateName('title', used), undefined);
	assert.equal(validateName('_a$1', used), undefined);
	assert.equal(validateName('default', used), undefined, 'reserved words are fine as property names');
	assert.match(validateName('', used)!, /not a valid identifier/);
	assert.match(validateName('1a', used)!, /not a valid identifier/);
	assert.match(validateName('my-style', used)!, /not a valid identifier/);
	assert.match(validateName('a b', used)!, /not a valid identifier/);
	assert.match(validateName('container', used)!, /already defined/);
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
