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

        vscode.languages.registerCodeLensProvider(['cpp', 'c'], codelensProvider);

        const sidebarProvider = new SidebarProvider(context.extensionUri, context);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider("asymptote-sidebar", sidebarProvider)
        );

        context.subscriptions.push(vscode.commands.registerCommand('asymptote.refreshComplexity', () => {
            codelensProvider.refresh();
        }));
        
        context.subscriptions.push(vscode.commands.registerCommand('asymptote.openRunner', () => {
            vscode.commands.executeCommand('asymptote-sidebar.focus');
        }));

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

                const result = this.analyzeBlock(funcBodyNode, funcNameNode.text);
                
                let title = `Complexity: ${result.complexity}`;
                let tooltip = `Analysis Breakdown:\n${result.reason}`;

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

    private analyzeBlock(node: any, funcName: string): { complexity: string, reason: string } {
        const signature = this.getStructureSignature(node);
        const algo = AlgorithmRegistry.match(signature);
        if (algo) {
            return { complexity: algo.complexity, reason: `Matches pattern: ${algo.name}` };
        }

        const recComplexity = this.analyzeRecursion(node, funcName);
        if (recComplexity) {
            return { complexity: `Recursive (${recComplexity})`, reason: `Recursive calls detected (${recComplexity})` };
        }

        let maxComplexity = "O(1)";
        let reason = "Constant time operations";
        let loopMultiplier = 0;
        let innerComplexity = "O(1)";

        const children = node.children || [];
        for (const child of children) {
            if (this.isLoop(child)) {
                const bodyNode = child.childForFieldName('body');
                const bodyResult = this.analyzeBlock(bodyNode, funcName);
                
                const combined = this.multiplyComplexity("O(N)", bodyResult.complexity);
                
                if (this.compareComplexity(combined, maxComplexity) > 0) {
                    maxComplexity = combined;
                    reason = `Loop (O(N)) wrapping: ${bodyResult.complexity}`;
                }
            } else if (child.type === 'compound_statement' || child.type === 'if_statement') {
                 const nested = this.analyzeBlock(child, funcName);
                 if (this.compareComplexity(nested.complexity, maxComplexity) > 0) {
                     maxComplexity = nested.complexity;
                     reason = nested.reason;
                 }
            }
        }

        return { complexity: maxComplexity, reason };
    }

    private isLoop(node: any): boolean {
        return node.type === 'for_statement' || node.type === 'while_statement' || node.type === 'do_statement';
    }

    private multiplyComplexity(outer: string, inner: string): string {
        if (inner === "O(1)") return outer;
        if (outer === "O(1)") return inner;
        
        const cleanOuter = outer.replace(/O\(|\)/g, '');
        const cleanInner = inner.replace(/O\(|\)/g, '');

        if (cleanInner.startsWith('N^')) {
             const power = parseInt(cleanInner.split('^')[1]) || 1;
             return `O(N^${power + 1})`;
        }
        if (cleanInner === 'N') return `O(N^2)`;

        return `O(${cleanOuter} ${cleanInner})`;
    }

    private compareComplexity(a: string, b: string): number {
        const score = (c: string) => {
            if (c.includes('2^N')) return 100;
            if (c.includes('N^3')) return 40;
            if (c.includes('N^2')) return 30;
            if (c.includes('N log N')) return 20;
            if (c.includes('N')) return 10;
            if (c.includes('log N')) return 5;
            return 1;
        };
        return score(a) - score(b);
    }

    private analyzeRecursion(node: any, funcName: string): string | null {
        let callCount = 0;
        let hasDivision = false;
        let hasSubtraction = false;

        const traverse = (currentNode: any) => {
            if (currentNode.type === 'call_expression') {
                const functionNode = currentNode.childForFieldName('function');
                if (functionNode && functionNode.text === funcName) {
                    callCount++;
                    const args = currentNode.childForFieldName('arguments');
                    if (args) {
                        if (args.text.includes('/') || args.text.includes('>>')) {
                            hasDivision = true;
                        } else if (args.text.includes('-') || args.text.includes('--')) {
                            hasSubtraction = true;
                        }
                    }
                }
            }
            if (currentNode.children) {
                for (const child of currentNode.children) {
                    traverse(child);
                }
            }
        };
        traverse(node);

        if (callCount === 0) return null;
        if (callCount >= 2) return "O(2^N)";
        if (hasDivision) return "O(log N)";
        if (hasSubtraction) return "O(N)";
        return "O(N)"; 
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