import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { getWebviewHtml } from '../webview/WebviewHtml';
import { STATE_VERSION } from '../webview/WorkspaceState';

const READY_TIMEOUT_MS = 10000;

/** out/test/webview.test.js -> the extension root. */
const extensionUri = vscode.Uri.file(path.join(__dirname, '..', '..'));

function createPanel(): vscode.WebviewPanel {
    return vscode.window.createWebviewPanel(
        'asymptote.test',
        'Asymptote Test',
        { viewColumn: vscode.ViewColumn.One, preserveFocus: true },
        { enableScripts: true, localResourceRoots: [extensionUri] }
    );
}

/**
 * Loads the real panel markup in a real webview and resolves with the handshake it
 * sends back. Nothing resolves unless the scripts actually loaded and ran, so this
 * is what catches a broken asset URI or a content security policy that blocks them.
 */
function loadPanel(panel: vscode.WebviewPanel): Promise<any> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('The webview never reported that it was ready')),
            READY_TIMEOUT_MS
        );

        panel.webview.onDidReceiveMessage((message) => {
            if (message.command === 'ready') {
                clearTimeout(timer);
                resolve(message);
            }
        });

        panel.webview.html = getWebviewHtml(panel.webview, extensionUri);
    });
}

suite('Webview', () => {
    test('resolves every asset through the webview scheme', () => {
        const panel = createPanel();
        try {
            const html = getWebviewHtml(panel.webview, extensionUri);

            assert.ok(!/\$\{\w+\}/.test(html), 'every placeholder should be filled in');
            ['main.css', 'main.js', 'diff.js'].forEach((asset) => {
                const pattern = new RegExp(`(?:href|src)="([^"]*${asset.replace('.', '\\.')})"`);
                const match = html.match(pattern);
                assert.ok(match, `${asset} should be referenced`);

                // A plain file:// path is blocked by the content security policy at runtime.
                const url = match![1];
                assert.ok(
                    url.startsWith('https://') && url.includes('vscode-resource'),
                    `${asset} should be served through the webview scheme, got ${url}`
                );
            });
        } finally {
            panel.dispose();
        }
    });

    test('loads and runs its scripts inside a real webview', async function () {
        this.timeout(20000);
        const panel = createPanel();
        try {
            const ready = await loadPanel(panel);

            assert.strictEqual(ready.command, 'ready');
            assert.strictEqual(ready.diffLoaded, true, 'diff.js should be loaded alongside main.js');
        } finally {
            panel.dispose();
        }
    });

    test('opens a fetched problem and saves the session it creates', async function () {
        this.timeout(20000);
        const panel = createPanel();
        try {
            await loadPanel(panel);

            const saved = new Promise<any>((resolve) => {
                panel.webview.onDidReceiveMessage((message) => {
                    if (message.command === 'save-state' && message.state) {
                        resolve(message.state);
                    }
                });
            });

            await panel.webview.postMessage({
                type: 'problem-loaded',
                problem: { title: 'A. Watermelon', timeLimit: '1 second', memoryLimit: '256 MB', html: '<p>statement</p>' },
                testCases: [{ input: '8', expected: 'YES' }]
            });

            const state = await saved;
            assert.strictEqual(state.version, STATE_VERSION);
            assert.strictEqual(state.problem.title, 'A. Watermelon');
            assert.strictEqual(state.testCases.length, 1);
            assert.strictEqual(state.testCases[0].input, '8');
        } finally {
            panel.dispose();
        }
    });
});
