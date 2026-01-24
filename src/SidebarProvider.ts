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
      switch (data.command) {
        case "run":
          await this.runTests(data.testCases);
          break;
        case "parse-url":
          const problemHtml = `
            <h2 style="margin-top:0">A. Watermelon</h2>
            <div style="font-size:11px; opacity:0.8; margin-bottom:10px;">
                time limit: 1s | memory limit: 64MB
            </div>
            <p>One hot summer day Pete and his friend Billy decided to buy a watermelon. They chose the biggest and the ripest one, in their opinion. After that the watermelon was weighed, and the scales showed <i>w</i> kilos.</p>
            <p>Pete and Billy are great fans of even numbers, that's why they want to divide the watermelon in such a way that each of the two parts weighs even number of kilos.</p>
            <h3>Input</h3>
            <p>The first (and the only) input line contains integer number <i>w</i> (1 &le; <i>w</i> &le; 100).</p>
            <h3>Output</h3>
            <p>Print YES, if the boys can divide the watermelon into two parts, each of them weighing even number of kilos; and NO in the opposite case.</p>
          `;
          
          this._view?.webview.postMessage({ 
              type: 'navigate', 
              view: 'workspace',
              tab: 'problem', // 預設切換到題目頁
              problemHtml: problemHtml,
              initialData: [
                  { input: '8', expected: 'YES', id: 'mock-1' },
              ]
          });
          break;
        case "manual-create":
          this._view?.webview.postMessage({ 
              type: 'navigate', 
              view: 'workspace',
              tab: 'runner', // 手動建立時預設切換到 Runner
              problemHtml: '<p style="padding:20px; text-align:center; opacity:0.6;">No problem description available.<br>Created manually.</p>'
          });
          break;
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
        <title>Asymptote</title>
        <style>
            :root { --vscode-green: #4EC9B0; --vscode-red: #F14C4C; --border-radius: 4px; }
            body { font-family: var(--vscode-font-family); background-color: var(--vscode-sideBar-background); color: var(--vscode-editor-foreground); padding: 0; margin: 0; overflow-x: hidden;}
            
            .hidden { display: none !important; }
            .container { padding: 10px; }

            /* Home View */
            .home-container { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 90vh; text-align: center; padding: 20px; }
            .logo { font-size: 40px; margin-bottom: 20px; opacity: 0.8; }
            .home-title { font-size: 18px; font-weight: bold; margin-bottom: 30px; letter-spacing: 1px; }
            .btn-primary { width: 100%; border: none; padding: 10px; cursor: pointer; font-size: 13px; border-radius: var(--border-radius); font-weight: 600; transition: all 0.2s; background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); margin-bottom: 10px; }
            .btn-primary:hover { background-color: var(--vscode-button-hoverBackground); }
            .btn-outline { width: 100%; border: 1px solid var(--vscode-panel-border); padding: 10px; cursor: pointer; font-size: 13px; border-radius: var(--border-radius); font-weight: 600; transition: all 0.2s; background: transparent; color: var(--vscode-foreground); margin-bottom: 10px; }
            .btn-outline:hover { background: var(--vscode-list-hoverBackground); }
            
            .parse-section { margin-top: 20px; width: 100%; text-align: left; padding: 15px; background: var(--vscode-list-hoverBackground); border-radius: 8px; border: 1px solid var(--vscode-panel-border); }
            .input-group { margin-bottom: 12px; }
            .input-label { display: block; font-size: 11px; margin-bottom: 4px; opacity: 0.8; }
            .url-input { width: 100%; padding: 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px; box-sizing: border-box; }

            /* Workspace Header & Tabs */
            .workspace-header { 
                background-color: var(--vscode-sideBar-background);
                position: sticky; top: 0; z-index: 10;
                border-bottom: 1px solid var(--vscode-panel-border);
            }
            .nav-bar { display: flex; align-items: center; padding: 8px 10px; border-bottom: 1px solid var(--vscode-panel-border); }
            .back-btn { background: none; border: none; color: var(--vscode-descriptionForeground); cursor: pointer; font-size: 12px; display: flex; align-items: center; padding: 0; }
            .back-btn:hover { color: var(--vscode-foreground); }

            .tabs { display: flex; width: 100%; }
            .tab { 
                flex: 1; text-align: center; padding: 8px 0; cursor: pointer; 
                font-size: 11px; font-weight: 600; text-transform: uppercase;
                border-bottom: 2px solid transparent; opacity: 0.6;
                transition: all 0.2s;
            }
            .tab:hover { opacity: 1; background-color: var(--vscode-list-hoverBackground); }
            .tab.active { 
                border-bottom-color: var(--vscode-panelTitle-activeBorder); 
                color: var(--vscode-panelTitle-activeForeground); 
                opacity: 1; 
            }

            /* Content Areas */
            .content-area { padding: 10px; height: calc(100vh - 80px); overflow-y: auto; }
            
            #problem-content { line-height: 1.5; font-size: 13px; }
            #problem-content h2, #problem-content h3 { margin-top: 15px; margin-bottom: 8px; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 4px; }
            #problem-content p { margin-bottom: 10px; }

            /* Test Cases */
            .test-case { background-color: var(--vscode-list-hoverBackground); border-left: 3px solid transparent; margin-bottom: 10px; border-radius: var(--border-radius); overflow: hidden; transition: all 0.2s ease; }
            .case-header { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; cursor: pointer; user-select: none; font-size: 12px; font-weight: 600; }
            .case-header:hover { background-color: var(--vscode-list-activeSelectionBackground); }
            .case-actions { display: flex; gap: 4px; opacity: 0; transition: opacity 0.2s; }
            .test-case:hover .case-actions { opacity: 1; }
            .case-body { padding: 10px; border-top: 1px solid var(--vscode-panel-border); display: block; }
            .collapsed .case-body { display: none; }
            
            .status-tag { font-size: 11px; font-weight: bold; margin-left: 8px; }
            .time-tag { font-size: 10px; color: var(--vscode-descriptionForeground); margin-left: 5px; opacity: 0.8; }
            .status-AC { color: var(--vscode-green); }
            .status-WA, .status-RE, .status-TLE { color: var(--vscode-red); }
            .test-case.AC { border-left-color: var(--vscode-green); }
            .test-case.WA { border-left-color: var(--vscode-red); }

            textarea { width: 100%; background-color: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 6px; box-sizing: border-box; margin-bottom: 8px; font-family: var(--vscode-editor-font-family); font-size: 12px; resize: vertical; min-height: 40px; }
            textarea:focus { outline: 1px solid var(--vscode-focusBorder); }
            .label { font-size: 10px; margin-bottom: 2px; color: var(--vscode-descriptionForeground); display: block; text-transform: uppercase; letter-spacing: 0.5px; }

            .btn-secondary { width: 100%; background: transparent; color: var(--vscode-textLink-foreground); border: 1px dashed var(--vscode-panel-border); margin-top: 10px; padding: 8px; cursor: pointer; border-radius: var(--border-radius); }
            .btn-secondary:hover { background-color: var(--vscode-list-hoverBackground); border-color: var(--vscode-textLink-foreground); }
            .btn-icon { background: none; color: var(--vscode-descriptionForeground); padding: 4px; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; border-radius: 3px; border: none; cursor: pointer; }
            .btn-icon:hover { color: var(--vscode-editor-foreground); background: rgba(255,255,255,0.1); }
            .btn-icon svg { width: 14px; height: 14px; fill: currentColor; }
            
            #runBtn { background-color: var(--vscode-button-background); color: var(--vscode-button-foreground); margin-top: 10px; width: 100%; border: none; padding: 10px; cursor: pointer; border-radius: var(--border-radius); font-weight: 600; }
            #runBtn:hover { background-color: var(--vscode-button-hoverBackground); }
            #runBtn:disabled { opacity: 0.6; cursor: not-allowed; }
        </style>
    </head>
    <body>
        <div id="home-view" class="home-container">
            <div class="logo">🚀</div>
            <div class="home-title">ASYMPTOTE</div>
            
            <div id="main-menu" style="width: 100%">
                <button class="btn-primary" onclick="showParseUI()">Import from URL</button>
                <button class="btn-outline" onclick="manualStart()">Manual Create</button>
            </div>

            <div id="parse-ui" class="parse-section hidden">
                <div class="input-group">
                    <span class="input-label">Problem URL</span>
                    <input type="text" id="problem-url" class="url-input" placeholder="https://codeforces.com/..." />
                </div>
                <button class="btn-primary" style="margin-top:10px" onclick="startParsing()">Fetch</button>
                <button class="btn-outline" onclick="hideParseUI()" style="padding: 6px;">Cancel</button>
            </div>
        </div>

        <div id="workspace-view" class="hidden">
            <div class="workspace-header">
                <div class="nav-bar">
                    <button class="back-btn" onclick="goHome()">
                        <svg viewBox="0 0 16 16" style="width:12px;height:12px;margin-right:4px;fill:currentColor;"><path d="M10 12L4 8l6-4v8z"/></svg>
                        Home
                    </button>
                </div>
                <div class="tabs">
                    <div id="tab-btn-problem" class="tab" onclick="switchTab('problem')">Problem</div>
                    <div id="tab-btn-runner" class="tab active" onclick="switchTab('runner')">Runner</div>
                </div>
            </div>

            <div id="content-problem" class="content-area hidden">
                <div id="problem-content"></div>
            </div>

            <div id="content-runner" class="content-area">
                <div id="test-cases-container"></div>
                <button class="btn-secondary" onclick="addTestCase()">+ Add Case</button>
                <button id="runBtn" onclick="runTests()">Run All</button>
            </div>
        </div>

        <script>
            const vscode = acquireVsCodeApi();
            
            const homeView = document.getElementById('home-view');
            const workspaceView = document.getElementById('workspace-view');
            const mainMenu = document.getElementById('main-menu');
            const parseUI = document.getElementById('parse-ui');
            const container = document.getElementById('test-cases-container');
            const runBtn = document.getElementById('runBtn');
            const problemContent = document.getElementById('problem-content');
            let testCaseCount = 0;

            // --- Navigation Logic ---
            function showParseUI() { mainMenu.classList.add('hidden'); parseUI.classList.remove('hidden'); }
            function hideParseUI() { parseUI.classList.add('hidden'); mainMenu.classList.remove('hidden'); }
            function manualStart() { vscode.postMessage({ command: 'manual-create' }); }
            function startParsing() {
                const url = document.getElementById('problem-url').value;
                if(!url) return;
                vscode.postMessage({ command: 'parse-url', url: url });
            }
            function goHome() {
                container.innerHTML = ''; testCaseCount = 0;
                workspaceView.classList.add('hidden'); homeView.classList.remove('hidden'); hideParseUI();
            }

            // --- Tab Logic ---
            function switchTab(tabName) {
                // Update Tab Buttons
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.getElementById('tab-btn-' + tabName).classList.add('active');

                // Update Content
                document.getElementById('content-problem').classList.add('hidden');
                document.getElementById('content-runner').classList.add('hidden');
                document.getElementById('content-' + tabName).classList.remove('hidden');
            }

            // --- Test Case Logic ---
            function addTestCase(inputVal = '', expectedVal = '') {
                testCaseCount++;
                const id = 'case-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                const div = document.createElement('div');
                div.className = 'test-case'; div.id = id;
                div.innerHTML = \`
                    <div class="case-header" onclick="toggleCase(this)">
                        <div><span class="case-number">#</span><span class="status-tag"></span><span class="time-tag"></span></div>
                        <div class="case-actions">
                            <button class="btn-icon" onclick="runSingleCase('\${id}', event)" title="Run This"><svg viewBox="0 0 16 16"><path d="M4 2v12l10-6L4 2z"/></svg></button>
                            <button class="btn-icon" onclick="cloneCase('\${id}', event)" title="Clone"><svg viewBox="0 0 16 16"><path d="M4 4h8v8H4z M12 2H4c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z m2 2v8h-1V4h1z m-2 0H4v8h8V4z"/></svg></button>
                            <button class="btn-icon" onclick="removeTestCase(this, event)" title="Remove"><svg viewBox="0 0 16 16"><path d="M13.854 2.146a.5.5 0 0 1 0 .708l-11 11a.5.5 0 0 1-.708-.708l11-11a.5.5 0 0 1 .708 0Z"/><path d="M2.146 2.146a.5.5 0 0 0 0 .708l11 11a.5.5 0 0 0 .708-.708l-11-11a.5.5 0 0 0-.708 0Z"/></svg></button>
                        </div>
                    </div>
                    <div class="case-body">
                        <span class="label">Input</span><textarea class="input-box" rows="2">\${inputVal}</textarea>
                        <span class="label">Expected</span><textarea class="expected-box" rows="2">\${expectedVal}</textarea>
                        <span class="label">Actual</span><textarea class="output-box" rows="2" readonly placeholder="waiting..."></textarea>
                    </div>\`;
                container.appendChild(div); updateIndices();
            }

            function toggleCase(h) { h.parentElement.classList.toggle('collapsed'); }
            function removeTestCase(b, e) { e.stopPropagation(); b.closest('.test-case').remove(); updateIndices(); }
            function cloneCase(id, e) { e.stopPropagation(); const o = document.getElementById(id); if(o) addTestCase(o.querySelector('.input-box').value, o.querySelector('.expected-box').value); }
            function updateIndices() { let i = 0; container.querySelectorAll('.test-case').forEach(c => { i++; c.querySelector('.case-number').innerText = '#' + i; }); }
            function runSingleCase(id, e) { e.stopPropagation(); const c = document.getElementById(id); if(!c) return; resetCaseUI(c); vscode.postMessage({ command: 'run', testCases: [{ input: c.querySelector('.input-box').value, expected: c.querySelector('.expected-box').value, id }] }); }
            function runTests() { const c = []; container.querySelectorAll('.test-case').forEach(t => { c.push({ input: t.querySelector('.input-box').value, expected: t.querySelector('.expected-box').value, id: t.id }); resetCaseUI(t); }); if(c.length) sendRunCommand(c); }
            function resetCaseUI(c) { c.querySelector('.output-box').value = ''; c.querySelector('.status-tag').innerText = ''; c.querySelector('.time-tag').innerText = ''; c.classList.remove('AC', 'WA', 'collapsed'); }
            function sendRunCommand(c) { runBtn.disabled = true; runBtn.innerText = 'Compiling...'; vscode.postMessage({ command: 'run', testCases: c }); }

            window.addEventListener('message', event => {
                const msg = event.data;
                if (msg.type === 'navigate') {
                    if (msg.view === 'workspace') {
                        homeView.classList.add('hidden');
                        workspaceView.classList.remove('hidden');
                        
                        // Set Problem HTML
                        problemContent.innerHTML = msg.problemHtml || '';
                        
                        // Switch to requested Tab
                        switchTab(msg.tab || 'runner');

                        // Fill Test Cases
                        if (msg.initialData) {
                            msg.initialData.forEach(c => addTestCase(c.input, c.expected));
                        } else {
                            addTestCase();
                        }
                    }
                } 
                else if (msg.type === 'status') runBtn.innerText = msg.value;
                else if (msg.type === 'finished') { runBtn.innerText = 'Run All'; runBtn.disabled = false; }
                else if (msg.type === 'compile-error') { runBtn.innerText = 'Error'; runBtn.disabled = false; alert(msg.output); }
                else if (msg.type === 'test-result') {
                    const c = document.getElementById(msg.id);
                    if (c) {
                        c.querySelector('.output-box').value = msg.output;
                        c.querySelector('.time-tag').innerText = Math.round(msg.time) + 'ms';
                        const s = c.querySelector('.status-tag');
                        s.innerText = msg.statusText; s.className = 'status-tag status-' + msg.statusText;
                        c.classList.remove('AC', 'WA'); c.classList.add(msg.passed ? 'AC' : 'WA');
                        if(msg.passed) c.classList.add('collapsed'); else c.classList.remove('collapsed');
                    }
                }
            });
        </script>
    </body>
    </html>`;
  }
}