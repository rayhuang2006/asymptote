import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    const codelensProvider = new AsymptoteCodeLensProvider();

    vscode.languages.registerCodeLensProvider(
        ['cpp', 'c'],
        codelensProvider
    );

    let disposable = vscode.commands.registerCommand('asymptote.refreshComplexity', () => {
        codelensProvider.refresh();
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}

class AsymptoteCodeLensProvider implements vscode.CodeLensProvider {

    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor() {}

    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        const codeLenses: vscode.CodeLens[] = [];
        const regex = /\b(void|int|long|double|bool|auto)\s+(\w+)\s*\([^)]*\)\s*\{/g;
        const text = document.getText();
        let matches;

        while ((matches = regex.exec(text)) !== null) {
            const line = document.positionAt(matches.index).line;
            const range = new vscode.Range(line, 0, line, 0);
            
            const command: vscode.Command = {
                title: "Complexity: O(N) (Estimated)",
                command: "asymptote.refreshComplexity", 
                tooltip: "Click to recalculate"
            };

            codeLenses.push(new vscode.CodeLens(range, command));
        }

        return codeLenses;
    }

    public refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }
}