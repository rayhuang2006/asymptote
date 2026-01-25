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

        // 新增：Toggle 指令
        context.subscriptions.push(vscode.commands.registerCommand('asymptote.toggleCodeLens', async () => {
            const config = vscode.workspace.getConfiguration('asymptote');
            const currentValue = config.get<boolean>('enableCodeLens');
            await config.update('enableCodeLens', !currentValue, vscode.ConfigurationTarget.Global);
        }));

        // 新增：監聽設定變更
        context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('asymptote.enableCodeLens')) {
                codelensProvider.refresh();
            }
        }));

    } catch (error) {
        vscode.window.showErrorMessage('Asymptote failed to start: ' + error);
    }
}

export function deactivate() {}

class Complexity {
    public n: number;
    public log: number;
    public isExp: boolean;
    public isEstimate: boolean; // 新增：是否為估算值

    constructor(n: number = 0, log: number = 0, isExp: boolean = false, isEstimate: boolean = false) {
        this.n = n;
        this.log = log;
        this.isExp = isExp;
        this.isEstimate = isEstimate;
    }

    static fromString(s: string): Complexity {
        if (s.includes('2^N')) return new Complexity(0, 0, true);
        if (s.includes('N^2')) return new Complexity(2, 0);
        if (s.includes('N log N')) return new Complexity(1, 1);
        if (s.includes('log N')) return new Complexity(0, 1);
        if (s.includes('O(N)')) return new Complexity(1, 0);
        if (s.includes('O(1)')) return new Complexity(0, 0);
        if (s.includes('N')) return new Complexity(1, 0);
        return new Complexity(0, 0);
    }

    multiply(other: Complexity): Complexity {
        if (this.isExp || other.isExp) {
            return new Complexity(0, 0, true, this.isEstimate || other.isEstimate);
        }
        return new Complexity(
            this.n + other.n, 
            this.log + other.log, 
            false, 
            this.isEstimate || other.isEstimate
        );
    }

    compare(other: Complexity): number {
        if (this.isExp && !other.isExp) return 1;
        if (!this.isExp && other.isExp) return -1;
        if (this.isExp && other.isExp) return 0;

        if (this.n !== other.n) {
            return this.n - other.n;
        }
        return this.log - other.log;
    }

    toString(): string {
        let baseStr = "";
        if (this.isExp) baseStr = "2ᴺ";
        else if (this.n === 0 && this.log === 0) baseStr = "1";
        else {
            let parts = [];
            if (this.n > 0) {
                if (this.n === 1) parts.push("N");
                else parts.push(`N${this.toSuperscript(this.n)}`);
            }
            if (this.log > 0) {
                if (this.log === 1) parts.push("log N");
                else parts.push(`(log N)${this.toSuperscript(this.log)}`);
            }
            baseStr = parts.join(' ');
        }

        const suffix = this.isEstimate ? " (?)" : "";
        return `O( ${baseStr} )${suffix}`;
    }

