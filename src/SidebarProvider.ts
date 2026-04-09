import * as vscode from "vscode";
import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import { performance } from "perf_hooks";
import { Scraper } from "./utils/Scraper";

export class SidebarProvider implements vscode.WebviewViewProvider {
  _view?: vscode.WebviewView;
  private currentInteractiveProcess?: cp.ChildProcess;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext
  ) {}

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

    const savedState = this._context.workspaceState.get('asymptote-state') as any;
    if (savedState) {
        setTimeout(() => {
            this._view?.webview.postMessage({
                type: 'restore-state',
                state: savedState
            });
        }, 500);
    }

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.command) {
        case "run":
          await this.runTests(data.testCases);
          break;
        case "run-interactive":
          await this.runInteractive();
          break;
        case "interactive-input":
          if (this.currentInteractiveProcess && this.currentInteractiveProcess.stdin) {
            try {
                this.currentInteractiveProcess.stdin.write(data.text + '\n');
            } catch (e) {}
          }
          break;
        case "stop-interactive":
          if (this.currentInteractiveProcess) {
            this.currentInteractiveProcess.kill();
            this.currentInteractiveProcess = undefined;
          }
          break;
        case "parse-url":
          await this.handleParseUrl(data.url);
          break;
        case "manual-create":
          this._view?.webview.postMessage({ 
              type: 'navigate', 
              view: 'workspace',
              tab: 'runner',
              problemHtml: '<div style="padding:20px;text-align:center;opacity:0.6;">Manual Mode<br>No problem loaded.</div>'
          });
          break;
        case "save-state":
            await this._context.workspaceState.update('asymptote-state', data.state);
            break;
        case "showError":
            vscode.window.showErrorMessage(data.text);
            break;
      }
    });
  }

  private async handleParseUrl(url: string) {
      if (!this._view) {return;}

      this._view.webview.postMessage({ type: 'status', value: 'Fetching...' });

      try {
          const problem = await Scraper.parse(url);

          const fullProblemHtml = `
            <h2 style="margin-top:0">${problem.title}</h2>
            <div style="font-size:11px; opacity:0.8; margin-bottom:15px; border-bottom:1px solid var(--vscode-panel-border); padding-bottom:10px;">
                time limit: ${problem.timeLimit} | memory limit: ${problem.memoryLimit}
            </div>
            ${problem.htmlContent}
          `;

          this._view.webview.postMessage({ 
              type: 'navigate', 
              view: 'workspace',
              tab: 'problem',
              problemHtml: fullProblemHtml,
              initialData: problem.testCases
          });

      } catch (error: any) {
          vscode.window.showErrorMessage(`Scraping Failed: ${error.message}`);
          this._view.webview.postMessage({ type: 'status', value: 'Error' });
      }
  }

  private getExecutionStrategy(filePath: string, fileDir: string, fileName: string) {
      const ext = path.extname(filePath).toLowerCase();
      const isWindows = process.platform === "win32";
      
      if (ext === '.py') {
          const pyCmd = isWindows ? 'python' : 'python3';
          return {
              compileCommand: undefined,
              runCommand: pyCmd,
              runArgs: [filePath],
              cleanupFiles: []
          };
      } else if (ext === '.java') {
          return {
              compileCommand: `javac "${filePath}"`,
              runCommand: 'java',
              runArgs: [fileName],
              cleanupFiles: [path.join(fileDir, `${fileName}.class`)]
          };
      } else {
          const exeName = isWindows ? `${fileName}.exe` : `${fileName}.out`;
          const exePath = path.join(fileDir, exeName);
          return {
              compileCommand: `g++ -std=c++17 "${filePath}" -o "${exePath}"`,
              runCommand: exePath,
              runArgs: [],
              cleanupFiles: [exePath]
          };
      }
  }

  private async runInteractive() {
    if (!this._view) {return;}

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No active editor found");
      this._view.webview.postMessage({ type: 'interactive-stopped' });
      return;
    }

    await editor.document.save();
    
    const filePath = editor.document.fileName;
    const fileDir = path.dirname(filePath);
    const fileName = path.basename(filePath, path.extname(filePath));
    
    const strategy = this.getExecutionStrategy(filePath, fileDir, fileName);

    const executeAndSpawn = () => {
      this._view?.webview.postMessage({ type: 'interactive-system', value: 'Running Interactive Mode...' });

      if (this.currentInteractiveProcess) {
          this.currentInteractiveProcess.kill();
      }

      this.currentInteractiveProcess = cp.spawn(strategy.runCommand, strategy.runArgs, { cwd: fileDir });

      this.currentInteractiveProcess.stdout?.on('data', (data) => {
          this._view?.webview.postMessage({
              type: 'interactive-stdout',
              data: data.toString()
          });
      });

      this.currentInteractiveProcess.stderr?.on('data', (data) => {
          this._view?.webview.postMessage({
              type: 'interactive-stderr',
              data: data.toString()
          });
      });

      this.currentInteractiveProcess.on('close', (code) => {
          this._view?.webview.postMessage({
              type: 'interactive-exit',
              code: code
          });
          this.currentInteractiveProcess = undefined;
          strategy.cleanupFiles.forEach(f => {
              if (fs.existsSync(f)) {
                  try { fs.unlinkSync(f); } catch (e) {}
              }
          });
      });
    };

    if (strategy.compileCommand) {
        this._view.webview.postMessage({ type: 'interactive-system', value: 'Compiling...' });
        cp.exec(strategy.compileCommand, { cwd: fileDir }, (error, stdout, stderr) => {
            if (error) {
                this._view?.webview.postMessage({ 
                  type: 'interactive-error', 
                  value: `Compilation Error:\n${stderr}`
                });
                this._view?.webview.postMessage({ type: 'interactive-stopped' });
                return;
            }
            executeAndSpawn();
        });
    } else {
        executeAndSpawn();
    }
  }

  private async runTests(testCases: { input: string; expected: string; id: string }[]) {
    if (!this._view) { return; }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage("No active editor found");
      return;
    }

    const config = vscode.workspace.getConfiguration("asymptote");
    const isStrict = config.get<boolean>("strictComparison", false);

    await editor.document.save();
    
    const filePath = editor.document.fileName;
    const fileDir = path.dirname(filePath);
    const fileName = path.basename(filePath, path.extname(filePath));
    
    const strategy = this.getExecutionStrategy(filePath, fileDir, fileName);

    const runAllTestCases = async () => {
        this._view?.webview.postMessage({ type: 'status', value: 'Running...' });

        for (let i = 0; i < testCases.length; i++) {
            const result = await this.runBinary(strategy.runCommand, strategy.runArgs, fileDir, testCases[i].input, 2000);
            
            let finalOutput = result.output;
            if (result.error) {
                finalOutput += `\n[Stderr]:\n${result.error}`;
            }

            const expected = testCases[i].expected;
            let passed = false;
            if (expected){
              if (isStrict) {
                  passed = finalOutput === expected;
              }else{
                  passed = finalOutput.trim() === expected.trim();
              }
            }

            this._view?.webview.postMessage({
                type: 'test-result',
                id: testCases[i].id,
                output: finalOutput,
                passed: passed,
                time: result.time,
                isError: result.code !== 0 || result.isTimeout,
                statusText: result.isTimeout ? 'TLE' : (result.code !== 0 ? 'RE' : (passed ? 'AC' : 'WA'))
            });
        }

        this._view?.webview.postMessage({ type: 'finished' });

        strategy.cleanupFiles.forEach(f => {
            if (fs.existsSync(f)) {
                try { fs.unlinkSync(f); } catch (e) {}
            }
        });
    };

    if (strategy.compileCommand) {
        this._view.webview.postMessage({ type: 'status', value: 'Compiling...' });

        cp.exec(strategy.compileCommand, { cwd: fileDir }, async (error, stdout, stderr) => {
          if (error) {
            this._view?.webview.postMessage({ 
              type: 'compile-error', 
              output: `Compilation Error:\n${stderr}`
            });
            return;
          }
          await runAllTestCases();
        });
    } else {
        await runAllTestCases();
    }
  }

  private runBinary(command: string, args: string[], cwd: string, input: string, timeoutMs: number): Promise<{ output: string, error: string, code: number | null, isTimeout: boolean, time: number }> {
      return new Promise((resolve) => {
          const child = cp.spawn(command, args, { cwd });
          let output = "";
          let error = "";
          let isTimeout = false;
          
          const startTime = performance.now();

          const timer = setTimeout(() => {
              isTimeout = true;
              child.kill();
              const endTime = performance.now();
              resolve({ output, error, code: null, isTimeout: true, time: endTime - startTime });
          }, timeoutMs);

          if (input) {
              child.stdin.write(input);
              child.stdin.end();
          }

          child.stdout.on("data", (data) => { output += data.toString(); });
          child.stderr.on("data", (data) => { error += data.toString(); });

          child.on("close", (code) => {
              if (!isTimeout) {
                  clearTimeout(timer);
                  const endTime = performance.now();
                  resolve({ output, error, code, isTimeout: false, time: endTime - startTime });
              }
          });
      });
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "media", "main.css"));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, "media", "main.js"));
    const nonce = getNonce();

    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; font-src https://cdn.jsdelivr.net; img-src ${webview.cspSource} https: data:;">
        <title>Asymptote</title>
        <script nonce="${nonce}">
            window.MathJax = {
                tex: { 
                    inlineMath: [['}, '}], ['$}, '$}], ['\\\\(', '\\\\)']], 
                    displayMath: [['$', '$'], ['\\\\[', '\\\\]']] 
                },
                svg: { fontCache: 'global' }
            };
        </script>
        <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
        <link href="${styleUri}" rel="stylesheet">
    </head>
    <body>
        <div id="home-view" class="home-container">
            <div class="logo">
                <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 20L24 32L12 44" stroke="#8E9099" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M30 44H38C44 44 48 36 52 20" stroke="#4EC9B0" stroke-width="4" stroke-linecap="round"/>
                    <path d="M52 20L46 26M52 20L56 26" stroke="#4EC9B0" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </div>
            <div class="home-title">ASYMPTOTE</div>
            
            <div id="main-menu" style="width: 100%">
                <button id="btn-import-url" class="btn-primary">Import from URL</button>
                <button id="btn-manual-create" class="btn-outline">Manual Create</button>
            </div>

            <div id="parse-ui" class="parse-section hidden">
                <div class="input-group">
                    <span class="input-label">Problem URL</span>
                    <input type="text" id="problem-url" class="url-input" placeholder="https://codeforces.com/..." />
                </div>
                <button id="fetchBtn" class="btn-primary" style="margin-top:10px">Fetch</button>
                <button id="btn-cancel-parse" class="btn-outline" style="padding: 6px;">Cancel</button>
            </div>
        </div>

        <div id="workspace-view" class="hidden">
            <div class="workspace-header">
                <div class="nav-bar">
                    <button id="btn-gohome" class="back-btn">
                        <svg viewBox="0 0 16 16" style="width:12px;height:12px;margin-right:4px;fill:currentColor;"><path d="M10 12L4 8l6-4v8z"/></svg>
                        Home
                    </button>
                </div>
                <div class="tabs">
                    <div id="tab-btn-problem" class="tab">Problem</div>
                    <div id="tab-btn-runner" class="tab active">Runner</div>
                </div>
            </div>

            <div id="content-problem" class="content-area hidden">
                <div id="problem-content"></div>
            </div>

            <div id="content-runner" class="content-area">
                <div style="margin-bottom: 10px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px; display: flex; align-items: center;">
                    <label class="toggle-switch">
                        <input type="checkbox" id="interactive-mode">
                        <span class="slider"></span>
                    </label>
                    <span id="btn-interactive-mode-text" style="font-size:12px; cursor:pointer; user-select: none;">Interactive Mode</span>
                </div>

                <div id="standard-runner">
                    <div id="test-cases-container"></div>
                    <button id="btn-add-case" class="btn-secondary">+ Add Case</button>
                    <button id="runBtn">Run All</button>
                </div>

                <div id="interactive-runner" class="hidden" style="height: calc(100% - 40px); display: flex; flex-direction: column;">
                    
                    <div class="column-header">
                        <div class="col-left">JUDGE (Input)</div>
                        <div class="col-right">CODE (Output)</div>
                    </div>

                    <div id="chat-history" style="flex:1; overflow-y:auto; border:none; margin-bottom:10px; background: var(--vscode-editor-background); display: flex; flex-direction: column; position: relative;">
                        <div class="msg-system" style="z-index: 1;">Toggle Interactive Mode ON and click Start.</div>
                    </div>
                    
                    <div id="start-controls" style="margin-top: 5px;">
                        <button id="interactiveStartBtn" class="btn-primary">Start Interactive Session</button>
                        <button id="interactiveStopBtn" class="btn-outline hidden" style="border-color: var(--vscode-red); color: var(--vscode-red);">Stop Process</button>
                    </div>
                </div>
            </div>
        </div>

        <script nonce="${nonce}" src="${scriptUri}"></script>
    </body>
    </html>`;
  }
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}