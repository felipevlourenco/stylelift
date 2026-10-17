import { parse, type ParseResult } from '@babel/parser';
import type { ArrayExpression, File, ImportDeclaration, ImportSpecifier, JSXAttribute, JSXOpeningElement, Node, ObjectExpression } from '@babel/types';

export interface Located {
	ast: File;
	/** The style object literal the cursor is on. */
	object: ObjectExpression;
	/** The `[...]` the object sits in, when `style` is an array. */
	array?: ArrayExpression;
	/** JSX element name, e.g. `View` (last segment of `Animated.View`). */
	element: string;
}

export function parseSource(source: string): ParseResult<File> | undefined {
	try {
		return parse(source, { sourceType: 'module', plugins: ['jsx', 'typescript'], errorRecovery: true });
	} catch {
		return undefined;
	}
}

const within = (n: Node, offset: number) => n.start! <= offset && offset <= n.end!;

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

// RN components are capitalised; a lowercase tag (`<div style>`) is DOM, not ours.
function rnElementName(opening: JSXOpeningElement): string | undefined {
	const { name } = opening;
	const id = name.type === 'JSXIdentifier' ? name.name : name.type === 'JSXMemberExpression' ? name.property.name : '';
	return /^[A-Z]/.test(id) ? id : undefined;
}

/** Innermost `style` attribute containing `offset` (children are visited before their parent). */
function findStyleAttr(node: Node, offset: number, opening?: JSXOpeningElement): { attr: JSXAttribute; element: string } | undefined {
	if (!within(node, offset)) {
		return undefined;
	}
	const open = node.type === 'JSXOpeningElement' ? node : opening;
	for (const child of children(node)) {
		const hit = findStyleAttr(child, offset, open);
		if (hit) {
			return hit;
		}
	}
	if (node.type === 'JSXAttribute' && node.name.type === 'JSXIdentifier' && node.name.name === 'style' && open) {
		const element = rnElementName(open);
		return element ? { attr: node, element } : undefined;
	}
	return undefined;
}

/** Find the inline style object under `offset`: `style={{ … }}` or an object inside `style={[…]}`. */
export function locate(source: string, offset: number): Located | undefined {
	const ast = parseSource(source);
	const hit = ast && findStyleAttr(ast.program, offset);
	if (!ast || !hit || hit.attr.value?.type !== 'JSXExpressionContainer') {
		return undefined;
	}
	const expr = hit.attr.value.expression;
	if (expr.type === 'ObjectExpression') {
		return { ast, object: expr, element: hit.element };
	}
	if (expr.type === 'ArrayExpression') {
		const objects = expr.elements.filter((e): e is ObjectExpression => e?.type === 'ObjectExpression');
		const object = objects.find((o) => within(o, offset)) ?? (objects.length === 1 ? objects[0] : undefined);
		return object && { ast, object, array: expr, element: hit.element };
	}
	return undefined;
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
	/** Edits (offsets into the analysed source) that perform the extraction under `name`. */
	edits(name: string): Edit[];
}

const SHEET = 'styles';
const FACTORY = 'StyleSheet.create';

/** First indented line decides: a tab, or its run of spaces. */
function detectIndent(source: string): string {
	return /^(\t| {2,})(?=\S)/m.exec(source)?.[1] ?? '  ';
}

function lineIndent(source: string, pos: number): string {
	return /^[ \t]*/.exec(source.slice(source.lastIndexOf('\n', pos - 1) + 1))![0];
}

/** Move continuation lines of a multi-line snippet from one base indent to another. */
function reindent(text: string, from: string, to: string): string {
	return text
		.split('\n')
		.map((line, i) => (i === 0 ? line : to + (line.startsWith(from) ? line.slice(from.length) : line.trimStart())))
		.join('\n');
}

function importEdit(ast: File, source: string): Edit | undefined {
	const imports = ast.program.body.filter((n): n is ImportDeclaration => n.type === 'ImportDeclaration' && n.importKind !== 'type');
	if (imports.some((i) => i.specifiers.some((s) => s.local.name === 'StyleSheet'))) {
		return undefined;
	}
	const rn = imports.find((i) => i.source.value === 'react-native' && i.specifiers.some((s) => s.type === 'ImportSpecifier'));
	if (rn) {
		const last = rn.specifiers.filter((s): s is ImportSpecifier => s.type === 'ImportSpecifier').at(-1)!;
		const multiline = source.slice(rn.start!, rn.end!).includes('\n');
		const text = multiline ? `,\n${lineIndent(source, last.start!)}StyleSheet` : ', StyleSheet';
		return { start: last.end!, end: last.end!, text };
	}
	const line = "import { StyleSheet } from 'react-native';";
	const lastImport = imports.at(-1);
	if (lastImport) {
		return { start: lastImport.end!, end: lastImport.end!, text: '\n' + line };
	}
	const at = ast.program.body[0]?.start ?? 0;
	return { start: at, end: at, text: line + '\n\n' };
}