    private toSuperscript(num: number): string {
        const superscripts: { [key: string]: string } = {
            '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
            '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹'
        };
        return num.toString().split('').map(char => superscripts[char] || char).join('');
    }
}

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
        const config = vscode.workspace.getConfiguration('asymptote');
        if (!config.get<boolean>('enableCodeLens', true)) {
            return [];
        }

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
                
                let title = `Complexity: ${result.complexity.toString()}`;
                
                let tooltip = `Analysis Breakdown:\n${result.reason}`;
                if (result.complexity.isEstimate) {
                    tooltip += `\n\n⚠️ Warning: Contains unidentified function calls. Actual complexity might be higher.`;
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

    private analyzeBlock(node: any, funcName: string): { complexity: Complexity, reason: string } {
        const recComplexity = this.analyzeRecursion(node, funcName);
        if (recComplexity) {
            const compObj = Complexity.fromString(recComplexity);
            return { complexity: compObj, reason: `Recursive calls detected (${recComplexity})` };
        }

        let maxComplexity = new Complexity(0, 0);
        let reason = "Constant time operations";

        const signature = this.getStructureSignature(node);
        const algo = AlgorithmRegistry.match(signature);
        let baseComplexity = new Complexity(0, 0);
        let algoName = "";

        if (algo) {
            baseComplexity = Complexity.fromString(algo.complexity);
            algoName = algo.name;
            maxComplexity = baseComplexity;
            reason = `Pattern: ${algoName}`;
        }

        const isBinarySearchPattern = algo && baseComplexity.log > 0;

        const children = node.children || [];
        for (const child of children) {
            let currentComplexity = new Complexity(0, 0);
            let currentReason = "";

            if (child.type === 'expression_statement') {
                const callResult = this.getFunctionCallComplexity(child);
                currentComplexity = callResult.complexity;
                currentReason = callResult.reason;
            }
            else if (this.isLoop(child)) {
                const bodyNode = child.childForFieldName('body');
                const bodyResult = this.analyzeBlock(bodyNode, funcName);
                
                let loopCost = this.getLoopComplexity(child);
                
                if (isBinarySearchPattern && child.type === 'while_statement') {
                    loopCost = new Complexity(0, 1);
                }

                currentComplexity = loopCost.multiply(bodyResult.complexity);
                currentReason = `Loop (${loopCost.toString()}) wrapping: ${bodyResult.complexity.toString()}`;
            } 
            else if (child.type === 'compound_statement' || child.type === 'if_statement') {
                 const nested = this.analyzeBlock(child, funcName);
                 currentComplexity = nested.complexity;
                 currentReason = nested.reason;
            }

            if (currentComplexity.compare(maxComplexity) > 0) {
                maxComplexity = currentComplexity;
                reason = currentReason;
                
                if (algo && maxComplexity.compare(baseComplexity) > 0) {
                     reason = `${algoName} combined with inner logic`;
                }
            }
            
            if (currentComplexity.isEstimate) {
                maxComplexity.isEstimate = true;
            }
        }
        
        return { complexity: maxComplexity, reason };
    }

    private isLoop(node: any): boolean {
        return node.type === 'for_statement' || node.type === 'while_statement' || node.type === 'do_statement';
    }

    private getFunctionCallComplexity(node: any): { complexity: Complexity, reason: string } {
        const text = node.text;
        
        if (text.includes('sort(') || text.includes('stable_sort(')) {
            return { complexity: new Complexity(1, 1), reason: `Call: sort (O(N log N))` };
        }
        if (text.includes('lower_bound(') || text.includes('upper_bound(') || text.includes('binary_search(')) {
            return { complexity: new Complexity(0, 1), reason: `Call: binary search (O(log N))` };
        }
        if (text.includes('push_back(') || text.includes('pop_back(') || text.includes('max(') || text.includes('min(')) {
             return { complexity: new Complexity(0, 0), reason: `Call: O(1) op` };
        }

        if (text.match(/[a-zA-Z_]\w*\s*\(/)) {
             return { 
                 complexity: new Complexity(0, 0, false, true),
                 reason: `Call: Unknown function '${text.trim().split('(')[0]}'` 
             };
        }

        return { complexity: new Complexity(0, 0), reason: "Expression" };
    }

    private getLoopComplexity(node: any): Complexity {
        if (node.type === 'for_statement') {
            const update = node.childForFieldName('update');
            if (update) {
                if (update.type === 'assignment_expression') {
                    if (update.text.includes('*=') || update.text.includes('/=') || update.text.includes('>>=') || update.text.includes('<<=')) {
                        return new Complexity(0, 1);
                    }
                }
            }
        } else if (node.type === 'while_statement') {
            const body = node.childForFieldName('body');
            if (body) {
                if (body.text.includes('*=') || body.text.includes('/=') || body.text.includes('>>=') || body.text.includes('<<=')) {
                    return new Complexity(0, 1);
                }
            }
        }
        return new Complexity(1, 0);
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