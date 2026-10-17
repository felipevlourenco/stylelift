import { parse, type ParseResult } from '@babel/parser';
import type { ArrayExpression, File, ImportDeclaration, ImportSpecifier, JSXAttribute, JSXOpeningElement, MemberExpression, Node, ObjectExpression } from '@babel/types';

export interface Located {
	/** The style object literal. */
	object: ObjectExpression;
	/** The `[...]` the object sits in, when the prop is an array. */
	array?: ArrayExpression;
	/** JSX element name, e.g. `View` (last segment of `Animated.View`). */
	element: string;
	/** The prop it is on: `style`, `contentContainerStyle`, … */
	attr: string;
}

export interface Edit {
	start: number;
	end: number;
	text: string;
}

export interface Analysis {
	/** Suggested key for the new style, unique within the style sheet. */
	defaultName: string;
	/** Keys already in the style sheet. */
	usedNames: ReadonlySet<string>;
	/** Set when there is nothing static to move; `edits` is then empty. */
	warning?: string;
	/** Existing key with exactly these static values; `edits` points at it instead of adding one. */
	reuse?: string;
	/** Existing keys (object literals) the style can be merged into. */
	mergeKeys: string[];
	/** Edits (offsets into the analysed source) that perform the extraction under `name`. */
	edits(name: string): Edit[];
	/** Edits that merge the static values into existing key `key`. */
	mergeEdits(key: string): Edit[];
}

interface Sheet {
	name: string;
	object: ObjectExpression;
}

interface Pick {
	loc: Located;
	key: string;
	fixed: Node[];
	dynamic: Node[];
	/** false = `key` already exists (or is added by an earlier pick) */
	add: boolean;
}

const SHEET = 'styles';
const FACTORY = 'StyleSheet.create';
const DEFAULT_KEYS: Record<string, string> = { View: 'container', Text: 'text', Image: 'image' };

export function parseSource(source: string): ParseResult<File> | undefined {
	try {
		return parse(source, { sourceType: 'module', plugins: ['jsx', 'typescript'], errorRecovery: true });
	} catch {
		return undefined;
	}
}

// ---------------------------------------------------------------- AST helpers

const within = (n: Node, offset: number) => n.start! <= offset && offset <= n.end!;
const text = (source: string, n: Node) => source.slice(n.start!, n.end!);
const lowerFirst = (s: string) => s[0].toLowerCase() + s.slice(1);

function* children(node: Node): Generator<Node> {
	for (const [key, value] of Object.entries(node)) {
		if (key.endsWith('Comments')) {
			continue;
		}
		for (const v of Array.isArray(value) ? value : [value]) {
			if (v && typeof v.type === 'string') {
				yield v;
			}
		}
	}
}

function walk(node: Node, fn: (n: Node, parent?: Node) => void, parent?: Node): void {
	fn(node, parent);
	for (const child of children(node)) {
		walk(child, fn, node);
	}
}

// RN components are capitalised; a lowercase tag (`<div style>`) is DOM, not ours.
function rnElementName(opening: JSXOpeningElement): string | undefined {
	const { name } = opening;
	const id = name.type === 'JSXIdentifier' ? name.name : name.type === 'JSXMemberExpression' ? name.property.name : '';
	return /^[A-Z]/.test(id) ? id : undefined;
}

const isStyleProp = (name: string) => name === 'style' || (name.length > 5 && name.endsWith('Style'));

/** Every style-like prop (`style`, `contentContainerStyle`, …) on a capitalised element, outer before inner. */
function styleAttrs(node: Node, opening?: JSXOpeningElement, out: { attr: JSXAttribute; element: string }[] = []) {
	const open = node.type === 'JSXOpeningElement' ? node : opening;
	if (node.type === 'JSXAttribute' && node.name.type === 'JSXIdentifier' && isStyleProp(node.name.name) && open) {
		const element = rnElementName(open);
		if (element) {
			out.push({ attr: node, element });
		}
	}
	for (const child of children(node)) {
		styleAttrs(child, open, out);
	}
	return out;
}

