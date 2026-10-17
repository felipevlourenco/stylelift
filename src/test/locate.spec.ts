import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { locate } from '../transform';

/** `|` marks the cursor. Returns the source without it, plus its offset. */
function cursor(marked: string): [string, number] {
	const offset = marked.indexOf('|');
	return [marked.replace('|', ''), offset];
}

function objectAt(marked: string): { text: string; element: string; inArray: boolean } | undefined {
	const [source, offset] = cursor(marked);
	const hit = locate(source, offset);
	return hit && { text: source.slice(hit.object.start!, hit.object.end!), element: hit.element, inArray: !!hit.array };
}

test('plain JS and JSX', () => {
	assert.deepEqual(objectAt('const a = <View style={{ fl|ex: 1 }} />;'), { text: '{ flex: 1 }', element: 'View', inArray: false });
	assert.equal(objectAt('function A() { return <Text style={{ color: "red" }}>hi|</Text>; }'), undefined);
});

test('TypeScript syntax in TSX', () => {
	const src = `
		type P = { size: number };
		const A = <T,>({ size }: P & { x?: T }) => {
			const [n] = useState<number>(0);
			return <Image style={{ width: size as number, tr|ansform: [{ scale: 2 }] }} />;
		};`;
	const hit = objectAt(src);
	assert.equal(hit?.element, 'Image');
	assert.match(hit!.text, /^\{ width: size as number, transform: \[\{ scale: 2 \}\] \}$/);
});

test('cursor anywhere on the attribute counts, including the name', () => {
	assert.equal(objectAt('const a = <View st|yle={{ flex: 1 }} />;')?.text, '{ flex: 1 }');
	assert.equal(objectAt('const a = <View style={{ flex: 1 }}| />;')?.text, '{ flex: 1 }');
	assert.equal(objectAt('const a = <Vi|ew style={{ flex: 1 }} />;'), undefined);
	assert.equal(objectAt('const a = <View style={{ flex: 1 }} /|>;'), undefined);
});

test('innermost style attribute wins', () => {
	const outer = '<List style={{ flex: 1 }} renderItem={() => <Row style={{ margin: 4 }} />} />';
	assert.equal(objectAt(`const a = ${outer.replace('flex', 'fl|ex')};`)?.element, 'List');
	assert.equal(objectAt(`const a = ${outer.replace('margin', 'mar|gin')};`)?.element, 'Row');
});

test('member element names use the last segment', () => {
	assert.equal(objectAt('const a = <Animated.View style={{ o|pacity: 0 }} />;')?.element, 'View');
});

test('array style: the object under the cursor, or the only one', () => {
	const hit = objectAt('const a = <View style={[styles.a, { mar|gin: 4 }]} />;');
	assert.deepEqual(hit, { text: '{ margin: 4 }', element: 'View', inArray: true });
	assert.equal(objectAt('const a = <View style={[sty|les.a, { margin: 4 }]} />;')?.text, '{ margin: 4 }');
	assert.equal(objectAt('const a = <View style={[sty|les.a, { margin: 4 }, { padding: 2 }]} />;'), undefined);
	assert.equal(objectAt('const a = <View style={[styles.a, { margin: 4 }, { pad|ding: 2 }]} />;')?.text, '{ padding: 2 }');
});

test('things that are not inline style objects', () => {
	assert.equal(objectAt('const a = <View style={sty|les.a} />;'), undefined);
	assert.equal(objectAt('const a = <View style={cond ? { a: 1 } : |{ b: 2 }} />;'), undefined);
	assert.equal(objectAt('const a = <View contentContainerStyle={{ fl|ex: 1 }} />;'), undefined);
	assert.equal(objectAt('const a = <div style={{ col|or: "red" }} />;'), undefined);
});

test('broken code does not throw', () => {
	assert.equal(objectAt('const a = <View style={{ flex: 1 }|} >>> ((('), undefined);
});
