import * as vscode from "vscode";
import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import { performance } from "perf_hooks";

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
        await this.runTests(data.testCases);
      }
    });
  }

  private async runTests(testCases: { input: string; expected: string; id: string }[]) {
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

    cp.exec(compileCommand, async (error, stdout, stderr) => {
      if (error) {
        this._view?.webview.postMessage({ 
          type: 'compile-error', 
          output: `Compilation Error:\n${stderr}`
        });
        return;
      }

      this._view?.webview.postMessage({ type: 'status', value: 'Running...' });

      for (let i = 0; i < testCases.length; i++) {
          const result = await this.runBinary(exePath, fileDir, testCases[i].input, 2000);
          
          let finalOutput = result.output;
          if (result.error) {
              finalOutput += `\n[Stderr]:\n${result.error}`;
          }

          const expected = testCases[i].expected;
          const passed = expected ? finalOutput.trim() === expected.trim() : false;

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

      if (fs.existsSync(exePath)) {
        try { fs.unlinkSync(exePath); } catch (e) {}
      }
    });
  }

  private runBinary(exePath: string, cwd: string, input: string, timeoutMs: number): Promise<{ output: string, error: string, code: number | null, isTimeout: boolean, time: number }> {
      return new Promise((resolve) => {
          const child = cp.spawn(exePath, [], { cwd });
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
    return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Asymptote Runner</title>
        <style>
            :root {
                --vscode-green: #4EC9B0;
                --vscode-red: #F14C4C;
                --border-radius: 4px;
            }
            body { font-family: var(--vscode-font-family); background-color: var(--vscode-sideBar-background); color: var(--vscode-editor-foreground); padding: 10px; }
            
            .test-case { 
                background-color: var(--vscode-list-hoverBackground); 
                border-left: 3px solid transparent;
                margin-bottom: 10px; 
                border-radius: var(--border-radius); 
                overflow: hidden;
                transition: all 0.2s ease;
            }

            .case-header { 
                display: flex; 
                justify-content: space-between; 
                align-items: center; 
                padding: 8px 10px;
                cursor: pointer;
                user-select: none;
                font-size: 12px;
                font-weight: 600;
            }
            .case-header:hover {
                background-color: var(--vscode-list-activeSelectionBackground);
            }

            .case-actions {
                display: flex;
                gap: 4px;
                opacity: 0;
                transition: opacity 0.2s;
            }
            .test-case:hover .case-actions { opacity: 1; }

            .case-body {
                padding: 10px;
                border-top: 1px solid var(--vscode-panel-border);
                display: block;
            }
            .collapsed .case-body { display: none; }
            
            .case-title { display: flex; align-items: center; gap: 8px; }
            .status-tag { font-size: 11px; font-weight: bold; }
            .time-tag { font-size: 10px; color: var(--vscode-descriptionForeground); font-weight: normal; opacity: 0.8; }
            
            .status-AC { color: var(--vscode-green); }
            .status-WA, .status-RE, .status-TLE { color: var(--vscode-red); }
            
            .test-case.AC { border-left-color: var(--vscode-green); }
            .test-case.WA { border-left-color: var(--vscode-red); }

            textarea { width: 100%; background-color: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 6px; box-sizing: border-box; margin-bottom: 8px; font-family: var(--vscode-editor-font-family); font-size: 12px; resize: vertical; min-height: 40px; }
            textarea:focus { outline: 1px solid var(--vscode-focusBorder); }
            .label { font-size: 10px; margin-bottom: 2px; color: var(--vscode-descriptionForeground); display: block; text-transform: uppercase; letter-spacing: 0.5px; }

            button { width: 100%; border: none; padding: 8px; cursor: pointer; font-size: 12px; border-radius: var(--border-radius); font-weight: 600; transition: background 0.2s; }
            #runBtn { background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); margin-top: 10px; }
            #runBtn:hover { background-color: var(--vscode-button-hoverBackground); }
            #runBtn:disabled { opacity: 0.6; cursor: not-allowed; }

            .btn-secondary { background: transparent; color: var(--vscode-textLink-foreground); border: 1px dashed var(--vscode-panel-border); margin-top: 0; }
            .btn-secondary:hover { background-color: var(--vscode-list-hoverBackground); border-color: var(--vscode-textLink-foreground); }

            .btn-icon { 
                background: none; color: var(--vscode-descriptionForeground); 
                padding: 4px; width: 20px; height: 20px; 
                display: flex; align-items: center; justify-content: center;
                border-radius: 3px; 
            }
            .btn-icon:hover { color: var(--vscode-editor-foreground); background: rgba(255,255,255,0.1); }
            .btn-icon svg { width: 14px; height: 14px; fill: currentColor; }

        </style>
    </head>
    <body>
        <div id="test-cases-container"></div>
        
        <button class="btn-secondary" onclick="addTestCase()">+ Add Case</button>
        <button id="runBtn" onclick="runTests()">Run All</button>

        <script>
            const vscode = acquireVsCodeApi();
            const container = document.getElementById('test-cases-container');
            const runBtn = document.getElementById('runBtn');
            let testCaseCount = 0;

            function addTestCase(inputVal = '', expectedVal = '') {
                testCaseCount++;
                const id = 'case-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                
                const div = document.createElement('div');
                div.className = 'test-case';
                div.id = id;
                div.innerHTML = \`
                    <div class="case-header" onclick="toggleCase(this)">
                        <div class="case-title">
                            <span class="case-number">#</span>
                            <span class="status-tag"></span>
                            <span class="time-tag"></span>
                        </div>
                        <div class="case-actions">
                            <button class="btn-icon" onclick="runSingleCase('\${id}', event)" title="Run This Case">
                                <svg viewBox="0 0 16 16"><path d="M4 2v12l10-6L4 2z"/></svg>
                            </button>
                            <button class="btn-icon" onclick="cloneCase('\${id}', event)" title="Duplicate">
                                <svg viewBox="0 0 16 16"><path d="M4 4h8v8H4z M12 2H4c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z m2 2v8h-1V4h1z m-2 0H4v8h8V4z"/></svg>
                            </button>
                            <button class="btn-icon" onclick="removeTestCase(this, event)" title="Remove">
                                <svg viewBox="0 0 16 16"><path d="M13.854 2.146a.5.5 0 0 1 0 .708l-11 11a.5.5 0 0 1-.708-.708l11-11a.5.5 0 0 1 .708 0Z"/><path d="M2.146 2.146a.5.5 0 0 0 0 .708l11 11a.5.5 0 0 0 .708-.708l-11-11a.5.5 0 0 0-.708 0Z"/></svg>
                            </button>
                        </div>
                    </div>
                    <div class="case-body">
                        <span class="label">Input</span>
                        <textarea class="input-box" rows="2">\${inputVal}</textarea>
                        <span class="label">Expected</span>
                        <textarea class="expected-box" rows="2">\${expectedVal}</textarea>
                        <span class="label">Actual</span>
                        <textarea class="output-box" rows="2" readonly placeholder="waiting..."></textarea>
                    </div>
                \`;
                container.appendChild(div);
                updateIndices();
            }

            function toggleCase(header) {
                const parent = header.parentElement;
                parent.classList.toggle('collapsed');
            }

            function removeTestCase(btn, event) {
                event.stopPropagation();
                btn.closest('.test-case').remove();
                updateIndices();
            }

            function cloneCase(id, event) {
                event.stopPropagation();
                const original = document.getElementById(id);
                if (original) {
                    const input = original.querySelector('.input-box').value;
                    const expected = original.querySelector('.expected-box').value;
                    addTestCase(input, expected);
                }
            }

            function updateIndices() {
                const cases = container.querySelectorAll('.test-case');
                let idx = 0;
                cases.forEach((c) => {
                    idx++;
                    c.querySelector('.case-number').innerText = '#' + idx;
                });
            }

            addTestCase('10', '55');

            window.addEventListener('message', event => {
                const msg = event.data;

                if (msg.type === 'status') {
                    runBtn.innerText = msg.value;
                } else if (msg.type === 'finished') {
                    runBtn.innerText = 'Run All';
                    runBtn.disabled = false;
                } else if (msg.type === 'compile-error') {
                    runBtn.innerText = 'Error';
                    runBtn.disabled = false;
                    alert(msg.output);
                } else if (msg.type === 'test-result') {
                    const caseDiv = document.getElementById(msg.id);
                    if (caseDiv) {
                        const outBox = caseDiv.querySelector('.output-box');
                        const statusTag = caseDiv.querySelector('.status-tag');
                        const timeTag = caseDiv.querySelector('.time-tag');
                        
                        outBox.value = msg.output;
                        
                        const timeMs = Math.round(msg.time);
                        timeTag.innerText = timeMs + 'ms';
                        
                        statusTag.innerText = msg.statusText;
                        statusTag.className = 'status-tag status-' + msg.statusText;
                        
                        caseDiv.classList.remove('AC', 'WA');
                        caseDiv.classList.add(msg.passed ? 'AC' : 'WA');

                        if (msg.passed) {
                            caseDiv.classList.add('collapsed');
                        } else {
                            caseDiv.classList.remove('collapsed');
                        }
                    }
                }
            });

            function runTests() {
                const cases = collectCases();
                if (cases.length === 0) return;
                sendRunCommand(cases);
            }

            function runSingleCase(id, event) {
                event.stopPropagation();
                const caseDiv = document.getElementById(id);
                if (!caseDiv) return;

                const input = caseDiv.querySelector('.input-box').value;
                const expected = caseDiv.querySelector('.expected-box').value;
                
                resetCaseUI(caseDiv);
                
                vscode.postMessage({ 
                    command: 'run',
                    testCases: [{ input, expected, id }]
                });
            }

            function collectCases() {
                const cases = [];
                container.querySelectorAll('.test-case').forEach(c => {
                    cases.push({
                        input: c.querySelector('.input-box').value,
                        expected: c.querySelector('.expected-box').value,
                        id: c.id
                    });
                    resetCaseUI(c);
                });
                return cases;
            }

            function resetCaseUI(c) {
                c.querySelector('.output-box').value = '';
                c.querySelector('.status-tag').innerText = '';
                c.querySelector('.time-tag').innerText = '';
                c.classList.remove('AC', 'WA', 'collapsed');
            }

            function sendRunCommand(cases) {
                runBtn.disabled = true;
                runBtn.innerText = 'Compiling...';
                vscode.postMessage({ 
                    command: 'run',
                    testCases: cases
                });
            }
        </script>
    </body>
    </html>`;
  }
}