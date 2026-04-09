            const vscode = acquireVsCodeApi();
            
            const homeView = document.getElementById('home-view');
            const workspaceView = document.getElementById('workspace-view');
            const mainMenu = document.getElementById('main-menu');
            const parseUI = document.getElementById('parse-ui');
            const container = document.getElementById('test-cases-container');
            const runBtn = document.getElementById('runBtn');
            const fetchBtn = document.getElementById('fetchBtn');
            const problemContent = document.getElementById('problem-content');
            let testCaseCount = 0;
            let debounceTimer;
            let activeInputRow = null;

            function saveState() {
                const state = {
                    view: 'workspace',
                    tab: document.getElementById('tab-btn-runner').classList.contains('active') ? 'runner' : 'problem',
                    problemHtml: problemContent.innerHTML,
                    testCases: collectCases(),
                    interactive: document.getElementById('interactive-mode').checked
                };
                vscode.postMessage({ command: 'save-state', state: state });
            }

            function triggerSave() {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(saveState, 500);
            }

            function showParseUI() { mainMenu.classList.add('hidden'); parseUI.classList.remove('hidden'); }
            function hideParseUI() { parseUI.classList.add('hidden'); mainMenu.classList.remove('hidden'); }
            function manualStart() { 
                vscode.postMessage({ command: 'manual-create' }); 
            }
            function startParsing() {
                const url = document.getElementById('problem-url').value;
                if(!url) return;
                fetchBtn.disabled = true;
                fetchBtn.innerText = 'Fetching...';
                vscode.postMessage({ command: 'parse-url', url: url });
            }
            function goHome() {
                container.innerHTML = ''; testCaseCount = 0;
                workspaceView.classList.add('hidden'); homeView.classList.remove('hidden'); hideParseUI();
                fetchBtn.disabled = false; fetchBtn.innerText = 'Fetch';
                vscode.postMessage({ command: 'save-state', state: null }); 
            }

            function switchTab(tabName) {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.getElementById('tab-btn-' + tabName).classList.add('active');
                document.getElementById('content-problem').classList.add('hidden');
                document.getElementById('content-runner').classList.add('hidden');
                document.getElementById('content-' + tabName).classList.remove('hidden');

                if (tabName === 'runner') {
                    setTimeout(() => {
                        document.querySelectorAll('textarea').forEach(autoResize);
                    }, 50);
                }
                triggerSave();
            }

            function autoResize(el) {
                el.style.height = 'auto';
                el.style.height = el.scrollHeight + 'px';
            }

            function addTestCase(inputVal = '', expectedVal = '') {
                testCaseCount++;
                const id = 'case-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
                const div = document.createElement('div');
                div.className = 'test-case'; div.id = id;
                div.innerHTML = `
                    <div class="case-header">
                        <div><span class="case-number">#</span><span class="status-tag"></span><span class="time-tag"></span></div>
                        <div class="case-actions">
                            <button class="btn-icon btn-run" title="Run This"><svg viewBox="0 0 16 16"><path d="M4 2v12l10-6L4 2z"/></svg></button>
                            <button class="btn-icon btn-clone" title="Clone"><svg viewBox="0 0 16 16"><path d="M4 4h8v8H4z M12 2H4c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z m2 2v8h-1V4h1z m-2 0H4v8h8V4z"/></svg></button>
                            <button class="btn-icon btn-remove" title="Remove"><svg viewBox="0 0 16 16"><path d="M13.854 2.146a.5.5 0 0 1 0 .708l-11 11a.5.5 0 0 1-.708-.708l11-11a.5.5 0 0 1 .708 0Z"/><path d="M2.146 2.146a.5.5 0 0 0 0 .708l11 11a.5.5 0 0 0 .708-.708l-11-11a.5.5 0 0 0-.708 0Z"/></svg></button>
                        </div>
                    </div>
                    <div class="case-body">
                        <span class="label">Input</span><textarea class="input-box" rows="2">${inputVal}</textarea>
                        <span class="label">Expected</span><textarea class="expected-box" rows="2">${expectedVal}</textarea>
                        <span class="label">Actual</span><textarea class="output-box" rows="2" readonly placeholder="waiting..."></textarea>
                    </div>`;
                container.appendChild(div); 
                
                div.querySelector('.case-header').addEventListener('click', function() { toggleCase(this); });
                div.querySelector('.btn-run').addEventListener('click', function(e) { runSingleCase(id, e); });
                div.querySelector('.btn-clone').addEventListener('click', function(e) { cloneCase(id, e); });
                div.querySelector('.btn-remove').addEventListener('click', function(e) { removeTestCase(this, e); });
                
                div.querySelector('.input-box').addEventListener('input', function() { autoResize(this); triggerSave(); });
                div.querySelector('.expected-box').addEventListener('input', function() { autoResize(this); triggerSave(); });

                updateIndices();
                triggerSave();
                
                setTimeout(() => {
                    div.querySelectorAll('textarea').forEach(autoResize);
                }, 0);
            }

            function toggleCase(h) { h.parentElement.classList.toggle('collapsed'); }
            function removeTestCase(b, e) { e.stopPropagation(); b.closest('.test-case').remove(); updateIndices(); triggerSave(); }
            function cloneCase(id, e) { e.stopPropagation(); const o = document.getElementById(id); if(o) addTestCase(o.querySelector('.input-box').value, o.querySelector('.expected-box').value); }
            function updateIndices() { let i = 0; container.querySelectorAll('.test-case').forEach(c => { i++; c.querySelector('.case-number').innerText = '#' + i; }); }
            function runSingleCase(id, e) { e.stopPropagation(); const c = document.getElementById(id); if(!c) return; resetCaseUI(c); vscode.postMessage({ command: 'run', testCases: [{ input: c.querySelector('.input-box').value, expected: c.querySelector('.expected-box').value, id }] }); }
            function runTests() { 
                const c = collectCases(); 
                if(c.length) sendRunCommand(c); 
            }
            function resetCaseUI(c) { c.querySelector('.output-box').value = ''; c.querySelector('.status-tag').innerText = ''; c.querySelector('.time-tag').innerText = ''; c.classList.remove('AC', 'WA', 'collapsed'); }
            function sendRunCommand(c) { runBtn.disabled = true; runBtn.innerText = 'Compiling...'; vscode.postMessage({ command: 'run', testCases: c }); }
            
            function collectCases() {
                const cases = [];
                container.querySelectorAll('.test-case').forEach(c => {
                    cases.push({
                        input: c.querySelector('.input-box').value,
                        expected: c.querySelector('.expected-box').value,
                        id: c.id
                    });
                });
                return cases;
            }

            function toggleInteractive() {
                const isInteractive = document.getElementById('interactive-mode').checked;
                const standard = document.getElementById('standard-runner');
                const interactive = document.getElementById('interactive-runner');
                
                if (isInteractive) {
                    standard.classList.add('hidden');
                    interactive.classList.remove('hidden');
                } else {
                    standard.classList.remove('hidden');
                    interactive.classList.add('hidden');
                }
                triggerSave();
            }

            function startInteractive() {
                const history = document.getElementById('chat-history');
                history.innerHTML = '';
                
                document.getElementById('interactiveStartBtn').classList.add('hidden');
                document.getElementById('interactiveStopBtn').classList.remove('hidden');
                
                activeInputRow = null;
                vscode.postMessage({ command: 'run-interactive' });
                
                createInputRow();
            }

            function stopInteractive() {
                vscode.postMessage({ command: 'stop-interactive' });
                appendMessage('system', 'Process Stopped by User.');
                setInteractiveStoppedState();
            }
            
            function setInteractiveStoppedState() {
                document.getElementById('interactiveStartBtn').classList.remove('hidden');
                document.getElementById('interactiveStopBtn').classList.add('hidden');
                if (activeInputRow) {
                    activeInputRow.remove();
                    activeInputRow = null;
                }
            }

            function createInputRow() {
                const history = document.getElementById('chat-history');
                const row = document.createElement('div');
                row.className = 'log-container';
                row.style.zIndex = '1';

                const leftCell = document.createElement('div');
                leftCell.className = 'log-cell left';
                
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'inline-input';
                input.placeholder = 'Type input here...';
                input.onkeydown = handleInput;
                
                leftCell.appendChild(input);
                
                const rightCell = document.createElement('div');
                rightCell.className = 'log-cell right';

                row.appendChild(leftCell);
                row.appendChild(rightCell);
                history.appendChild(row);
                
                activeInputRow = row;
                
                setTimeout(() => input.focus(), 10);
                history.scrollTop = history.scrollHeight;
            }

            function handleInput(event) {
                if (event.key === 'Enter') {
                    const text = event.target.value;
                    if (!text) return;
                    
                    const parent = event.target.parentElement;
                    parent.innerHTML = '';
                    parent.innerText = text;
                    
                    activeInputRow = null;
                    
                    vscode.postMessage({ command: 'interactive-input', text: text });
                    
                    createInputRow();
                }
            }

            function appendMessage(role, text) {
                const history = document.getElementById('chat-history');
                
                if (role === 'system') {
                    const div = document.createElement('div');
                    div.className = 'msg-system';
                    div.style.zIndex = '1';
                    div.innerText = text;
                    
                    if (activeInputRow) {
                        history.insertBefore(div, activeInputRow);
                    } else {
                        history.appendChild(div);
                    }
                } else {
                    const row = document.createElement('div');
                    row.className = 'log-container';
                    row.style.zIndex = '1';
                    
                    const leftCell = document.createElement('div');
                    leftCell.className = 'log-cell left';
                    
                    const rightCell = document.createElement('div');
                    rightCell.className = 'log-cell right';
                    
                    if (role === 'solver') rightCell.innerText = text;
                    else if (role === 'error') {
                        rightCell.className += ' msg-error';
                        rightCell.innerText = text;
                    }
                    
                    row.appendChild(leftCell);
                    row.appendChild(rightCell);
                    
                    if (activeInputRow) {
                        history.insertBefore(row, activeInputRow);
                    } else {
                        history.appendChild(row);
                    }
                }

                history.scrollTop = history.scrollHeight;
            }

            window.addEventListener('message', event => {
                const msg = event.data;
                
                if (msg.type === 'restore-state') {
                    const state = msg.state;
                    if (state && state.view === 'workspace') {
                         homeView.classList.add('hidden');
                         workspaceView.classList.remove('hidden');
                         problemContent.innerHTML = state.problemHtml || '';
                         
                         if (window.MathJax) {
                            setTimeout(() => { window.MathJax.typesetPromise([problemContent]); }, 100);
                         }
                         
                         if (state.testCases) {
                             state.testCases.forEach(c => addTestCase(c.input, c.expected));
                         }
                         
                         if (state.interactive) {
                             document.getElementById('interactive-mode').checked = true;
                         }
                         toggleInteractive();
                         
                         switchTab(state.tab || 'runner');
                    }
                }
                else if (msg.type === 'navigate') {
                    if (msg.view === 'workspace') {
                        homeView.classList.add('hidden');
                        workspaceView.classList.remove('hidden');
                        
                        problemContent.innerHTML = msg.problemHtml || '';
                        
                        if (window.MathJax) {
                            setTimeout(() => {
                                window.MathJax.typesetPromise([problemContent]);
                            }, 100);
                        }

                        switchTab(msg.tab || 'runner');

                        if (msg.initialData) {
                            msg.initialData.forEach(c => addTestCase(c.input, c.expected));
                        } else {
                            addTestCase();
                        }
                        triggerSave();
                    }
                } 
                else if (msg.type === 'status') {
                     if (msg.value === 'Fetching...') {
                         fetchBtn.innerText = 'Fetching...';
                         fetchBtn.disabled = true;
                     } else if (msg.value === 'Error') {
                         fetchBtn.innerText = 'Fetch';
                         fetchBtn.disabled = false;
                     } else {
                         runBtn.innerText = msg.value;
                     }
                }
                else if (msg.type === 'finished') { runBtn.innerText = 'Run All'; runBtn.disabled = false; }
                else if (msg.type === 'compile-error') { 
                    runBtn.innerText = 'Error'; 
                    runBtn.disabled = false; 
                    vscode.postMessage({ command: 'showError', text: msg.output });
                }
                else if (msg.type === 'test-result') {
                    const c = document.getElementById(msg.id);
                    if (c) {
                        const outBox = c.querySelector('.output-box');
                        outBox.value = msg.output;
                        autoResize(outBox);
                        
                        c.querySelector('.time-tag').innerText = Math.round(msg.time) + 'ms';
                        const s = c.querySelector('.status-tag');
                        s.innerText = msg.statusText; s.className = 'status-tag status-' + msg.statusText;
                        c.classList.remove('AC', 'WA'); c.classList.add(msg.passed ? 'AC' : 'WA');
                        if(msg.passed) c.classList.add('collapsed'); else c.classList.remove('collapsed');
                    }
                }
                else if (msg.type === 'interactive-stdout') {
                    appendMessage('solver', msg.data);
                }
                else if (msg.type === 'interactive-stderr') {
                    appendMessage('error', msg.data);
                }
                else if (msg.type === 'interactive-system') {
                    appendMessage('system', msg.value);
                }
                else if (msg.type === 'interactive-error') {
                    appendMessage('error', msg.value);
                }
                else if (msg.type === 'interactive-exit') {
                    appendMessage('system', 'Process Exited with code ' + msg.code);
                    setInteractiveStoppedState();
                }
                else if (msg.type === 'interactive-stopped') {
                    setInteractiveStoppedState();
                }
            });

window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-import-url')?.addEventListener('click', showParseUI);
    document.getElementById('btn-manual-create')?.addEventListener('click', manualStart);
    document.getElementById('fetchBtn')?.addEventListener('click', startParsing);
    document.getElementById('btn-cancel-parse')?.addEventListener('click', hideParseUI);
    document.getElementById('btn-gohome')?.addEventListener('click', goHome);
    
    document.getElementById('tab-btn-problem')?.addEventListener('click', () => switchTab('problem'));
    document.getElementById('tab-btn-runner')?.addEventListener('click', () => switchTab('runner'));
    
    document.getElementById('interactive-mode')?.addEventListener('change', toggleInteractive);
    document.getElementById('btn-interactive-mode-text')?.addEventListener('click', () => {
        document.getElementById('interactive-mode').click();
    });
    
    document.getElementById('btn-add-case')?.addEventListener('click', () => addTestCase());
    document.getElementById('runBtn')?.addEventListener('click', runTests);
    
    document.getElementById('interactiveStartBtn')?.addEventListener('click', startInteractive);
    document.getElementById('interactiveStopBtn')?.addEventListener('click', stopInteractive);
});
