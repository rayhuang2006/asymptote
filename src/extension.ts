import * as vscode from 'vscode';
import * as path from 'path';

const Parser = require('web-tree-sitter');

export async function activate(context: vscode.ExtensionContext) {
    try {
        await Parser.init();
        
        const parser = new Parser();
        const wasmPath = path.join(context.extensionPath, 'parsers', 'tree-sitter-cpp.wasm');
        
        const Lang = await Parser.Language.load(wasmPath);
        parser.setLanguage(Lang);

        const codelensProvider = new AsymptoteCodeLensProvider(parser, Lang);

        vscode.languages.registerCodeLensProvider(
            ['cpp', 'c'],
            codelensProvider
        );

        let disposable = vscode.commands.registerCommand('asymptote.refreshComplexity', () => {
            codelensProvider.refresh();
        });

        context.subscriptions.push(disposable);

    } catch (error) {
        vscode.window.showErrorMessage('Asymptote failed to start: ' + error);
    }
}

export function deactivate() {}

class AsymptoteCodeLensProvider implements vscode.CodeLensProvider {

    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;
    private parser: any;
    private lang: any;

    constructor(parser: any, lang: any) {
        this.parser = parser;
        this.lang = lang;
    }

    public provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        const codeLenses: vscode.CodeLens[] = [];
        const text = document.getText();
        const tree = this.parser.parse(text);
        
        const query = this.lang.query(`
            (function_definition
                declarator: (function_declarator
                    declarator: (identifier) @func_name
                )
                body: (compound_statement) @func_body
            )
        `);

        const matches = query.matches(tree.rootNode);

        for (const match of matches) {
            const funcNameNode = match.captures.find((c: any) => c.name === 'func_name')?.node;
            const funcBodyNode = match.captures.find((c: any) => c.name === 'func_body')?.node;
            
            if (funcNameNode && funcBodyNode) {
                const range = new vscode.Range(
                    new vscode.Position(funcNameNode.startPosition.row, funcNameNode.startPosition.column),
                    new vscode.Position(funcNameNode.endPosition.row, funcNameNode.endPosition.column)
                );

                const depth = this.calculateLoopDepth(funcBodyNode);
                let complexityText = "O(1)";
                if (depth > 0) {
                    if (depth === 1) complexityText = "O(N)";
                    else complexityText = `O(N^${depth})`;
                }

                const command: vscode.Command = {
                    title: `Complexity: ${complexityText}`,
                    command: "asymptote.refreshComplexity"
                };

                codeLenses.push(new vscode.CodeLens(range, command));
            }
        }

        return codeLenses;
    }

    private calculateLoopDepth(node: any): number {
        let maxDepth = 0;

        const traverse = (currentNode: any, currentDepth: number) => {
            let isLoop = false;
            if (currentNode.type === 'for_statement' || 
                currentNode.type === 'while_statement' || 
                currentNode.type === 'do_statement') {
                isLoop = true;
            }

            let nextDepth = currentDepth;
            if (isLoop) {
                nextDepth++;
            }

            if (nextDepth > maxDepth) {
                maxDepth = nextDepth;
            }

            if (currentNode.children) {
                for (const child of currentNode.children) {
                    traverse(child, nextDepth);
                }
            }
        };

        traverse(node, 0);
        return maxDepth;
    }

    public refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }
}