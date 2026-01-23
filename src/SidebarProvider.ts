import * as vscode from "vscode";

export class SidebarProvider implements vscode.WebviewViewProvider {
  _view?: vscode.WebviewView;

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      if (data.command === "run") {
        vscode.window.showInformationMessage(
          `Running test... Input: ${data.input.substring(0, 10)}...`
        );
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Asymptote Runner</title>
        <style>
            body {
                font-family: var(--vscode-font-family);
                background-color: var(--vscode-sideBar-background);
                color: var(--vscode-editor-foreground);
                padding: 10px;
            }
            h3 {
                font-size: 11px;
                text-transform: uppercase;
                margin-bottom: 8px;
                color: var(--vscode-sideBarTitle-foreground);
                font-weight: bold;
            }
            .test-case {
                background-color: var(--vscode-list-hoverBackground);
                border: 1px solid var(--vscode-panel-border);
                padding: 10px;
                margin-bottom: 15px;
                border-radius: 4px;
            }
            textarea {
                width: 100%;
                background-color: var(--vscode-input-background);
                color: var(--vscode-input-foreground);
                border: 1px solid var(--vscode-input-border);
                padding: 6px;
                box-sizing: border-box;
                margin-bottom: 10px;
                font-family: var(--vscode-editor-font-family);
                font-size: 12px;
                resize: vertical;
                min-height: 50px;
            }
            textarea:focus {
                outline: 1px solid var(--vscode-focusBorder);
            }
            button {
                width: 100%;
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 8px;
                cursor: pointer;
                font-size: 13px;
                border-radius: 2px;
                font-weight: 600;
            }
            button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
            .label {
                font-size: 11px;
                margin-bottom: 4px;
                color: var(--vscode-descriptionForeground);
                display: block;
            }
        </style>
    </head>
    <body>
        <div class="test-case">
            <h3>Test Case 1</h3>
            
            <span class="label">Input</span>
            <textarea id="input1" rows="3">10</textarea>

            <span class="label">Expected Output</span>
            <textarea id="expected1" rows="3">55</textarea>

            <span class="label">Actual Output</span>
            <textarea id="output1" rows="3" readonly placeholder="Result..."></textarea>
        </div>

        <button onclick="runTests()">Run</button>

        <script>
            const vscode = acquireVsCodeApi();
            function runTests() {
                const input = document.getElementById('input1').value;
                const expected = document.getElementById('expected1').value;
                vscode.postMessage({ 
                    command: 'run',
                    input: input,
                    expected: expected
                });
            }
        </script>
    </body>
    </html>`;
  }
}