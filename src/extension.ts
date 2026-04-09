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
        const parsersPath = path.join(context.extensionPath, 'parsers');
        
        const cppLang = await Parser.Language.load(path.join(parsersPath, 'tree-sitter-cpp.wasm'));
        const pythonLang = await Parser.Language.load(path.join(parsersPath, 'tree-sitter-python.wasm'));
        const javaLang = await Parser.Language.load(path.join(parsersPath, 'tree-sitter-java.wasm'));

        const cppParser = new Parser(); cppParser.setLanguage(cppLang);
        const pythonParser = new Parser(); pythonParser.setLanguage(pythonLang);
        const javaParser = new Parser(); javaParser.setLanguage(javaLang);

        const cppProvider = new AsymptoteCodeLensProvider(cppParser, cppLang, 'cpp');
        const pythonProvider = new AsymptoteCodeLensProvider(pythonParser, pythonLang, 'python');
        const javaProvider = new AsymptoteCodeLensProvider(javaParser, javaLang, 'java');

        vscode.languages.registerCodeLensProvider(['cpp', 'c'], cppProvider);
        vscode.languages.registerCodeLensProvider(['python'], pythonProvider);
        vscode.languages.registerCodeLensProvider(['java'], javaProvider);

        const providers = [cppProvider, pythonProvider, javaProvider];

        const sidebarProvider = new SidebarProvider(context.extensionUri, context);
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider("asymptote-sidebar", sidebarProvider)
        );

        context.subscriptions.push(vscode.commands.registerCommand('asymptote.refreshComplexity', () => {
            providers.forEach(p => p.refresh());
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
                providers.forEach(p => p.refresh());
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
    private languageId: string;

    constructor(parser: any, lang: any, languageId: string) {
        this.parser = parser;
        this.lang = lang;
        this.languageId = languageId;
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
        
        let queryString = '';
        if (this.languageId === 'python') {
            queryString = `
                (function_definition
                    name: (identifier) @func_name
                    body: (block) @func_body
                )
            `;
        } else if (this.languageId === 'java') {
            queryString = `
                (method_declaration
                    name: (identifier) @func_name
                    body: (block) @func_body
                )
            `;
        } else {
            queryString = `
                (function_definition
                    declarator: (function_declarator
                        declarator: (identifier) @func_name
                    )
                    body: (compound_statement) @func_body
                )
            `;
        }
        const query = this.lang.query(queryString);

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