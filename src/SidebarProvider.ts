import * as vscode from "vscode";
import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";

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
        await this.runCode(data.input, data.expected);
      }
    });
  }

  private async runCode(input: string, expectedOutput: string) {
    if (!this._view) { return; }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No active editor found");
      return;
    }

    await editor.document.save();
    
    const filePath = editor.document.fileName;
    const fileDir = path.dirname(filePath);
    const fileName = path.basename(filePath, path.extname(filePath));
    
    const isWindows = process.platform === "win32";
    const exeName = isWindows ? `${fileName}.exe` : `${fileName}.out`;
    const exePath = path.join(fileDir, exeName);

    this._view.webview.postMessage({ type: 'status', value: 'Compiling...' });

    const compileCommand = `g++ -std=c++17 "${filePath}" -o "${exePath}"`;

    cp.exec(compileCommand, (error, stdout, stderr) => {
      if (error) {
        this._view?.webview.postMessage({ 
          type: 'result', 
          output: `Compilation Error:\n${stderr}`,
          isError: true 
        });
        return;
      }

      this._view?.webview.postMessage({ type: 'status', value: 'Running...' });

      const child = cp.spawn(exePath, [], {
        cwd: fileDir
      });

      let actualOutput = "";
      let errorOutput = "";

      if (input) {
        child.stdin.write(input);
        child.stdin.end();
      }

      child.stdout.on("data", (data) => {
        actualOutput += data.toString();
      });

      child.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      const timeout = setTimeout(() => {
        child.kill();
        this._view?.webview.postMessage({ 
          type: 'result', 
          output: "Time Limit Exceeded (2s)", 
          isError: true 
        });
      }, 2000);

      child.on("close", (code) => {
        clearTimeout(timeout);
        
        if (fs.existsSync(exePath)) {
            try {
                fs.unlinkSync(exePath);
            } catch (e) {
                console.error(e);
            }
        }
        
        let finalResult = actualOutput;
        if (errorOutput) {
            finalResult += `\n[Stderr]:\n${errorOutput}`;
        }
        
        const passed = expectedOutput && finalResult.trim() === expectedOutput.trim();

        this._view?.webview.postMessage({ 
          type: 'result', 
          output: finalResult,
          isError: code !== 0,
          passed: passed
        });
      });
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
            body { font-family: var(--vscode-font-family); background-color: var(--vscode-sideBar-background); color: var(--vscode-editor-foreground); padding: 10px; }
            h3 { font-size: 11px; text-transform: uppercase; margin-bottom: 8px; color: var(--vscode-sideBarTitle-foreground); font-weight: bold; }
            .test-case { background-color: var(--vscode-list-hoverBackground); border: 1px solid var(--vscode-panel-border); padding: 10px; margin-bottom: 15px; border-radius: 4px; }
            textarea { width: 100%; background-color: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 6px; box-sizing: border-box; margin-bottom: 10px; font-family: var(--vscode-editor-font-family); font-size: 12px; resize: vertical; min-height: 50px; }
            textarea:focus { outline: 1px solid var(--vscode-focusBorder); }
            textarea[readonly] { opacity: 0.8; }
            button { width: 100%; background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px; cursor: pointer; font-size: 13px; border-radius: 2px; font-weight: 600; }
            button:hover { background-color: var(--vscode-button-hoverBackground); }
            .label { font-size: 11px; margin-bottom: 4px; color: var(--vscode-descriptionForeground); display: block; }
            .status { font-size: 11px; margin-left: 5px; font-style: italic; }
            .success { color: #4EC9B0; }
            .error { color: #F14C4C; }
        </style>
    </head>
    <body>
        <div class="test-case">
            <h3>Test Case 1 <span id="status" class="status"></span></h3>
            
            <span class="label">Input</span>
            <textarea id="input1" rows="3">10</textarea>

            <span class="label">Expected Output</span>
            <textarea id="expected1" rows="3">55</textarea>

            <span class="label">Actual Output</span>
            <textarea id="output1" rows="3" readonly placeholder="Result..."></textarea>
        </div>

        <button id="runBtn" onclick="runTests()">Run</button>

        <script>
            const vscode = acquireVsCodeApi();
            const runBtn = document.getElementById('runBtn');
            const outputBox = document.getElementById('output1');
            const statusLabel = document.getElementById('status');

            window.addEventListener('message', event => {
                const message = event.data;
                
                if (message.type === 'status') {
                    statusLabel.innerText = message.value;
                    statusLabel.className = 'status';
                } 
                else if (message.type === 'result') {
                    outputBox.value = message.output;
                    runBtn.disabled = false;
                    runBtn.innerText = 'Run';
                    
                    if (message.isError) {
                         statusLabel.innerText = 'Error';
                         statusLabel.className = 'status error';
                    } else if (message.passed) {
                         statusLabel.innerText = 'Passed';
                         statusLabel.className = 'status success';
                    } else {
                         statusLabel.innerText = 'Finished';
                         statusLabel.className = 'status';
                    }
                }
            });

            function runTests() {
                const input = document.getElementById('input1').value;
                const expected = document.getElementById('expected1').value;
                
                runBtn.disabled = true;
                runBtn.innerText = 'Running...';
                outputBox.value = '';
                statusLabel.innerText = '';
                
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