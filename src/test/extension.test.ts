import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'rayhuang2006.asymptote-helper';

/**
 * These run against the packaged entry point, so they fail if a dependency
 * survives type checking but not bundling. The analyzer is the sensitive one:
 * web-tree-sitter resolves its wasm relative to the script that loaded it.
 */
suite('Extension', () => {
    test('activates from the bundled entry point', async function () {
        this.timeout(30000);
        const extension = vscode.extensions.getExtension(EXTENSION_ID);

        assert.ok(extension, `${EXTENSION_ID} should be present in the test host`);
        await extension!.activate();
        assert.strictEqual(extension!.isActive, true);
    });

    test('analyses a C++ function through the loaded grammars', async function () {
        this.timeout(30000);
        await vscode.extensions.getExtension(EXTENSION_ID)!.activate();

        const document = await vscode.workspace.openTextDocument({
            language: 'cpp',
            content: 'int work(int n) {\n    for (int i = 0; i < n; i++) {\n        for (int j = 0; j < n; j++) {}\n    }\n    return 0;\n}\n'
        });

        const lenses = await vscode.commands.executeCommand<vscode.CodeLens[]>(
            'vscode.executeCodeLensProvider',
            document.uri
        );

        assert.ok(lenses && lenses.length > 0, 'the C++ grammar should produce a lens');
        assert.match(lenses[0].command?.title ?? '', /^Complexity: O\(/);
    });

    test('contributes the commands the editor advertises', async () => {
        const commands = await vscode.commands.getCommands(true);

        ['asymptote.refreshComplexity', 'asymptote.openRunner', 'asymptote.toggleCodeLens']
            .forEach((command) => assert.ok(commands.includes(command), `${command} should be registered`));
    });
});