const isObject = (e: Node | null): e is ObjectExpression => e?.type === 'ObjectExpression';

function expressionOf(attr: JSXAttribute) {
	return attr.value?.type === 'JSXExpressionContainer' ? attr.value.expression : undefined;
}

function allLocated(ast: File): Located[] {
	return styleAttrs(ast.program).flatMap(({ attr, element }) => {
		const expr = expressionOf(attr);
		const name = (attr.name as { name: string }).name;
		if (expr?.type === 'ObjectExpression') {
			return [{ object: expr, element, attr: name }];
		}
		return expr?.type === 'ArrayExpression' ? expr.elements.filter(isObject).map((object) => ({ object, array: expr, element, attr: name })) : [];
	});
}

/** The innermost style prop containing `offset`: later in outer-before-inner order wins. */
function attrAt(ast: File, offset: number) {
	return styleAttrs(ast.program).filter((h) => within(h.attr, offset)).at(-1);
}

function locateIn(ast: File, offset: number): Located | undefined {
	const hit = attrAt(ast, offset);
	const expr = hit && expressionOf(hit.attr);
	if (!hit || !expr) {
		return undefined;
	}
	const attr = (hit.attr.name as { name: string }).name;
	if (expr.type === 'ObjectExpression') {
		return { object: expr, element: hit.element, attr };
	}
	if (expr.type === 'ArrayExpression') {
		const objects = expr.elements.filter(isObject);
		const object = objects.find((o) => within(o, offset)) ?? (objects.length === 1 ? objects[0] : undefined);
		return object && { object, array: expr, element: hit.element, attr };
	}
	return undefined;
}

/** Find the inline style object under `offset`: `style={{ … }}` or an object inside `style={[…]}`. */
export function locate(source: string, offset: number): (Located & { ast: File }) | undefined {
	const ast = parseSource(source);
	const loc = ast && locateIn(ast, offset);
	return ast && loc ? { ...loc, ast } : undefined;
}

function keyOf(p: Node): string | undefined {
	if (p.type !== 'ObjectProperty' || p.computed) {
		return undefined;
	}
	const k = p.key;
	return k.type === 'Identifier' ? k.name : k.type === 'StringLiteral' ? k.value : k.type === 'NumericLiteral' ? String(k.value) : undefined;
}

// ------------------------------------------------------- static vs dynamic

function isStatic(n: Node): boolean {
	switch (n.type) {
		case 'NumericLiteral':
		case 'StringLiteral':
		case 'BooleanLiteral':
		case 'NullLiteral':
			return true;
		case 'UnaryExpression':
			return (n.operator === '-' || n.operator === '+') && isStatic(n.argument);
		case 'TemplateLiteral':
			return n.expressions.length === 0;
		case 'TSAsExpression': // `'absolute' as const`
		case 'TSSatisfiesExpression':
			return isStatic(n.expression);
		case 'ArrayExpression':
			return n.elements.every((e) => !!e && isStatic(e));
		case 'ObjectExpression':
			return n.properties.every((p) => p.type === 'ObjectProperty' && !p.computed && isStatic(p.value));
		default:
			return false;
	}
}

/**
 * Split an inline style into properties that can move to the sheet and ones that must stay.
 * Everything after a spread or computed key stays: hoisting it would let that spread override it.
 */
function splitProps(object: ObjectExpression): { fixed: Node[]; dynamic: Node[] } {
	const fixed: Node[] = [];
	const dynamic: Node[] = [];
	let blocked = false;
	for (const p of object.properties) {
		if (!blocked && p.type === 'ObjectProperty' && !p.computed && isStatic(p.value)) {
			fixed.push(p);
		} else {
			dynamic.push(p);
			blocked ||= p.type === 'SpreadElement' || p.computed;
		}
	}
	return { fixed, dynamic };
}

