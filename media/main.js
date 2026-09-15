(function (global) {
    'use strict';

    const vscode = acquireVsCodeApi();
    const STATE_VERSION = 3;
    const SAVE_DEBOUNCE_MS = 400;

    /**
     * The single source of truth for the panel. Everything on screen is rendered
     * from here, and nothing is ever read back out of the DOM.
     */
    const state = {
        hasSession: false,
        mode: 'standard',
        /** The runner opens first: it works without importing anything. */
        tab: 'runner',
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
            'tab-runner', 'tab-problem', 'panel-runner', 'panel-problem',
            'statement-title', 'statement-limits', 'statement-empty', 'problem-content',
            'problem-slot', 'import-slot', 'btn-open-statement',
            'problem-title', 'problem-meta', 'problem-url', 'fetchBtn', 'parse-error',
            'verdict-strip', 'run-summary', 'runBtn',
            'test-cases-container', 'cases-empty', 'runner-error',
            'runner-error-title', 'runner-error-body', 'standard-runner', 'interactive-runner',
            'mode-standard', 'mode-interactive', 'chat-history',
            'interactiveStartBtn', 'interactiveStopBtn'
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
            mode: state.mode,
            tab: state.tab,
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
        state.hasSession = true;
        state.mode = stored.mode || 'standard';
        state.tab = stored.tab === 'problem' ? 'problem' : 'runner';
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
        renderTabs();
        renderProblem();
        renderMode();
        renderCases();
        renderStrip();
    }

    function renderTabs() {
        const onProblem = state.tab === 'problem';
        els['tab-runner'].classList.toggle('active', !onProblem);
        els['tab-problem'].classList.toggle('active', onProblem);
        toggle(els['panel-runner'], onProblem);
        toggle(els['panel-problem'], !onProblem);
    }

    function setTab(tab) {
        state.tab = tab;
        render();
        persist();

        if (tab === 'runner') {
            requestAnimationFrame(() => {
                document.querySelectorAll('#panel-runner textarea').forEach(autoResize);
            });
        }
    }

    function toggle(element, hidden) {
        if (element) {
            element.classList.toggle('hidden', hidden);
        }
    }

    function renderProblem() {
        const problem = state.problem;
        const named = Boolean(problem && problem.title);

        els['problem-title'].textContent = named ? problem.title : 'No problem';
        els['btn-open-statement'].classList.toggle('placeholder', !named);
        els['btn-open-statement'].disabled = !named;
        els['problem-meta'].textContent = formatLimits(problem);

        // With nothing imported the toolbar offers the URL box instead of a title.
        toggle(els['problem-slot'], !problem);
        toggle(els['import-slot'], Boolean(problem));

        renderStatement(problem);
    }

    /** The statement has something in it only once a problem has been fetched. */
    function renderStatement(problem) {
        els['statement-title'].textContent = problem && problem.title ? problem.title : '';
        els['statement-limits'].textContent = formatLimits(problem);
        toggle(els['statement-empty'], Boolean(problem));
        toggle(els['problem-content'], !problem);

        if (!problem) {
            els['problem-content'].innerHTML = '';
            els['problem-content'].dataset.rendered = '';
            return;
        }

        if (els['problem-content'].dataset.rendered !== problem.html) {
            els['problem-content'].innerHTML = problem.html;
            els['problem-content'].dataset.rendered = problem.html;

            if (window.MathJax && window.MathJax.typesetPromise) {
                window.MathJax.typesetPromise([els['problem-content']]).catch(() => { });
            }
        }
    }

    /** One segment per case, so a whole run reads at a glance. */
    function renderStrip() {
        const strip = els['verdict-strip'];
        strip.textContent = '';

        state.cases.forEach((testCase, index) => {
            const result = results.get(testCase.id);
            const segment = document.createElement('button');
            segment.className = 'verdict' + (result ? ' ' + result.status : '');
            segment.title = `#${index + 1}${result ? ' ' + result.status : ''}`;
            segment.addEventListener('click', () => revealCase(testCase.id));
            strip.appendChild(segment);
        });

        els['run-summary'].textContent = summarise();
    }

    function summarise() {
        const total = state.cases.length;
        if (total === 0) {
            return '';
        }

        const finished = state.cases.filter((testCase) => {
            const result = results.get(testCase.id);
            return result && result.status !== 'RUN';
        });
        const passed = finished.filter((testCase) => results.get(testCase.id).status === 'AC').length;

        return finished.length === 0 ? `${total} cases` : `${passed}/${finished.length}`;
    }

    function revealCase(id) {
        const node = byId(id);
        if (!node) {
            return;
        }
        const result = results.get(id) || {};
        if (result.collapsed) {
            result.collapsed = false;
            results.set(id, result);
            render();
        }
        node.scrollIntoView({ block: 'nearest' });
    }

    /** Scrapers report "Unknown" when a site does not publish limits; saying so twice is noise. */
    function formatLimits(problem) {
        if (!problem) {
            return '';
        }
        const limits = [problem.timeLimit, problem.memoryLimit]
            .filter((limit) => limit && limit.toLowerCase() !== 'unknown');
        return limits.join(' / ');
    }

    function escapeHtml(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
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
                '<div class="case-column">' +
                    '<span class="label">Input</span>' +
                    '<textarea class="input-box" rows="2"></textarea>' +
                '</div>' +
                '<div class="case-column">' +
                    '<span class="label">Expected</span>' +
                    '<textarea class="expected-box" rows="2"></textarea>' +
                '</div>' +
                '<div class="case-column case-output">' +
                    '<span class="label">Actual</span>' +
                    '<textarea class="output-box" rows="2" readonly placeholder="waiting..."></textarea>' +
                '</div>' +
                '<div class="case-column case-diff hidden"></div>' +
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

        node.classList.remove('RUN', 'AC', 'WA', 'RE', 'TLE');
        if (result) {
            node.classList.add(result.status);
        }

        const outputBox = node.querySelector('.output-box');
        outputBox.placeholder = placeholderFor(result);
        const output = result && result.output !== undefined ? result.output : '';
        if (outputBox.value !== output) {
            outputBox.value = output;
            autoResize(outputBox);
        }

        renderDiff(node, testCase, result);

        node.classList.toggle('collapsed', Boolean(result && result.collapsed));
    }

    /**
     * A wrong answer is shown as a unified diff instead of two boxes to eyeball, because
     * the difference is often a single line or an invisible trailing space.
     */
    /** The diff module is a separate script; without it the panel falls back to the output box. */
    function hasDiffModule() {
        return Boolean(global.AsymptoteDiff && typeof global.AsymptoteDiff.compare === 'function');
    }

    function placeholderFor(result) {
        if (!result) {
            return 'waiting...';
        }
        if (result.status === 'RUN') {
            return 'running...';
        }
        if (result.status === 'TLE') {
            return 'timed out before printing anything';
        }
        if (result.status === 'RE') {
            return 'crashed before printing anything';
        }
        return 'no output';
    }

    function renderDiff(node, testCase, result) {
        const host = node.querySelector('.case-diff');
        const outputSection = node.querySelector('.case-output');
        const showDiff = Boolean(result) && result.status === 'WA' && testCase.expected !== '' && hasDiffModule();

        toggle(host, !showDiff);
        // Before a run there is nothing to put in the output box, so it only takes up room.
        toggle(outputSection, showDiff || !result);

        if (!showDiff) {
            host.textContent = '';
            return;
        }

        const comparison = global.AsymptoteDiff.compare(testCase.expected, result.output);
        host.textContent = '';
        host.appendChild(buildDiffSummary(comparison));

        if (comparison.truncated) {
            return;
        }

        const table = document.createElement('div');
        table.className = 'diff-table';
        comparison.rows.forEach((row) => appendDiffRows(table, row));
        host.appendChild(table);
    }

    function buildDiffSummary(comparison) {
        const summary = document.createElement('p');
        summary.className = 'diff-summary';

        if (comparison.truncated) {
            summary.textContent = 'Output is too long to diff; compare the boxes above.';
        } else if (comparison.whitespaceOnly) {
            summary.textContent = 'Differs only in whitespace (line ' + comparison.firstMismatch + ').';
        } else {
            summary.textContent = 'First difference on line ' + comparison.firstMismatch + '.';
        }

        return summary;
    }

    function appendDiffRows(table, row) {
        if (row.type === 'same') {
            table.appendChild(buildDiffRow('same', row.expectedLine, ' ', row.expected));
            return;
        }
        if (row.type === 'changed') {
            table.appendChild(buildDiffRow('removed', row.expectedLine, '-', row.expected));
            table.appendChild(buildDiffRow('added', row.actualLine, '+', row.actual));
            return;
        }
        if (row.type === 'missing') {
            table.appendChild(buildDiffRow('removed', row.expectedLine, '-', row.expected));
            return;
        }
        table.appendChild(buildDiffRow('added', row.actualLine, '+', row.actual));
    }

    function buildDiffRow(kind, lineNumber, marker, text) {
        const line = document.createElement('div');
        line.className = 'diff-line ' + kind;

        const gutter = document.createElement('span');
        gutter.className = 'diff-gutter';
        gutter.textContent = lineNumber === null ? '' : String(lineNumber);

        const sign = document.createElement('span');
        sign.className = 'diff-sign';
        sign.textContent = marker;

        const content = document.createElement('span');
        content.className = 'diff-text';
        appendTextWithVisibleSpaces(content, text);

        line.appendChild(gutter);
        line.appendChild(sign);
        line.appendChild(content);
        return line;
    }

    /**
     * Leading and trailing spaces are the difference you cannot see, so they are drawn
     * as shaded blocks rather than left to the reader to guess at.
     */
    function appendTextWithVisibleSpaces(host, text) {
        if (text === '') {
            host.appendChild(document.createTextNode('\u00a0'));
            return;
        }

        const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
        const leading = match[1];
        const body = match[2];
        const trailing = match[3];

        if (leading) {
            host.appendChild(buildWhitespaceMarker(leading));
        }
        if (body) {
            host.appendChild(document.createTextNode(body));
        }
        if (trailing) {
            host.appendChild(buildWhitespaceMarker(trailing));
        }
    }

    function buildWhitespaceMarker(whitespace) {
        const marker = document.createElement('span');
        marker.className = 'diff-whitespace';
        marker.textContent = whitespace;
        marker.title = whitespace.length + ' whitespace character' + (whitespace.length === 1 ? '' : 's');
        return marker;
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

        hideRunnerError();
        selected.forEach((testCase) => {
            results.set(testCase.id, { status: 'RUN', output: '', collapsed: false });
        });
        render();

        setRunning(true, 'Compiling...');
        vscode.postMessage({
            command: 'run',
            timeLimit: state.problem ? state.problem.timeLimit : '',
            testCases: selected.map((testCase) => ({
                id: testCase.id,
                input: testCase.input,
                expected: testCase.expected
            }))
        });
    }

    function setRunning(isRunning, label) {
        els['runBtn'].disabled = isRunning;
        els['runBtn'].textContent = isRunning ? (label || 'Running...') : 'Run';
    }

    function showRunnerError(title, output) {
        els['runner-error-title'].textContent = title;
        els['runner-error-body'].textContent = output;
        toggle(els['runner-error'], false);
    }

    function hideRunnerError() {
        toggle(els['runner-error'], true);
        els['runner-error-body'].textContent = '';
    }

    function setFetching(isFetching) {
        els['fetchBtn'].disabled = isFetching;
        els['fetchBtn'].textContent = isFetching ? 'Importing...' : 'Import';
    }

    /** Puts the import box back, keeping the cases that are already there. */
    function showImport() {
        state.problem = null;
        toggle(els['parse-error'], true);
        render();
        persist();
        els['problem-url'].focus();
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

    function openProblem(problem, testCases) {
        state.hasSession = true;
        state.mode = 'standard';
        state.problem = problem;
        state.cases = (testCases && testCases.length > 0)
            ? testCases.map((testCase) => createCase(testCase.input, testCase.expected))
            : [createCase()];
        results.clear();
        hideRunnerError();
        render();
        persist();
        requestAnimationFrame(() => {
            document.querySelectorAll('#standard-runner textarea').forEach(autoResize);
        });
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
            openProblem(msg.problem, msg.testCases);
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
            showRunnerError('Compilation failed', msg.output);
            state.cases.forEach((testCase) => results.delete(testCase.id));
            render();
        },
        'run-error': (msg) => {
            setRunning(false);
            showRunnerError(msg.title, msg.output);
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
        byId('fetchBtn').addEventListener('click', startParsing);
        byId('btn-manual').addEventListener('click', () => openProblem(null, []));
        byId('problem-url').addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                startParsing();
            }
        });
        byId('tab-runner').addEventListener('click', () => setTab('runner'));
        byId('tab-problem').addEventListener('click', () => setTab('problem'));
        byId('btn-open-statement').addEventListener('click', () => setTab('problem'));
        byId('btn-go-import').addEventListener('click', () => {
            setTab('runner');
            els['problem-url'].focus();
        });

        byId('mode-standard').addEventListener('click', () => setMode('standard'));
        byId('mode-interactive').addEventListener('click', () => setMode('interactive'));

        byId('btn-add-case').addEventListener('click', () => addCase());
        byId('runBtn').addEventListener('click', () => runCases(null));
        byId('btn-copy-error').addEventListener('click', () => {
            vscode.postMessage({ command: 'copy', text: els['runner-error-body'].textContent });
        });

        byId('interactiveStartBtn').addEventListener('click', startInteractive);
        byId('interactiveStopBtn').addEventListener('click', stopInteractive);
    }

    cacheElements();
    wire();
    render();
    vscode.postMessage({ command: 'ready', diffLoaded: hasDiffModule() });
}(typeof globalThis === 'undefined' ? this : globalThis));
