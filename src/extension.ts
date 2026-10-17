import * as path from 'path';
import * as vscode from 'vscode';
import { analyze, analyzeAll, analyzeInline, Edit, inlineStyleRanges, keyOffset, Options, siblingOf, validateName } from './transform';

const LANGUAGES = ['javascript', 'javascriptreact', 'typescript', 'typescriptreact'];
const TITLE = 'Extract to StyleSheet';
const SOURCE = 'StyleLift';

export function activate(context: vscode.ExtensionContext) {
	const diagnostics = vscode.languages.createDiagnosticCollection('stylelift');
	const timers = new Map<string, NodeJS.Timeout>();

	function refresh(doc: vscode.TextDocument) {
		const on = vscode.workspace.getConfiguration('rnStyleExtract').get<boolean>('showHints', true);
		if (!on || !LANGUAGES.includes(doc.languageId)) {
			diagnostics.delete(doc.uri);
			return;
		}
		diagnostics.set(
			doc.uri,
			inlineStyleRanges(doc.getText()).map((r) => {
				const range = new vscode.Range(doc.positionAt(r.start), doc.positionAt(r.end));
				const d = new vscode.Diagnostic(range, 'Inline style: extract it to a StyleSheet.', vscode.DiagnosticSeverity.Hint);
				d.source = SOURCE;
				d.code = 'inline-style';
				return d;
			}),
		);
	}

	function refreshSoon(doc: vscode.TextDocument) {
		const key = doc.uri.toString();
		clearTimeout(timers.get(key));
		timers.set(key, setTimeout(() => refresh(doc), 300));
	}

	const command = (id: string, fn: (uri?: vscode.Uri, offset?: number) => Promise<void>) => vscode.commands.registerCommand(id, fn);

	context.subscriptions.push(
		diagnostics,
		{ dispose: () => timers.forEach(clearTimeout) },
		vscode.workspace.onDidOpenTextDocument(refresh),
		vscode.workspace.onDidChangeTextDocument((e) => refreshSoon(e.document)),
		vscode.workspace.onDidCloseTextDocument((doc) => diagnostics.delete(doc.uri)),
		vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration('rnStyleExtract') && vscode.workspace.textDocuments.forEach(refresh)),
		command('stylelift.extractStyle', (uri, offset) => extract(false, uri, offset)),
		command('stylelift.extractAndRename', (uri, offset) => extract(true, uri, offset)),
		command('stylelift.mergeIntoStyle', mergeIntoStyle),
		command('stylelift.extractAll', extractAll),
		command('stylelift.inlineStyle', inlineStyle),
		vscode.languages.registerCodeActionsProvider(LANGUAGES, { provideCodeActions }, {
			providedCodeActionKinds: [vscode.CodeActionKind.RefactorExtract, vscode.CodeActionKind.RefactorInline, vscode.CodeActionKind.QuickFix],
		}),
	);
	vscode.workspace.textDocuments.forEach(refresh);
}

async function provideCodeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext) {
	const text = document.getText();
	const offset = document.offsetAt(range.start);
	const options = await optionsFor(document);
	const actions: vscode.CodeAction[] = [];
	const add = (title: string, kind: vscode.CodeActionKind, id: string, at: number, diagnostic?: vscode.Diagnostic) => {
		const action = new vscode.CodeAction(title, kind);
		action.command = { command: id, title, arguments: [document.uri, at] };
		if (diagnostic) {
			action.diagnostics = [diagnostic];
			action.isPreferred = true;
		}
		actions.push(action);
	};

	const analysis = analyze(text, offset, options);
	if (analysis) {
		add(TITLE, vscode.CodeActionKind.RefactorExtract, 'stylelift.extractStyle', offset);
		if (!analysis.warning && !analysis.reuse) {
			add('Extract to StyleSheet and rename…', vscode.CodeActionKind.RefactorExtract, 'stylelift.extractAndRename', offset);
		}
		if (analysis.mergeKeys.length) {
			add('Merge into existing style…', vscode.CodeActionKind.RefactorExtract, 'stylelift.mergeIntoStyle', offset);
		}
		if (inlineStyleRanges(text).length > 1) {
			add('Extract all inline styles', vscode.CodeActionKind.RefactorExtract, 'stylelift.extractAll', offset);
		}
	}
	if (analyzeInline(text, offset, options)) {
		add('Inline style', vscode.CodeActionKind.RefactorInline, 'stylelift.inlineStyle', offset);
	}
	// The hint's own quick fix: the cursor may be elsewhere, so point at the diagnostic.
	for (const d of context.diagnostics.filter((x) => x.source === SOURCE)) {
		add(TITLE, vscode.CodeActionKind.QuickFix, 'stylelift.extractStyle', document.offsetAt(d.range.start), d);
	}
	return actions;
}

async function target(uri?: vscode.Uri, offset?: number) {
	const editor = vscode.window.activeTextEditor;
	const document = uri ? await vscode.workspace.openTextDocument(uri) : editor?.document;
	return document && { document, offset: offset ?? (editor ? document.offsetAt(editor.selection.start) : 0), options: await optionsFor(document) };
}