/** Value-based fingerprint (quotes, spacing, key order don't matter). Non-static nodes never match. */
function canon(n: Node): string {
	switch (n.type) {
		case 'NumericLiteral':
		case 'StringLiteral':
		case 'BooleanLiteral':
			return JSON.stringify(n.value);
		case 'NullLiteral':
			return 'null';
		case 'UnaryExpression':
			return n.operator + canon(n.argument);
		case 'TemplateLiteral':
			return n.expressions.length ? `?${n.start}` : JSON.stringify(n.quasis[0].value.cooked);
		case 'TSAsExpression':
		case 'TSSatisfiesExpression':
			return canon(n.expression);
		case 'ArrayExpression':
			return `[${n.elements.map((e) => (e ? canon(e) : '?')).join(',')}]`;
		case 'ObjectExpression':
			return `{${canonProps(n.properties)}}`;
		default:
			return `?${n.start}`;
	}
}

function canonProps(props: Node[]): string {
	return props
		.map((p) => (p.type === 'ObjectProperty' && keyOf(p) !== undefined ? `${keyOf(p)}:${canon(p.value)}` : `?${p.start}`))
		.sort()
		.join(',');
}

// ------------------------------------------------------------------- sheet

function findSheets(source: string, ast: File): Sheet[] {
	const sheets: Sheet[] = [];
	for (const stmt of ast.program.body) {
		const decl = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt;
		for (const d of decl?.type === 'VariableDeclaration' ? decl.declarations : []) {
			const init = d.init;
			if (d.id.type === 'Identifier' && init?.type === 'CallExpression' && text(source, init.callee) === FACTORY && init.arguments[0]?.type === 'ObjectExpression') {
				sheets.push({ name: d.id.name, object: init.arguments[0] });
			}
		}
	}
	return sheets;
}

/** Top-level `const x = StyleSheet.create({...})`; prefers the one named `styles`. */
function findSheet(source: string, ast: File): Sheet | undefined {
	const sheets = findSheets(source, ast);
	return sheets.find((s) => s.name === SHEET) ?? sheets[0];
}

const keyNames = (object: ObjectExpression) => object.properties.map(keyOf).filter((k): k is string => k !== undefined);

/** Keys whose entry is an object literal (the only kind we can merge into or inline). */
function objectEntries(sheet: ObjectExpression) {
	return sheet.properties.flatMap((p) => (p.type === 'ObjectProperty' && p.value.type === 'ObjectExpression' && keyOf(p) !== undefined ? [{ key: keyOf(p)!, prop: p, value: p.value }] : []));
}

function findIdentical(sheet: ObjectExpression, fixed: Node[]): string | undefined {
	const want = canonProps(fixed);
	return objectEntries(sheet).find((e) => canonProps(e.value.properties) === want)?.key;
}

// -------------------------------------------------------------- formatting

/** First indented line decides: a tab, or its run of spaces. */
function detectIndent(source: string): string {
	return /^(\t| {2,})(?=\S)/m.exec(source)?.[1] ?? '  ';
}

function lineIndent(source: string, pos: number): string {
	return /^[ \t]*/.exec(source.slice(source.lastIndexOf('\n', pos - 1) + 1))![0];
}

/** Move continuation lines of a multi-line snippet from one base indent to another. */
function reindent(snippet: string, from: string, to: string): string {
	return snippet
		.split('\n')
		.map((line, i) => (i === 0 ? line : to + (line.startsWith(from) ? line.slice(from.length) : line.trimStart())))
		.join('\n');
}

const propLine = (source: string, p: Node, indent: string) => indent + reindent(text(source, p), lineIndent(source, p.start!), indent);
const joinItems = (items: string[], comma: boolean) => items.join(',\n') + (comma ? ',' : '');

