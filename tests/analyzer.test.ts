/// <reference types="mocha" />
import * as assert from 'assert';
import * as path from 'path';
const Parser = require('web-tree-sitter');
import { analyzeBlock } from '../src/analyzer/ASTAnalyzer';
import { Complexity } from '../src/analyzer/Complexity';

describe('Asymptote AST TEST', () => {
    let parser: any;
    let Lang: any;

    before(async () => {
        await Parser.init();
        parser = new Parser();
        const wasmPath = path.join(__dirname, '../parsers/tree-sitter-cpp.wasm');
        Lang = await Parser.Language.load(wasmPath);
        parser.setLanguage(Lang);
    });

    it('Recognize loop as O(N)', () => {
        const code = `
        void test() {
            for(int i = 0; i < n; i++) {
                sum += i;
            }
        }
        `;
        const tree = parser.parse(code);
        const funcBodyNode = tree.rootNode.descendantsOfType('compound_statement')[0];
        
        const result = analyzeBlock(funcBodyNode, 'test');
        
        assert.strictEqual(result.complexity.toString(), 'O( N )');
    });

    it('Recognize nested loops as O(N²)', () => {
        const code = `
        void test() {
            for(int i = 0; i < n; i++) {
                for(int j = 0; j < n; j++) {
                    count++;
                }
            }
        }
        `;
        const tree = parser.parse(code);
        const funcBodyNode = tree.rootNode.descendantsOfType('compound_statement')[0];
        
        const result = analyzeBlock(funcBodyNode, 'test');
        
        assert.strictEqual(result.complexity.toString(), 'O( N² )');
    });
});