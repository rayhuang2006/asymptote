/// <reference types="mocha" />
import * as assert from 'assert';
import * as path from 'path';
const Parser = require('web-tree-sitter');
import { analyzeBlock } from '../src/analyzer/ASTAnalyzer';
import { Complexity } from '../src/analyzer/Complexity';

type SupportedLanguage = 'cpp' | 'python' | 'java';

describe('Complexity model baseline', () => {
    it('formats the complexity forms currently exposed in CodeLens', () => {
        assert.strictEqual(new Complexity().toString(), 'O( 1 )');
        assert.strictEqual(new Complexity(1).toString(), 'O( N )');
        assert.strictEqual(new Complexity(2).toString(), 'O( N² )');
        assert.strictEqual(new Complexity(1, 1).toString(), 'O( N log N )');
        assert.strictEqual(new Complexity(0, 0, true).toString(), 'O( 2ᴺ )');
    });

    it('multiplies nested work and preserves uncertainty', () => {
        const loop = new Complexity(1);
        const estimatedLogWork = new Complexity(0, 1, false, true);
        const result = loop.multiply(estimatedLogWork);

        assert.strictEqual(result.toString(), 'O( N log N ) (?)');
        assert.strictEqual(result.isEstimate, true);
    });

    it('orders the supported asymptotic forms', () => {
        assert.ok(new Complexity(0, 1).compare(new Complexity()) > 0);
        assert.ok(new Complexity(1).compare(new Complexity(0, 4)) > 0);
        assert.ok(new Complexity(0, 0, true).compare(new Complexity(10)) > 0);
    });
});

describe('AST analyzer regression baseline', () => {
    const parsers = new Map<SupportedLanguage, any>();

    before(async () => {
        await Parser.init();
        const parsersPath = path.join(__dirname, '../parsers');

        for (const language of ['cpp', 'python', 'java'] as SupportedLanguage[]) {
            const grammarName = language === 'cpp' ? 'cpp' : language;
            const grammar = await Parser.Language.load(
                path.join(parsersPath, `tree-sitter-${grammarName}.wasm`)
            );
            const parser = new Parser();
            parser.setLanguage(grammar);
            parsers.set(language, parser);
        }
    });

    function analyze(code: string, language: SupportedLanguage, functionName = 'test') {
        const parser = parsers.get(language);
        assert.ok(parser, `Parser for ${language} was not initialized`);

        const tree = parser.parse(code);
        const bodyType = language === 'cpp' ? 'compound_statement' : 'block';
        const body = tree.rootNode.descendantsOfType(bodyType)[0];
        assert.ok(body, `No function body found in ${language} fixture`);

        return analyzeBlock(body, functionName);
    }

    it('recognizes constant work', () => {
        const result = analyze('void test() { int answer = 42; }', 'cpp');

        assert.strictEqual(result.complexity.toString(), 'O( 1 )');
    });

    it('recognizes a multiplicative for-loop as logarithmic', () => {
        const result = analyze(`
            void test() {
                for (int i = 1; i < n; i *= 2) {
                    answer++;
                }
            }
        `, 'cpp');

        assert.strictEqual(result.complexity.toString(), 'O( log N )');
    });

    it('recognizes a shrinking while-loop as logarithmic', () => {
        const result = analyze(`
            void test() {
                while (n > 1) {
                    n /= 2;
                }
            }
        `, 'cpp');

        assert.strictEqual(result.complexity.toString(), 'O( log N )');
    });

    it('recognizes standard sorting work', () => {
        const result = analyze(`
            void test() {
                sort(values.begin(), values.end());
            }
        `, 'cpp');

        assert.strictEqual(result.complexity.toString(), 'O( N log N )');
    });

    it('marks unknown function calls as estimates', () => {
        const result = analyze(`
            void test() {
                custom_operation(values);
            }
        `, 'cpp');

        assert.strictEqual(result.complexity.toString(), 'O( 1 ) (?)');
        assert.strictEqual(result.complexity.isEstimate, true);
    });

    it('recognizes linear recursion', () => {
        const result = analyze(`
            void test(int n) {
                if (n == 0) return;
                test(n - 1);
            }
        `, 'cpp');

        assert.strictEqual(result.complexity.toString(), 'O( N )');
    });

    it('recognizes divide-by-two recursion', () => {
        const result = analyze(`
            void test(int n) {
                if (n <= 1) return;
                test(n / 2);
            }
        `, 'cpp');

        assert.strictEqual(result.complexity.toString(), 'O( log N )');
    });

    it('recognizes Python sorted as sorting work', () => {
        const result = analyze(`
def test(values):
    values = sorted(values)
        `, 'python');

        assert.strictEqual(result.complexity.toString(), 'O( N log N )');
    });

    it('recognizes Java enhanced for-loops as linear', () => {
        const result = analyze(`
            void test(int[] values) {
                for (int value : values) {
                    answer += value;
                }
            }
        `, 'java');

        assert.strictEqual(result.complexity.toString(), 'O( N )');
    });
});

describe('Target analyzer behavior', () => {
    // These executable specifications intentionally remain pending until the
    // complexity expression and analyzer can represent their expected results.

    it.skip('distinguishes independent N and M loop bounds', () => {
        // for (i < n) for (j < m) should be O(NM), not O(N²).
    });

    it.skip('treats a fixed-bound loop as constant time', () => {
        // for (i = 0; i < 100; i++) should be O(1), not O(N).
    });

    it.skip('represents square-root loop bounds', () => {
        // for (i = 1; i * i <= n; i++) should be O(sqrt(N)).
    });

    it.skip('propagates complexity through user-defined function calls', () => {
        // A caller of a locally defined O(N) helper should include that O(N) work.
    });

    it.skip('solves divide-and-conquer recurrences such as merge sort', () => {
        // T(N) = 2T(N/2) + O(N) should be O(N log N), not O(2ᴺ).
    });

    it.skip('does not add recursive calls from mutually exclusive branches', () => {
        // One recursive call in each side of if/else does not imply O(2ᴺ).
    });
});
