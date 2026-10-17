import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

const SOURCE = `import { View } from 'react-native';

export const A = () => <View style={{ margin: 4 }} />;
`;
const TWO = `import { View, Text } from 'react-native';

export const A = () => (
  <View style={{ flex: 1 }}>
    <Text style={{ fontSize: 20 }}>hi</Text>
  </View>
);
`;
const TITLE = 'Extract to StyleSheet';

async function open(content: string) {
	await vscode.extensions.all.find((e) => e.packageJSON.name === 'stylelift')!.activate();
	const doc = await vscode.workspace.openTextDocument({ language: 'typescriptreact', content });
	return { doc, editor: await vscode.window.showTextDocument(doc) };
}

async function titlesAt(doc: vscode.TextDocument, offset: number): Promise<string[]> {
	const pos = doc.positionAt(offset);
	try {
		const actions = await vscode.commands.executeCommand<vscode.CodeAction[]>(
			'vscode.executeCodeActionProvider',
			doc.uri,
			new vscode.Selection(pos, pos),
			vscode.CodeActionKind.RefactorExtract.value,
		);
		return actions.map((a) => a.title);
	} catch {
		return []; // "Canceled" while the freshly opened editor is still settling
	}
}

/** The first queries after opening a document can come back empty; wait until the provider answers. */
async function waitForAction(doc: vscode.TextDocument, offset: number) {
	for (let i = 0; i < 50 && !(await titlesAt(doc, offset)).includes(TITLE); i++) {
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
}

/** Run the extract command with the name prompt answered by `name`. */
async function extractAs(name: string, uri: vscode.Uri, offset: number) {
	const original = vscode.window.showInputBox;
	vscode.window.showInputBox = async () => name;
	try {
		await vscode.commands.executeCommand('stylelift.extractStyle', uri, offset);
	} finally {
		vscode.window.showInputBox = original;
	}
}

suite('StyleLift extension', function () {
	this.timeout(10000);

	test('offers the action on an inline style; one edit, one undo', async () => {
		const { doc, editor } = await open(SOURCE);
		const margin = SOURCE.indexOf('margin');
		editor.selection = new vscode.Selection(doc.positionAt(margin), doc.positionAt(margin));

		await waitForAction(doc, margin);
		assert.ok((await titlesAt(doc, margin)).includes(TITLE), 'code action offered');

		const original = vscode.window.showInputBox;
		let suggested: string | undefined;
		vscode.window.showInputBox = async (options) => {
			suggested = options?.value;
			return 'box';
		};
		try {
			await vscode.commands.executeCommand('stylelift.extractStyle');
		} finally {
			vscode.window.showInputBox = original;
		}

		assert.strictEqual(suggested, 'container');
		const after = doc.getText();
		assert.match(after, /import \{ View, StyleSheet \} from 'react-native';/);
		assert.match(after, /<View style=\{styles\.box\} \/>/);
		assert.match(after, /const styles = StyleSheet\.create\(\{\n {2}box: \{\n {4}margin: 4,/);

		await vscode.commands.executeCommand('undo');
		assert.strictEqual(doc.getText(), SOURCE, 'a single undo reverts replacement, sheet and import');
	});

	test('no action away from an inline style', async () => {
		const { doc } = await open(SOURCE);
		await waitForAction(doc, SOURCE.indexOf('margin')); // proves the provider is live
		assert.ok(!(await titlesAt(doc, SOURCE.indexOf('export'))).includes(TITLE));
	});

	test('hint with a quick fix on every extractable inline style', async () => {
		const { doc } = await open(TWO);
		const hints = async () => vscode.languages.getDiagnostics(doc.uri).filter((d) => d.source === 'StyleLift');
		for (let i = 0; i < 50 && (await hints()).length < 2; i++) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		const found = await hints();
		assert.strictEqual(found.length, 2);
		assert.strictEqual(found[0].severity, vscode.DiagnosticSeverity.Hint);

		const pos = found[0].range.start;
		let fixes: vscode.CodeAction[] = [];
		for (let i = 0; i < 50 && !fixes.some((a) => a.title === TITLE); i++) {
			fixes = await vscode.commands.executeCommand<vscode.CodeAction[]>('vscode.executeCodeActionProvider', doc.uri, new vscode.Selection(pos, pos), vscode.CodeActionKind.QuickFix.value);
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
		assert.ok(fixes.some((a) => a.title === TITLE), 'quick fix offered on the hint');
	});

	test('extract all is one undo step; inline reverses a reference', async () => {
		const { doc } = await open(TWO);
		await vscode.commands.executeCommand('stylelift.extractAll', doc.uri, 0);
		const after = doc.getText();
		assert.match(after, /<View style=\{styles\.container\}>/);
		assert.match(after, /<Text style=\{styles\.text\}>/);
		assert.strictEqual((after.match(/StyleSheet\.create/g) ?? []).length, 1);

		await vscode.commands.executeCommand('stylelift.inlineStyle', doc.uri, after.indexOf('styles.text'));
		assert.match(doc.getText(), /<Text style=\{\{ fontSize: 20 \}\}>/);

		await vscode.commands.executeCommand('undo');
		await vscode.commands.executeCommand('undo');
		assert.strictEqual(doc.getText(), TWO, 'each action is exactly one undo step');
	});

	test('extract and rename leaves the cursor on the new key', async () => {
		const { doc, editor } = await open(SOURCE);
		await vscode.commands.executeCommand('stylelift.extractAndRename', doc.uri, SOURCE.indexOf('margin'));
		const at = editor.selection.active;
		assert.strictEqual(doc.getText(new vscode.Range(at, at.translate(0, 'container'.length))), 'container');
		await vscode.commands.executeCommand('cancelRenameInput').then(undefined, () => undefined);
	});

	test('settings: stylesName, factory, sortKeys', async () => {
		const cfg = vscode.workspace.getConfiguration('rnStyleExtract');
		await cfg.update('stylesName', 's', vscode.ConfigurationTarget.Global);
		await cfg.update('sortKeys', true, vscode.ConfigurationTarget.Global);
		try {
			const src = SOURCE.replace('margin: 4', 'padding: 1, margin: 4');
			const { doc } = await open(src);
			await extractAs('container', doc.uri, src.indexOf('margin'));
			assert.match(doc.getText(), /<View style=\{s\.container\} \/>/);
			assert.match(doc.getText(), /const s = StyleSheet\.create\(\{\n {2}container: \{\n {4}margin: 4,\n {4}padding: 1,/);
		} finally {
			await cfg.update('stylesName', undefined, vscode.ConfigurationTarget.Global);
			await cfg.update('sortKeys', undefined, vscode.ConfigurationTarget.Global);
		}
	});

	test('separate file: creates Component.styles.ts, imports it, one undo', async () => {
		const dir = vscode.Uri.file(fs.mkdtempSync(path.join(os.tmpdir(), 'stylelift-')));
		const main = vscode.Uri.joinPath(dir, 'Card.tsx');
		await vscode.workspace.fs.writeFile(main, Buffer.from(SOURCE));
		const cfg = vscode.workspace.getConfiguration('rnStyleExtract');
		await cfg.update('placement', 'separateFile', vscode.ConfigurationTarget.Global);
		try {
			await vscode.extensions.all.find((e) => e.packageJSON.name === 'stylelift')!.activate();
			const doc = await vscode.workspace.openTextDocument(main);
			await vscode.window.showTextDocument(doc);
			await extractAs('container', doc.uri, SOURCE.indexOf('margin'));

			assert.match(doc.getText(), /import \{ styles \} from '\.\/Card\.styles';/);
			assert.match(doc.getText(), /<View style=\{styles\.container\} \/>/);
			assert.ok(!doc.getText().includes('StyleSheet.create'), 'no sheet left in the component file');
			const sibling = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(dir, 'Card.styles.ts'));
			assert.strictEqual(sibling.getText(), "import { StyleSheet } from 'react-native';\n\nexport const styles = StyleSheet.create({\n  container: {\n    margin: 4,\n  },\n});\n");

			await vscode.window.showTextDocument(doc);
			await vscode.commands.executeCommand('undo');
			assert.strictEqual(doc.getText(), SOURCE, 'undo restores the component file');
			assert.strictEqual(sibling.getText(), '', 'and empties (or removes) the created file');
		} finally {
			await cfg.update('placement', undefined, vscode.ConfigurationTarget.Global);
		}
	});
});
