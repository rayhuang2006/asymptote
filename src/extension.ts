import * as vscode from 'vscode';
import * as path from 'path';
import { SidebarProvider } from './SidebarProvider';
import { AlgorithmRegistry } from './analyzer/AlgorithmRegistry';
import { Complexity } from './analyzer/Complexity';
import { analyzeBlock } from './analyzer/ASTAnalyzer';

const Parser = require('web-tree-sitter');

const MAX_LINE_COUNT = 5000;

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

        context.subscriptions.push(vscode.commands.registerCommand('asymptote.toggleCodeLens', async () => {
            const config = vscode.workspace.getConfiguration('asymptote');
            const currentValue = config.get<boolean>('enableCodeLens');
            await config.update('enableCodeLens', !currentValue, vscode.ConfigurationTarget.Global);
        }));

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

        if (document.lineCount > MAX_LINE_COUNT) {
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

                const result = analyzeBlock(funcBodyNode, funcNameNode.text);
                
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

    public refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }
}