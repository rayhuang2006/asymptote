import * as vscode from 'vscode';
import * as path from 'path';
import { SidebarProvider } from './SidebarProvider';
import { AlgorithmRegistry } from './analyzer/AlgorithmRegistry';

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

        const sidebarProvider = new SidebarProvider(context.extensionUri, context);
        
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                "asymptote-sidebar",
                sidebarProvider
            )
        );

        let disposableRefresh = vscode.commands.registerCommand('asymptote.refreshComplexity', () => {
            codelensProvider.refresh();
        });

        let disposableOpen = vscode.commands.registerCommand('asymptote.openRunner', () => {
            vscode.commands.executeCommand('asymptote-sidebar.focus');
        });

        context.subscriptions.push(disposableRefresh);
        context.subscriptions.push(disposableOpen);

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

                const signature = this.getStructureSignature(funcBodyNode);
                const identifiedAlgo = AlgorithmRegistry.match(signature);

                let title = "";
                let displaySignature = signature.length > 100 ? signature.substring(0, 100) + "..." : signature;
                let tooltip = `Signature: ${displaySignature}`;

                if (identifiedAlgo) {
                    title = `⚡ ${identifiedAlgo.name}: ${identifiedAlgo.complexity}`;
                    tooltip += `\nIdentified as: ${identifiedAlgo.name}`;
                } else {
                    const depth = this.calculateLoopDepth(funcBodyNode);
                    let complexityText = "O(1)";
                    if (depth > 0) {
                        if (depth === 1) complexityText = "O(N)";
                        else complexityText = `O(N^${depth})`;
                    }
                    title = `Complexity: ${complexityText}`;
                }

                const command: vscode.Command = {
                    title: title,
                    command: "asymptote.refreshComplexity",
                    tooltip: tooltip
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

    private getStructureSignature(node: any): string {
        let signature = "";
        
        const traverse = (currentNode: any) => {
            if (currentNode.type === 'identifier' || currentNode.type === 'number_literal') {
                signature += '#';
            } else {
                signature += currentNode.type + '|';
            }

            if (currentNode.children) {
                for (const child of currentNode.children) {
                    traverse(child);
                }
            }
        };

        traverse(node);
        return signature;
    }

    public refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }
}