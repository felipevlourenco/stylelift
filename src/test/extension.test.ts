import * as assert from 'assert';
import * as vscode from 'vscode';

const SOURCE = `import { View } from 'react-native';

export const A = () => <View style={{ margin: 4 }} />;
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

suite('StyleLift extension', () => {
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
});