/** `key: {\n<props>\n}` at `keyIndent`, props verbatim from the source; `comma` = trailing commas (match the file). */
function entry(source: string, name: string, props: Node[], keyIndent: string, unit: string, comma: boolean): string {
	const inner = keyIndent + unit;
	const body = props.map((p) => inner + reindent(source.slice(p.start!, p.end!), lineIndent(source, p.start!), inner));
	const trailing = comma ? ',' : '';
	return `${keyIndent}${name}: {\n${body.join(',\n')}${trailing}\n${keyIndent}}${trailing}`;
}

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

const DEFAULT_KEYS: Record<string, string> = { View: 'container', Text: 'text', Image: 'image' };

export function validateName(name: string, used: ReadonlySet<string>): string | undefined {
	if (!/^[\p{ID_Start}$_][\p{ID_Continue}$\u200c\u200d]*$/u.test(name)) {
		return `"${name}" is not a valid identifier`;
	}
	return used.has(name) ? `"${name}" is already defined in the style sheet` : undefined;
}

function uniqueName(base: string, used: ReadonlySet<string>): string {
	let name = base;
	for (let i = 2; used.has(name); i++) {
		name = base + i;
	}
	return name;
}

function keyNames(object: ObjectExpression): string[] {
	return object.properties.flatMap((p) => {
		if (p.type !== 'ObjectProperty' || p.computed) {
			return [];
		}
		return p.key.type === 'Identifier' ? [p.key.name] : p.key.type === 'StringLiteral' ? [p.key.value] : [];
	});
}

/** Top-level `const x = StyleSheet.create({...})`; prefers the one named `styles`. */
function findSheet(source: string, ast: File): { name: string; object: ObjectExpression } | undefined {
	const sheets = [];
	for (const stmt of ast.program.body) {
		const decl = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt;
		for (const d of decl?.type === 'VariableDeclaration' ? decl.declarations : []) {
			const init = d.init;
			if (d.id.type === 'Identifier' && init?.type === 'CallExpression' && source.slice(init.callee.start!, init.callee.end!) === FACTORY && init.arguments[0]?.type === 'ObjectExpression') {
				sheets.push({ name: d.id.name, object: init.arguments[0] });
			}
		}
	}
	return sheets.find((s) => s.name === SHEET) ?? sheets[0];
}

/** Append `key: {...}` to an existing style sheet object. */
function appendToSheet(source: string, sheet: ObjectExpression, name: string, props: Node[], unit: string): Edit[] {
	const first = sheet.properties[0];
	if (!first) {
		const base = lineIndent(source, sheet.start!);
		const text = `\n${entry(source, name, props, base + unit, unit, true)}\n${base}`;
		return [{ start: sheet.start! + 1, end: sheet.end! - 1, text }];
	}
	const edits: Edit[] = [];
	const comma = sheet.extra?.trailingComma !== undefined;
	if (!comma) {
		const last = sheet.properties.at(-1)!;
		edits.push({ start: last.end!, end: last.end!, text: ',' });
	}
	const text = entry(source, name, props, lineIndent(source, first.start!), unit, comma);
	const close = sheet.end! - 1;
	const lineStart = source.lastIndexOf('\n', close) + 1;
	const alone = /^\s*$/.test(source.slice(lineStart, close));
	edits.push(alone ? { start: lineStart, end: lineStart, text: text + '\n' } : { start: close, end: close, text: `\n${text}\n` });
	return edits;
}

export function analyze(source: string, offset: number): Analysis | undefined {
	const hit = locate(source, offset);
	if (!hit) {
		return undefined;
	}
	const { ast, object, element } = hit;
	const sheet = findSheet(source, ast);
	const used = new Set(sheet ? keyNames(sheet.object) : []);
	const { fixed, dynamic } = splitProps(object);
	return {
		defaultName: uniqueName(DEFAULT_KEYS[element] ?? element[0].toLowerCase() + element.slice(1), used),
		usedNames: used,
		warning: fixed.length ? undefined : 'Nothing to extract: this style has no static values (everything depends on props, state or variables).',
		edits(name) {
			if (!fixed.length) {
				return [];
			}
			const unit = detectIndent(source);
			// Dynamic leftovers stay inline next to the new key: `[styles.x, { width: size }]`.
			const ref = `${sheet?.name ?? SHEET}.${name}`;
			const rest = dynamic.map((p) => source.slice(p.start!, p.end!)).join(', ');
			const text = !dynamic.length ? ref : hit.array ? `${ref}, { ${rest} }` : `[${ref}, { ${rest} }]`;
			const edits: Edit[] = [{ start: object.start!, end: object.end!, text }];
			const imp = importEdit(ast, source);
			if (imp) {
				edits.push(imp);
			}
			if (sheet) {
				edits.push(...appendToSheet(source, sheet.object, name, fixed, unit));
			} else {
				const code = `const ${SHEET} = ${FACTORY}({\n${entry(source, name, fixed, unit, unit, true)}\n});`;
				const end = source.trimEnd().length;
				edits.push({ start: end, end: source.length, text: `\n\n${code}\n` });
			}
			return edits;
		},
	};
}