/** `key: {\n<props>\n}` at `indent`, props verbatim from the source. `comma` = trailing commas (match the file). */
function entry(source: string, key: string, props: Node[], indent: string, unit: string, comma: boolean): string {
	return `${indent}${key}: {\n${joinItems(props.map((p) => propLine(source, p, indent + unit)), comma)}\n${indent}}`;
}

/** Append items to an object literal, matching its indentation and trailing-comma style. */
function appendToObject(source: string, obj: ObjectExpression, unit: string, render: (indent: string, comma: boolean) => string): Edit[] {
	const first = obj.properties[0];
	if (!first) {
		const base = lineIndent(source, obj.start!);
		return [{ start: obj.start! + 1, end: obj.end! - 1, text: `\n${render(base + unit, true)}\n${base}` }];
	}
	const edits: Edit[] = [];
	const comma = obj.extra?.trailingComma !== undefined;
	if (!comma) {
		const last = obj.properties.at(-1)!;
		edits.push({ start: last.end!, end: last.end!, text: ',' });
	}
	const body = render(lineIndent(source, first.start!), comma);
	const close = obj.end! - 1;
	const lineStart = source.lastIndexOf('\n', close) + 1;
	const alone = /^\s*$/.test(source.slice(lineStart, close));
	edits.push(alone ? { start: lineStart, end: lineStart, text: body + '\n' } : { start: close, end: close, text: `\n${body}\n` });
	return edits;
}

function importEdit(ast: File, source: string): Edit | undefined {
	const imports = ast.program.body.filter((n): n is ImportDeclaration => n.type === 'ImportDeclaration' && n.importKind !== 'type');
	if (imports.some((i) => i.specifiers.some((s) => s.local.name === 'StyleSheet'))) {
		return undefined;
	}
	const rn = imports.find((i) => i.source.value === 'react-native' && i.specifiers.some((s) => s.type === 'ImportSpecifier'));
	if (rn) {
		const last = rn.specifiers.filter((s): s is ImportSpecifier => s.type === 'ImportSpecifier').at(-1)!;
		const multiline = text(source, rn).includes('\n');
		const added = multiline ? `,\n${lineIndent(source, last.start!)}StyleSheet` : ', StyleSheet';
		return { start: last.end!, end: last.end!, text: added };
	}
	const line = "import { StyleSheet } from 'react-native';";
	const lastImport = imports.at(-1);
	if (lastImport) {
		return { start: lastImport.end!, end: lastImport.end!, text: '\n' + line };
	}
	const at = ast.program.body[0]?.start ?? 0;
	return { start: at, end: at, text: line + '\n\n' };
}

// ------------------------------------------------------------ edit builders

/** Swap the inline object for `ref`; dynamic leftovers stay inline: `[styles.x, { width: size }]`. */
function replacement(source: string, loc: Located, ref: string, dynamic: Node[]): Edit {
	const rest = dynamic.map((p) => text(source, p)).join(', ');
	const out = !dynamic.length ? ref : loc.array ? `${ref}, { ${rest} }` : `[${ref}, { ${rest} }]`;
	return { start: loc.object.start!, end: loc.object.end!, text: out };
}

function build(source: string, ast: File, sheet: Sheet | undefined, picks: Pick[]): Edit[] {
	const unit = detectIndent(source);
	const ref = sheet?.name ?? SHEET;
	const edits = picks.map((p) => replacement(source, p.loc, `${ref}.${p.key}`, p.dynamic));
	const imp = importEdit(ast, source);
	if (imp) {
		edits.push(imp);
	}
	const added = picks.filter((p) => p.add);
	if (added.length && sheet) {
		edits.push(...appendToObject(source, sheet.object, unit, (indent, comma) => joinItems(added.map((p) => entry(source, p.key, p.fixed, indent, unit, comma)), comma)));
	} else if (added.length) {
		const code = `const ${SHEET} = ${FACTORY}({\n${joinItems(added.map((p) => entry(source, p.key, p.fixed, unit, unit, true)), true)}\n});`;
		const end = source.trimEnd().length;
		edits.push({ start: end, end: source.length, text: `\n\n${code}\n` });
	}
	return edits;
}

