// Runs the bundle the way an installed extension runs it: from a directory with
// no node_modules at all.
//
// The previous check ran the bundle from inside the repository, where anything
// esbuild had failed to inline could still be resolved from node_modules. That is
// how a plugin loading its parts through a runtime-built module name reached
// users: it worked everywhere except where it mattered.
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const { execFileSync } = require('child_process');

const repository = path.join(__dirname, '..', '..');
const target = process.argv[2] ? path.resolve(process.argv[2]) : null;
// The probe is bundled from source, which only the repository has.
const root = target ?? repository;

/**
 * Produces the directory a user would end up with. Given an installed extension
 * it is copied as it sits, dependencies and all; otherwise the repository is
 * packaged first, so what runs here is exactly what would be published.
 */
function stageInstalledLayout() {
    const staged = fs.mkdtempSync(path.join(os.tmpdir(), 'asymptote-verify-'));

    if (target) {
        fs.cpSync(target, staged, { recursive: true });
        return staged;
    }

    const archive = path.join(staged, 'package.vsix');
    execFileSync('npx', ['@vscode/vsce@3.9.2', 'package', '--out', archive], {
        cwd: repository,
        stdio: ['ignore', 'ignore', 'inherit']
    });
    execFileSync('unzip', ['-q', archive, '-d', path.join(staged, 'unpacked')]);
    return path.join(staged, 'unpacked', 'extension');
}

/**
 * Stands in for the editor API. Members the extension reaches for but this stub does
 * not define resolve to a disposable-returning no-op and are reported, because the
 * point of this check is whether the bundle loads, not whether the stub is complete.
 */
function autoStub(name, defined) {
    return new Proxy(defined, {
        get(target, key) {
            if (key in target || typeof key === 'symbol') {
                return target[key];
            }
            console.log(`  stubbed ${name}.${String(key)}`);
            return () => ({ dispose() {} });
        }
    });
}

function stubEditor() {
    const noop = () => ({ dispose() {} });
    const editor = {
        Uri: {
            file: (value) => ({ fsPath: value, path: value }),
            joinPath: (base, ...parts) => ({ fsPath: path.join(base.fsPath, ...parts) })
        },
        EventEmitter: class { constructor() { this.event = noop; } fire() {} dispose() {} },
        CodeLens: class { constructor(range, command) { this.range = range; this.command = command; } },
        Range: class {}, Position: class {},
        ConfigurationTarget: { Global: 1 },
        languages: { registerCodeLensProvider: noop },
        window: {
            registerWebviewViewProvider: noop,
            showErrorMessage: (message) => { console.log(`  editor message: ${message}`); },
            showOpenDialog: async () => undefined,
            activeTextEditor: undefined
        },
        commands: { registerCommand: noop, executeCommand: noop },
        workspace: {
            getConfiguration: () => ({ get: () => undefined, update: async () => {} }),
            onDidChangeConfiguration: noop
        },
        env: { clipboard: { writeText: async () => {} } }
    };

    ['window', 'workspace', 'commands', 'languages', 'env'].forEach((area) => {
        editor[area] = autoStub(area, editor[area]);
    });

    return editor;
}

async function main() {
    const staged = stageInstalledLayout();
    console.log(`staged at ${staged}`);
    const dependencies = path.join(staged, 'node_modules');
    console.log(`shipped dependencies: ${fs.existsSync(dependencies)
        ? fs.readdirSync(dependencies).join(', ') || 'none'
        : 'none'}`);

    const editor = stubEditor();
    const load = Module._load;
    Module._load = function (request, parent, isMain) {
        if (request === 'vscode') { return editor; }
        return load.call(this, request, parent, isMain);
    };

    const bundle = path.join(staged, 'dist', 'extension.js');
    const extension = require(bundle);

    const api = await extension.activate({
        extensionPath: staged,
        extensionUri: { fsPath: staged },
        globalStorageUri: { fsPath: path.join(staged, 'storage') },
        subscriptions: [],
        workspaceState: { get: () => undefined, update: async () => {} },
        globalState: { get: () => undefined, update: async () => {} }
    });
    console.log('activate: ok');

    if (!api || typeof api.fetchProblem !== 'function') {
        throw new Error('the build exposes no API, so the browser path cannot be exercised');
    }

    // Activation never touches the browser, and the browser is where modules
    // resolved at runtime live, so the shipped code has to be driven into it.
    // Anything but a missing module counts as a pass: a machine without Chrome or
    // without a network is not what this is checking.
    try {
        const problem = await api.fetchProblem('https://codeforces.com/problemset/problem/4/A');
        console.log(`browser path: read "${problem.title}"`);
    } catch (error) {
        if (/Cannot find module/i.test(error.message)) {
            throw error;
        }
        console.log(`browser path: reached the browser, then failed for another reason (${error.message})`);
    }

    console.log('PASS');
}

main().catch((error) => {
    console.error(`FAIL: ${error.message}`);
    process.exit(1);
});
