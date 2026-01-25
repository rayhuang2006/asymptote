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
                const prettyComplexity = this.formatComplexity(result.complexity);
                
                let title = `Complexity: ${prettyComplexity}`;
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

    private formatComplexity(complexity: string): string {
        let formatted = complexity.replace(/\^(\w+)/g, (match, p1) => {
            const superscripts: { [key: string]: string } = {
                '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
                '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
                'N': 'ᴺ', 'n': 'ⁿ'
            };
            return p1.split('').map((char: string) => superscripts[char] || char).join('');
        });
        
        return formatted.replace(/O\(([^)]+)\)/, "O( $1 )");
    }

    private analyzeBlock(node: any, funcName: string): { complexity: string, reason: string } {
        const recComplexity = this.analyzeRecursion(node, funcName);
        if (recComplexity) {
            return { complexity: `Recursive ( ${recComplexity} )`, reason: `Recursive calls detected ( ${recComplexity} )` };
        }

        let maxComplexity = "O(1)";
        let reason = "Constant time operations";

        const signature = this.getStructureSignature(node);
        const algo = AlgorithmRegistry.match(signature);
        let baseComplexity = "O(1)";
        let algoName = "";

        if (algo) {
            baseComplexity = algo.complexity;
            algoName = algo.name;
            maxComplexity = baseComplexity;
            reason = `Pattern: ${algoName}`;
        }

        const isBinarySearchPattern = algo && algo.complexity.includes('log N');

        const children = node.children || [];
        for (const child of children) {
            let currentComplexity = "O(1)";
            let currentReason = "";

            if (child.type === 'expression_statement') {
                const callComplexity = this.getFunctionCallComplexity(child);
                currentComplexity = callComplexity;
                currentReason = `Call: ${child.text.trim().split('(')[0]}`;
            }
            else if (this.isLoop(child)) {
                const bodyNode = child.childForFieldName('body');
                const bodyResult = this.analyzeBlock(bodyNode, funcName);
                
                let loopCost = this.getLoopComplexity(child);
                
                if (isBinarySearchPattern && child.type === 'while_statement') {
                    loopCost = "O(log N)";
                }

                currentComplexity = this.multiplyComplexity(loopCost, bodyResult.complexity);
                currentReason = `Loop (${loopCost}) wrapping: ${bodyResult.complexity}`;
            } 
            else if (child.type === 'compound_statement' || child.type === 'if_statement') {
                 const nested = this.analyzeBlock(child, funcName);
                 currentComplexity = nested.complexity;
                 currentReason = nested.reason;
            }

            if (this.compareComplexity(currentComplexity, maxComplexity) > 0) {
                maxComplexity = currentComplexity;
                reason = currentReason;
                
                if (algo && maxComplexity.includes(baseComplexity.replace('O(', '').replace(')', ''))) {
                     reason = `${algoName} combined with inner logic`;
                }
            }
        }
        
        return { complexity: maxComplexity, reason };
    }

    private isLoop(node: any): boolean {
        return node.type === 'for_statement' || node.type === 'while_statement' || node.type === 'do_statement';
    }

    private getFunctionCallComplexity(node: any): string {
        const text = node.text;
        if (text.includes('sort(') || text.includes('stable_sort(')) {
            return "O(N log N)";
        }
        if (text.includes('lower_bound(') || text.includes('upper_bound(') || text.includes('binary_search(')) {
            return "O(log N)";
        }
        return "O(1)";
    }

    private getLoopComplexity(node: any): string {
        if (node.type === 'for_statement') {
            const update = node.childForFieldName('update');
            if (update) {
                if (update.type === 'assignment_expression') {
                    if (update.text.includes('*=') || update.text.includes('/=') || update.text.includes('>>=') || update.text.includes('<<=')) {
                        return "O(log N)";
                    }
                }
            }
        }
        return "O(N)";
    }

    private multiplyComplexity(outer: string, inner: string): string {
        if (inner === "O(1)") return outer;
        if (outer === "O(1)") return inner;
        
        const cleanOuter = outer.replace(/O\(|\)/g, '');
        const cleanInner = inner.replace(/O\(|\)/g, '');

        if (cleanOuter === 'log N' && cleanInner === 'N') return "O(N log N)";
        if (cleanOuter === 'N' && cleanInner === 'log N') return "O(N log N)";
        if (cleanOuter === 'N log N' || cleanInner === 'N log N') {
             return "O(N^2 log N)"; 
        }

        if (cleanInner.startsWith('N^')) {
             const power = parseInt(cleanInner.split('^')[1]) || 1;
             return `O(N^${power + 1})`;
        }
        if (cleanInner === 'N') {
            if (cleanOuter === 'N') return `O(N^2)`;
        }

        return `O(${cleanOuter} ${cleanInner})`;
    }

    private compareComplexity(a: string, b: string): number {
        const score = (c: string) => {
            if (c.includes('N^2 log N')) return 50;
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