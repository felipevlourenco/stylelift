import * as vscode from 'vscode';
import { analyze, validateName } from './transform';

const LANGUAGES = ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'];
const TITLE = 'Extract to StyleSheet';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('stylelift.extractStyle', extractStyle),
		vscode.languages.registerCodeActionsProvider(
			LANGUAGES,
			{
				provideCodeActions(document, range) {
					if (!analyze(document.getText(), document.offsetAt(range.start))) {
						return undefined;
					}
					const action = new vscode.CodeAction(TITLE, vscode.CodeActionKind.RefactorExtract);
					action.command = { command: 'stylelift.extractStyle', title: TITLE };
					return [action];
				},
			},
			{ providedCodeActionKinds: [vscode.CodeActionKind.RefactorExtract] },
		),
	);
}

async function extractStyle() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}
	const { document } = editor;
	const version = document.version;
	const analysis = analyze(document.getText(), document.offsetAt(editor.selection.start));
	if (!analysis) {
		vscode.window.showInformationMessage('Put the cursor inside an inline style={{ … }} to extract it.');
		return;
	}
	if (analysis.warning) {
		vscode.window.showWarningMessage(analysis.warning);
		return;
	}
	const name = await vscode.window.showInputBox({
		prompt: 'Name for the new style',
		value: analysis.defaultName,
		validateInput: (value) => validateName(value, analysis.usedNames),
	});
	if (name === undefined) {
		return;
	}
	// The edits are offsets into the text we analysed; refuse to apply them to a different one.
	if (document.version !== version) {
		vscode.window.showWarningMessage('The file changed while you were naming the style. Try again.');
		return;
	}
	// One WorkspaceEdit = one undo step for the replacement, the sheet and the import together.
	const edit = new vscode.WorkspaceEdit();
	for (const e of analysis.edits(name)) {
		edit.replace(document.uri, new vscode.Range(document.positionAt(e.start), document.positionAt(e.end)), e.text);
	}
	await vscode.workspace.applyEdit(edit);
}

export function deactivate() {}