/** Settings, plus (for the separate-file placement) what the styles file next to `document` holds now. */
async function optionsFor(document: vscode.TextDocument): Promise<Partial<Options>> {
	const cfg = vscode.workspace.getConfiguration('rnStyleExtract');
	const options: Partial<Options> = {
		stylesName: cfg.get('stylesName', 'styles'),
		placement: cfg.get('placement', 'bottom'),
		factory: cfg.get('factory', 'StyleSheet.create'),
		sortKeys: cfg.get('sortKeys', false),
		fileName: path.basename(document.fileName),
	};
	const sib = document.uri.scheme === 'file' ? siblingOf({ placement: options.placement!, fileName: options.fileName }) : undefined;
	if (sib) {
		const uri = vscode.Uri.joinPath(document.uri, '..', sib.file);
		try {
			const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
			options.siblingText = open ? open.getText() : new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
		} catch {
			// no styles file yet: it gets created
		}
	}
	return options;
}

// One WorkspaceEdit = one undo step for every change together, in every file it touches.
async function apply(document: vscode.TextDocument, edits: Edit[]) {
	const edit = new vscode.WorkspaceEdit();
	const range = (doc: vscode.TextDocument, e: Edit) => new vscode.Range(doc.positionAt(e.start), doc.positionAt(e.end));
	for (const e of edits) {
		if (!e.file) {
			edit.replace(document.uri, range(document, e), e.text);
			continue;
		}
		const uri = vscode.Uri.joinPath(document.uri, '..', e.file);
		if (e.create) {
			edit.createFile(uri, { ignoreIfExists: true });
			edit.insert(uri, new vscode.Position(0, 0), e.text);
		} else {
			edit.replace(uri, range(await vscode.workspace.openTextDocument(uri), e), e.text);
		}
	}
	return vscode.workspace.applyEdit(edit);
}

const NOT_ON_STYLE = 'Put the cursor inside an inline style={{ … }} to extract it.';
const STALE = 'The file changed while you were choosing. Try again.';

async function extract(rename: boolean, uri?: vscode.Uri, offset?: number) {
	const t = await target(uri, offset);
	if (!t) {
		return;
	}
	const { document } = t;
	const version = document.version;
	const analysis = analyze(document.getText(), t.offset, t.options);
	if (!analysis) {
		vscode.window.showInformationMessage(NOT_ON_STYLE);
		return;
	}
	if (analysis.warning) {
		vscode.window.showWarningMessage(analysis.warning);
		return;
	}
	if (analysis.reuse) {
		await apply(document, analysis.edits(analysis.reuse));
		vscode.window.showInformationMessage(`An identical style already exists: reused "${analysis.reuse}".`);
		return;
	}
	let name: string | undefined = analysis.defaultName;
	if (!rename) {
		name = await vscode.window.showInputBox({
			prompt: 'Name for the new style',
			value: analysis.defaultName,
			validateInput: (value) => validateName(value, analysis.usedNames),
		});
	}
	if (name === undefined) {
		return;
	}
	// The edits are offsets into the text we analysed; refuse to apply them to a different one.
	if (document.version !== version) {
		vscode.window.showWarningMessage(STALE);
		return;
	}
	const edits = analysis.edits(name);
	await apply(document, edits);
	if (rename) {
		const editor = await vscode.window.showTextDocument(document);
		const pos = document.positionAt(keyOffset(edits));
		editor.selection = new vscode.Selection(pos, pos);
		// Not awaited: it resolves only once the user finishes (or cancels) the rename.
		void vscode.commands.executeCommand('editor.action.rename');
	}
}

async function mergeIntoStyle(uri?: vscode.Uri, offset?: number) {
	const t = await target(uri, offset);
	const analysis = t && analyze(t.document.getText(), t.offset, t.options);
	if (!t || !analysis || analysis.warning || !analysis.mergeKeys.length) {
		vscode.window.showInformationMessage('Nothing to merge: needs an inline style with static values and an existing style sheet.');
		return;
	}
	const version = t.document.version;
	const key = await vscode.window.showQuickPick(analysis.mergeKeys, { placeHolder: 'Merge into which style?' });
	if (key === undefined) {
		return;
	}
	if (t.document.version !== version) {
		vscode.window.showWarningMessage(STALE);
		return;
	}
	await apply(t.document, analysis.mergeEdits(key));
}

async function extractAll(uri?: vscode.Uri, offset?: number) {
	const t = await target(uri, offset);
	const all = t && analyzeAll(t.document.getText(), t.options);
	if (!t || !all) {
		vscode.window.showInformationMessage('No inline styles with static values in this file.');
		return;
	}
	await apply(t.document, all.edits());
	vscode.window.showInformationMessage(`Extracted ${all.count} inline style${all.count === 1 ? '' : 's'}.`);
}

async function inlineStyle(uri?: vscode.Uri, offset?: number) {
	const t = await target(uri, offset);
	const inline = t && analyzeInline(t.document.getText(), t.offset, t.options);
	if (!t || !inline) {
		vscode.window.showInformationMessage('Put the cursor on a styles.<name> reference to inline it.');
		return;
	}
	await apply(t.document, inline.edits());
}

export function deactivate() {}
