/// <reference types="mocha" />
import * as assert from 'assert';
import * as path from 'path';
const Parser = require('web-tree-sitter');
import { analyzeBlock } from '../src/analyzer/ASTAnalyzer';
import { Complexity } from '../src/analyzer/Complexity';

describe('Asymptote AST TEST', () => {
    let cppParser: any;
    let pythonParser: any;
    let javaParser: any;

    before(async () => {
        await Parser.init();
        const parsersPath = path.join(__dirname, '../parsers');
        
        const cppLang = await Parser.Language.load(path.join(parsersPath, 'tree-sitter-cpp.wasm'));
        cppParser = new Parser();
        cppParser.setLanguage(cppLang);

        const pythonLang = await Parser.Language.load(path.join(parsersPath, 'tree-sitter-python.wasm'));
        pythonParser = new Parser();
        pythonParser.setLanguage(pythonLang);

        const javaLang = await Parser.Language.load(path.join(parsersPath, 'tree-sitter-java.wasm'));
        javaParser = new Parser();
        javaParser.setLanguage(javaLang);
    });

    it('C++ Recognize loop as O(N)', () => {
        const code = `
        void test() {
            for(int i = 0; i < n; i++) {
                sum += i;
            }
        }
        `;
        const tree = cppParser.parse(code);
        const funcBodyNode = tree.rootNode.descendantsOfType('compound_statement')[0];
        
        const result = analyzeBlock(funcBodyNode, 'test');
        
        assert.strictEqual(result.complexity.toString(), 'O( N )');
    });

    it('C++ Recognize nested loops as O(N²)', () => {
        const code = `
        void test() {
            for(int i = 0; i < n; i++) {
                for(int j = 0; j < n; j++) {
                    count++;
                }
            }
        }
        `;
        const tree = cppParser.parse(code);
        const funcBodyNode = tree.rootNode.descendantsOfType('compound_statement')[0];
        
        const result = analyzeBlock(funcBodyNode, 'test');
        
        assert.strictEqual(result.complexity.toString(), 'O( N² )');
    });

    it('Python Recognize loop as O(N)', () => {
        const code = `
def test():
    for i in range(n):
        sum += i
        `;
        const tree = pythonParser.parse(code);
        // Python's function block is typically of type 'block'
        const funcBodyNode = tree.rootNode.descendantsOfType('block')[0];
        
        const result = analyzeBlock(funcBodyNode, 'test');
        
        assert.strictEqual(result.complexity.toString(), 'O( N )');
    });

    it('Java Recognize nested loops as O(N²)', () => {
        const code = `
        void test() {
            for(int i = 0; i < n; i++) {
                for(int j = 0; j < n; j++) {
                    count++;
                }
            }
        }
        `;
        const tree = javaParser.parse(code);
        // Java's method body is typically of type 'block'
        const funcBodyNode = tree.rootNode.descendantsOfType('block')[0];
        
        const result = analyzeBlock(funcBodyNode, 'test');
        
        assert.strictEqual(result.complexity.toString(), 'O( N² )');
    });
});