function uniqueName(base: string, used: ReadonlySet<string>): string {
	let name = base;
	for (let i = 2; used.has(name); i++) {
		name = base + i;
	}
	return name;
}

function baseName(loc: Located): string {
	return loc.attr === 'style' ? (DEFAULT_KEYS[loc.element] ?? lowerFirst(loc.element)) : lowerFirst(loc.attr.slice(0, -'Style'.length));
}

export function validateName(name: string, used: ReadonlySet<string>): string | undefined {
	if (!/^[\p{ID_Start}$_][\p{ID_Continue}$‌‍]*$/u.test(name)) {
		return `"${name}" is not a valid identifier`;
	}
	return used.has(name) ? `"${name}" is already defined in the style sheet` : undefined;
}

// ------------------------------------------------------------------ public

/** Offset of the style key inside the replacement (`edits[0]`) once all `edits` are applied. */
export function keyOffset(edits: Edit[]): number {
	const [ref] = edits;
	const shift = edits.reduce((n, e) => (e.start < ref.start ? n + e.text.length - (e.end - e.start) : n), 0);
	return ref.start + shift + ref.text.indexOf('.') + 1;
}

/** Extract the inline style under `offset`. */
export function analyze(source: string, offset: number): Analysis | undefined {
	const ast = parseSource(source);
	const loc = ast && locateIn(ast, offset);
	if (!ast || !loc) {
		return undefined;
	}
	const sheet = findSheet(source, ast);
	const used = new Set(sheet ? keyNames(sheet.object) : []);
	const { fixed, dynamic } = splitProps(loc.object);
	const reuse = fixed.length && sheet ? findIdentical(sheet.object, fixed) : undefined;
	const unit = detectIndent(source);
	return {
		defaultName: uniqueName(baseName(loc), used),
		usedNames: used,
		warning: fixed.length ? undefined : 'Nothing to extract: this style has no static values (everything depends on props, state or variables).',
		reuse,
		mergeKeys: fixed.length && sheet ? objectEntries(sheet.object).map((e) => e.key) : [],
		edits(name) {
			if (!fixed.length) {
				return [];
			}
			return build(source, ast, sheet, [{ loc, key: reuse ?? name, fixed, dynamic, add: !reuse }]);
		},
		mergeEdits(key) {
			const target = sheet && objectEntries(sheet.object).find((e) => e.key === key)?.value;
			if (!sheet || !target || !fixed.length) {
				return [];
			}
			const edits = [replacement(source, loc, `${sheet.name}.${key}`, dynamic)];
			const fresh: Node[] = [];
			for (const p of fixed) {
				const old = target.properties.find((q) => keyOf(q) !== undefined && keyOf(q) === keyOf(p));
				if (!old) {
					fresh.push(p);
				} else if (old.type === 'ObjectProperty' && p.type === 'ObjectProperty' && canon(old.value) !== canon(p.value)) {
					edits.push({ start: old.value.start!, end: old.value.end!, text: text(source, p.value) });
				}
			}
			if (fresh.length) {
				edits.push(...appendToObject(source, target, unit, (indent, comma) => joinItems(fresh.map((p) => propLine(source, p, indent)), comma)));
			}
			return edits;
		},
	};
}

