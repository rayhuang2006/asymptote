import * as vscode from 'vscode';

export class CphPanel {
    public static currentPanel: CphPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        
        this._panel.webview.html = this._getHtmlForWebview();
    }

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.ViewColumn.Two
            : undefined;

        if (CphPanel.currentPanel) {
            CphPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'asymptoteRunner',
            'Asymptote Runner',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true
            }
        );

        CphPanel.currentPanel = new CphPanel(panel, extensionUri);
    }

    public dispose() {
        CphPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _getHtmlForWebview() {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Asymptote Runner</title>
            <style>
                body { font-family: sans-serif; padding: 10px; }
                .test-case { background: #252526; padding: 10px; margin-bottom: 10px; border-radius: 5px; }
                textarea { width: 100%; background: #3c3c3c; color: #ccc; border: none; padding: 5px; }
                button { background: #0e639c; color: white; border: none; padding: 8px 16px; cursor: pointer; border-radius: 2px; }
                button:hover { background: #1177bb; }
                h3 { margin-top: 0; color: #cccccc; }
            </style>
        </head>
        <body>
            <h2>Asymptote Runner</h2>
            <div class="test-case">
                <h3>Test Case 1</h3>
                <p>Input:</p>
                <textarea rows="3">10</textarea>
                <p>Output:</p>
                <textarea rows="3" readonly></textarea>
            </div>
            <button onclick="runTests()">Run All Tests</button>

            <script>
                const vscode = acquireVsCodeApi();
                function runTests() {
                    vscode.postMessage({ command: 'run' });
                }
            </script>
        </body>
        </html>`;
    }
}