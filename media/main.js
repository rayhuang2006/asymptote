(function () {
    'use strict';

    const vscode = acquireVsCodeApi();
    const STATE_VERSION = 2;
    const SAVE_DEBOUNCE_MS = 400;

    /**
     * The single source of truth for the panel. Everything on screen is rendered
     * from here, and nothing is ever read back out of the DOM.
     */
    const state = {
        view: 'home',
        hasSession: false,
        tab: 'runner',
        mode: 'standard',
        problem: null,
        cases: []
    };

    /** Run outcomes live for the session only; they are never persisted. */
    const results = new Map();

    let saveTimer;
    let activeInputRow = null;

    const els = {};

    function byId(id) {
        return document.getElementById(id);
    }

    function cacheElements() {
        [
            'home-view', 'workspace-view', 'main-menu', 'parse-ui', 'parse-error',
            'problem-url', 'fetchBtn', 'btn-resume', 'problem-content', 'problem-meta',
            'test-cases-container', 'cases-empty', 'runBtn', 'compile-error',
            'compile-error-body', 'standard-runner', 'interactive-runner',
            'mode-standard', 'mode-interactive', 'chat-history',
            'interactiveStartBtn', 'interactiveStopBtn',
            'tab-btn-problem', 'tab-btn-runner', 'content-problem', 'content-runner'
        ].forEach((id) => { els[id] = byId(id); });
    }

    /* --- state ------------------------------------------------------------- */

    function createCase(input, expected) {
        return {
            id: 'case-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11),
            input: input || '',
            expected: expected || ''
        };
    }

    function serializeState() {
        if (!state.hasSession) {
            return null;
        }
        return {
            version: STATE_VERSION,
            view: state.view,
            tab: state.tab,
            mode: state.mode,
            problem: state.problem,
            testCases: state.cases.map((testCase) => ({
                id: testCase.id,
                input: testCase.input,
                expected: testCase.expected
            }))
        };
    }

    function persist() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            vscode.postMessage({ command: 'save-state', state: serializeState() });
        }, SAVE_DEBOUNCE_MS);
    }

    function applyStoredState(stored) {
        state.view = stored.view === 'home' ? 'home' : 'workspace';
        state.hasSession = true;
        state.tab = stored.tab || 'runner';
        state.mode = stored.mode || 'standard';
        state.problem = stored.problem || null;
        state.cases = (stored.testCases || []).map((testCase) => ({
            id: testCase.id,
            input: testCase.input,
            expected: testCase.expected
        }));
        results.clear();
    }

    /* --- rendering --------------------------------------------------------- */

    function render() {
        toggle(els['home-view'], state.view !== 'home');
        toggle(els['workspace-view'], state.view !== 'workspace');
        toggle(els['btn-resume'], !(state.view === 'home' && state.hasSession));

        if (state.view === 'workspace') {
            renderProblem();
            renderTabs();
            renderMode();
            renderCases();
        }
    }

    function toggle(element, hidden) {
        if (element) {
            element.classList.toggle('hidden', hidden);
        }
    }

    function renderProblem() {
        const problem = state.problem;
        els['problem-content'].innerHTML = problem ? buildProblemMarkup(problem) : '';
        els['problem-meta'].textContent = problem && problem.timeLimit
            ? problem.timeLimit + ' / ' + problem.memoryLimit
            : '';

        if (problem && window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([els['problem-content']]).catch(() => { });
        }
    }

    function buildProblemMarkup(problem) {
        const header = problem.title
            ? '<h2 class="problem-title">' + escapeHtml(problem.title) + '</h2>' +
              '<p class="problem-limits">time limit: ' + escapeHtml(problem.timeLimit) +
              ' | memory limit: ' + escapeHtml(problem.memoryLimit) + '</p>'
            : '';
        return header + problem.html;
    }

    function escapeHtml(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function renderTabs() {
        els['tab-btn-problem'].classList.toggle('active', state.tab === 'problem');
        els['tab-btn-runner'].classList.toggle('active', state.tab === 'runner');
        toggle(els['content-problem'], state.tab !== 'problem');
        toggle(els['content-runner'], state.tab !== 'runner');
    }

    function renderMode() {
        const interactive = state.mode === 'interactive';
        els['mode-standard'].classList.toggle('active', !interactive);
        els['mode-interactive'].classList.toggle('active', interactive);
        toggle(els['standard-runner'], interactive);
        toggle(els['interactive-runner'], !interactive);
    }

    function renderCases() {
        const container = els['test-cases-container'];

        state.cases.forEach((testCase, index) => {
            let node = byId(testCase.id);
            if (!node) {
                node = buildCaseNode(testCase);
                container.appendChild(node);
            }
            if (container.children[index] !== node) {
                container.insertBefore(node, container.children[index] || null);
            }
            updateCaseNode(node, testCase, index);
        });

        Array.from(container.children).forEach((node) => {
            if (!state.cases.some((testCase) => testCase.id === node.id)) {
                node.remove();
            }
        });

        toggle(els['cases-empty'], state.cases.length > 0);
    }

    function buildCaseNode(testCase) {
        const node = document.createElement('div');
        node.className = 'test-case';
        node.id = testCase.id;
        node.innerHTML =
            '<div class="case-header">' +
                '<div class="case-summary">' +
                    '<span class="case-number"></span>' +
                    '<span class="status-tag"></span>' +
                    '<span class="time-tag"></span>' +
                '</div>' +
                '<div class="case-actions">' +
                    '<button class="btn-icon btn-run" title="Run this case"><svg viewBox="0 0 16 16"><path d="M4 2v12l10-6L4 2z"/></svg></button>' +
                    '<button class="btn-icon btn-clone" title="Clone"><svg viewBox="0 0 16 16"><path d="M4 2h6a2 2 0 0 1 2 2v6h-1V4a1 1 0 0 0-1-1H4V2Z"/><path d="M2 5h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/></svg></button>' +
                    '<button class="btn-icon btn-remove" title="Remove"><svg viewBox="0 0 16 16"><path d="M13.9 2.1a.5.5 0 0 1 0 .7l-11 11a.5.5 0 0 1-.7-.7l11-11a.5.5 0 0 1 .7 0Z"/><path d="M2.1 2.1a.5.5 0 0 0 0 .7l11 11a.5.5 0 0 0 .7-.7l-11-11a.5.5 0 0 0-.7 0Z"/></svg></button>' +
                '</div>' +
            '</div>' +
            '<div class="case-body">' +
                '<span class="label">Input</span><textarea class="input-box" rows="2"></textarea>' +
                '<span class="label">Expected</span><textarea class="expected-box" rows="2"></textarea>' +
                '<span class="label">Actual</span><textarea class="output-box" rows="2" readonly placeholder="waiting..."></textarea>' +
            '</div>';

        const inputBox = node.querySelector('.input-box');
        const expectedBox = node.querySelector('.expected-box');
        inputBox.value = testCase.input;
        expectedBox.value = testCase.expected;

        node.querySelector('.case-header').addEventListener('click', () => toggleCollapsed(testCase.id));
        node.querySelector('.btn-run').addEventListener('click', (event) => {
            event.stopPropagation();
            runCases([testCase.id]);
        });
        node.querySelector('.btn-clone').addEventListener('click', (event) => {
            event.stopPropagation();
            cloneCase(testCase.id);
        });
        node.querySelector('.btn-remove').addEventListener('click', (event) => {
            event.stopPropagation();
            removeCase(testCase.id);
        });

        inputBox.addEventListener('input', () => {
            testCase.input = inputBox.value;
            autoResize(inputBox);
            persist();
        });
        expectedBox.addEventListener('input', () => {
            testCase.expected = expectedBox.value;
            autoResize(expectedBox);
            persist();
        });

        requestAnimationFrame(() => {
            node.querySelectorAll('textarea').forEach(autoResize);
        });

        return node;
    }

    function updateCaseNode(node, testCase, index) {
        const result = results.get(testCase.id);
        node.querySelector('.case-number').textContent = '#' + (index + 1);

        const statusTag = node.querySelector('.status-tag');
        statusTag.textContent = result ? result.status : '';
        statusTag.className = 'status-tag' + (result ? ' status-' + result.status : '');

        node.querySelector('.time-tag').textContent =
            result && result.time !== undefined ? Math.round(result.time) + 'ms' : '';

        node.classList.remove('AC', 'WA', 'RE', 'TLE');
        if (result && result.status !== 'RUN') {
            node.classList.add(result.status);
        }

        const outputBox = node.querySelector('.output-box');
        const output = result && result.output !== undefined ? result.output : '';
        if (outputBox.value !== output) {
            outputBox.value = output;
            autoResize(outputBox);
        }

        node.classList.toggle('collapsed', Boolean(result && result.collapsed));
    }

    function autoResize(element) {
        element.style.height = 'auto';
        element.style.height = element.scrollHeight + 'px';
    }

    /* --- actions ----------------------------------------------------------- */

    function addCase(input, expected) {
        state.cases.push(createCase(input, expected));
        render();
        persist();
    }

    function cloneCase(id) {
        const source = state.cases.find((testCase) => testCase.id === id);
        if (source) {
            addCase(source.input, source.expected);
        }
    }

    function removeCase(id) {
        state.cases = state.cases.filter((testCase) => testCase.id !== id);
        results.delete(id);
        render();
        persist();
    }

    function toggleCollapsed(id) {
        const result = results.get(id) || {};
        result.collapsed = !result.collapsed;
        results.set(id, result);
        render();
    }

    function runCases(ids) {
        const selected = state.cases.filter((testCase) => !ids || ids.indexOf(testCase.id) !== -1);
        if (selected.length === 0) {
            return;
        }

        hideCompileError();
        selected.forEach((testCase) => {
            results.set(testCase.id, { status: 'RUN', output: '', collapsed: false });
        });
        render();

        setRunning(true, 'Compiling...');
        vscode.postMessage({
            command: 'run',
            testCases: selected.map((testCase) => ({
                id: testCase.id,
                input: testCase.input,
                expected: testCase.expected
            }))
        });
    }

    function setRunning(isRunning, label) {
        els['runBtn'].disabled = isRunning;
        els['runBtn'].textContent = isRunning ? (label || 'Running...') : 'Run All';
    }

    function showCompileError(output) {
        els['compile-error-body'].textContent = output;
        toggle(els['compile-error'], false);
    }

    function hideCompileError() {
        toggle(els['compile-error'], true);
        els['compile-error-body'].textContent = '';
    }

    function showParseUI() {
        toggle(els['main-menu'], true);
        toggle(els['parse-ui'], false);
        toggle(els['parse-error'], true);
    }

    function hideParseUI() {
        toggle(els['parse-ui'], true);
        toggle(els['main-menu'], false);
        setFetching(false);
    }

    function setFetching(isFetching) {
        els['fetchBtn'].disabled = isFetching;
        els['fetchBtn'].textContent = isFetching ? 'Fetching...' : 'Fetch';
    }

    function startParsing() {
        const url = els['problem-url'].value.trim();
        if (!url) {
            return;
        }
        toggle(els['parse-error'], true);
        setFetching(true);
        vscode.postMessage({ command: 'parse-url', url });
    }

    function openWorkspace(problem, testCases) {
        state.view = 'workspace';
        state.hasSession = true;
        state.tab = problem ? 'problem' : 'runner';
        state.mode = 'standard';
        state.problem = problem;
        state.cases = (testCases && testCases.length > 0)
            ? testCases.map((testCase) => createCase(testCase.input, testCase.expected))
            : [createCase()];
        results.clear();
        hideCompileError();
        render();
        persist();
    }

    /** Going home only navigates; the session stays on disk and can be resumed. */
    function goHome() {
        state.view = 'home';
        hideParseUI();
        render();
        persist();
    }

    function setTab(tab) {
        state.tab = tab;
        render();
        if (tab === 'runner') {
            requestAnimationFrame(() => {
                document.querySelectorAll('#standard-runner textarea').forEach(autoResize);
            });
        }
        persist();
    }

    function setMode(mode) {
        state.mode = mode;
        render();
        persist();
    }

    /* --- interactive ------------------------------------------------------- */

    function startInteractive() {
        els['chat-history'].innerHTML = '';
        toggle(els['interactiveStartBtn'], true);
        toggle(els['interactiveStopBtn'], false);
        activeInputRow = null;
        vscode.postMessage({ command: 'run-interactive' });
        createInputRow();
    }

    function stopInteractive() {
        vscode.postMessage({ command: 'stop-interactive' });
        appendMessage('system', 'Process stopped by user.');
        setInteractiveStopped();
    }

    function setInteractiveStopped() {
        toggle(els['interactiveStartBtn'], false);
        toggle(els['interactiveStopBtn'], true);
        if (activeInputRow) {
            activeInputRow.remove();
            activeInputRow = null;
        }
    }

    function createInputRow() {
        const history = els['chat-history'];
        const row = document.createElement('div');
        row.className = 'log-container';

        const leftCell = document.createElement('div');
        leftCell.className = 'log-cell left';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'inline-input';
        input.placeholder = 'Type input here...';
        input.addEventListener('keydown', handleInteractiveKey);

        leftCell.appendChild(input);

        const rightCell = document.createElement('div');
        rightCell.className = 'log-cell right';

        row.appendChild(leftCell);
        row.appendChild(rightCell);
        history.appendChild(row);

        activeInputRow = row;
        requestAnimationFrame(() => input.focus());
        history.scrollTop = history.scrollHeight;
    }

    function handleInteractiveKey(event) {
        if (event.key !== 'Enter') {
            return;
        }
        const text = event.target.value;
        if (!text) {
            return;
        }

        const cell = event.target.parentElement;
        cell.textContent = text;
        activeInputRow = null;

        vscode.postMessage({ command: 'interactive-input', text });
        createInputRow();
    }

    function appendMessage(role, text) {
        const history = els['chat-history'];
        let node;

        if (role === 'system') {
            node = document.createElement('div');
            node.className = 'msg-system';
            node.textContent = text;
        } else {
            node = document.createElement('div');
            node.className = 'log-container';

            const leftCell = document.createElement('div');
            leftCell.className = 'log-cell left';

            const rightCell = document.createElement('div');
            rightCell.className = 'log-cell right' + (role === 'error' ? ' error' : '');
            rightCell.textContent = text;

            node.appendChild(leftCell);
            node.appendChild(rightCell);
        }

        if (activeInputRow) {
            history.insertBefore(node, activeInputRow);
        } else {
            history.appendChild(node);
        }
        history.scrollTop = history.scrollHeight;
    }

    /* --- messages ---------------------------------------------------------- */

    const handlers = {
        'init': (msg) => {
            if (msg.state) {
                applyStoredState(msg.state);
            }
            render();
        },
        'problem-loaded': (msg) => {
            setFetching(false);
            openWorkspace(msg.problem, msg.testCases);
        },
        'status': (msg) => {
            if (msg.scope === 'fetch') {
                setFetching(msg.value === 'loading');
                if (msg.value === 'error') {
                    els['parse-error'].textContent = msg.message || 'Could not load that problem.';
                    toggle(els['parse-error'], false);
                }
                return;
            }
            setRunning(true, msg.value);
        },
        'compile-error': (msg) => {
            setRunning(false);
            showCompileError(msg.output);
            state.cases.forEach((testCase) => results.delete(testCase.id));
            render();
        },
        'test-result': (msg) => {
            results.set(msg.id, {
                status: msg.statusText,
                time: msg.time,
                output: msg.output,
                collapsed: msg.passed
            });
            render();
        },
        'finished': () => setRunning(false),
        'interactive-stdout': (msg) => appendMessage('solver', msg.data),
        'interactive-stderr': (msg) => appendMessage('error', msg.data),
        'interactive-system': (msg) => appendMessage('system', msg.value),
        'interactive-error': (msg) => appendMessage('error', msg.value),
        'interactive-exit': (msg) => {
            appendMessage('system', 'Process exited with code ' + msg.code);
            setInteractiveStopped();
        },
        'interactive-stopped': () => setInteractiveStopped()
    };

    window.addEventListener('message', (event) => {
        const handler = handlers[event.data.type];
        if (handler) {
            handler(event.data);
        }
    });

    /* --- wiring ------------------------------------------------------------ */

    function wire() {
        byId('btn-import-url').addEventListener('click', showParseUI);
        byId('btn-manual-create').addEventListener('click', () => openWorkspace(null, []));
        byId('btn-cancel-parse').addEventListener('click', hideParseUI);
        byId('fetchBtn').addEventListener('click', startParsing);
        byId('problem-url').addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                startParsing();
            }
        });
        byId('btn-resume').addEventListener('click', () => {
            state.view = 'workspace';
            render();
            persist();
        });

        byId('btn-gohome').addEventListener('click', goHome);
        byId('tab-btn-problem').addEventListener('click', () => setTab('problem'));
        byId('tab-btn-runner').addEventListener('click', () => setTab('runner'));
        byId('mode-standard').addEventListener('click', () => setMode('standard'));
        byId('mode-interactive').addEventListener('click', () => setMode('interactive'));

        byId('btn-add-case').addEventListener('click', () => addCase());
        byId('runBtn').addEventListener('click', () => runCases(null));
        byId('btn-copy-error').addEventListener('click', () => {
            vscode.postMessage({ command: 'copy', text: els['compile-error-body'].textContent });
        });

        byId('interactiveStartBtn').addEventListener('click', startInteractive);
        byId('interactiveStopBtn').addEventListener('click', stopInteractive);
    }

    cacheElements();
    wire();
    render();
    vscode.postMessage({ command: 'ready' });
}());