/** Extract every inline style in the file, reusing identical ones. */
export function analyzeAll(source: string): { count: number; edits(): Edit[] } | undefined {
	const ast = parseSource(source);
	if (!ast) {
		return undefined;
	}
	const sheet = findSheet(source, ast);
	const used = new Set(sheet ? keyNames(sheet.object) : []);
	const made = new Map<string, string>(); // fingerprint -> key created in this run
	const picks: Pick[] = [];
	for (const loc of allLocated(ast)) {
		const { fixed, dynamic } = splitProps(loc.object);
		if (!fixed.length) {
			continue;
		}
		const sig = canonProps(fixed);
		const existing = (sheet && findIdentical(sheet.object, fixed)) ?? made.get(sig);
		if (existing) {
			picks.push({ loc, key: existing, fixed, dynamic, add: false });
			continue;
		}
		const key = uniqueName(baseName(loc), used);
		used.add(key);
		made.set(sig, key);
		picks.push({ loc, key, fixed, dynamic, add: true });
	}
	return picks.length ? { count: picks.length, edits: () => build(source, ast, sheet, picks) } : undefined;
}

/** Ranges of inline style objects that have something to extract (for hints). */
export function inlineStyleRanges(source: string): { start: number; end: number }[] {
	const ast = parseSource(source);
	return ast ? allLocated(ast).filter((l) => splitProps(l.object).fixed.length).map((l) => ({ start: l.object.start!, end: l.object.end! })) : [];
}

function memberKey(m: MemberExpression): string | undefined {
	if (!m.computed) {
		return m.property.type === 'Identifier' ? m.property.name : undefined;
	}
	return m.property.type === 'StringLiteral' ? m.property.value : undefined;
}

/** Reverse of extract: replace `styles.key` under `offset` with the entry's object literal. */
export function analyzeInline(source: string, offset: number): { key: string; edits(): Edit[] } | undefined {
	const ast = parseSource(source);
	const hit = ast && attrAt(ast, offset);
	const expr = hit && expressionOf(hit.attr);
	if (!ast || !expr) {
		return undefined;
	}
	const members = expr.type === 'MemberExpression' ? [expr] : expr.type === 'ArrayExpression' ? expr.elements.filter((e): e is MemberExpression => e?.type === 'MemberExpression') : [];
	const ref = members.find((m) => within(m, offset)) ?? (members.length === 1 ? members[0] : undefined);
	const key = ref && memberKey(ref);
	const sheet = ref?.object.type === 'Identifier' ? findSheets(source, ast).find((s) => s.name === (ref.object as { name: string }).name) : undefined;
	const entryOf = sheet && key !== undefined ? objectEntries(sheet.object).find((e) => e.key === key) : undefined;
	if (!ref || !sheet || !entryOf || key === undefined) {
		return undefined;
	}
	const { prop, value } = entryOf;
	return {
		key,
		edits() {
			const props = value.properties.map((p) => text(source, p));
			const literal = props.some((p) => p.includes('\n'))
				? reindent(text(source, value), lineIndent(source, prop.start!), lineIndent(source, ref.start!))
				: props.length
					? `{ ${props.join(', ')} }`
					: '{}';
			const edits: Edit[] = [{ start: ref.start!, end: ref.end!, text: literal }];

			// Drop the key too when this was its only use and nothing touches the sheet as a whole.
			let uses = 0;
			let unsafe = false;
			walk(ast.program, (n, parent) => {
				if (n.type !== 'Identifier' || n.name !== sheet.name || (parent?.type === 'VariableDeclarator' && parent.id === n)) {
					return;
				}
				const k = parent?.type === 'MemberExpression' && parent.object === n ? memberKey(parent) : undefined;
				if (k === key) {
					uses++;
				} else if (k === undefined) {
					unsafe = true;
				}
			});
			const lineStart = source.lastIndexOf('\n', prop.start! - 1) + 1;
			const tail = /^[ \t]*,?[ \t]*(\r?\n|$)/.exec(source.slice(prop.end!));
			if (!unsafe && uses === 1 && tail && /^[ \t]*$/.test(source.slice(lineStart, prop.start!))) {
				edits.push({ start: lineStart, end: prop.end! + tail[0].length, text: '' });
			}
			return edits;
		},
	};
}
