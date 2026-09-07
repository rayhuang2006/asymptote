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
        assert.strictEqual(new Complexity(0, 2).toString(), 'O( (log N)² )');
        assert.strictEqual(new Complexity(0, 0, true).toString(), 'O( 2ᴺ )');
    });

    it('multiplies nested work and preserves uncertainty', () => {
        const loop = new Complexity(1);
        const estimatedLogWork = new Complexity(0, 1, false, true);
        const result = loop.multiply(estimatedLogWork);

        assert.strictEqual(result.toString(), 'O( N log N ) (?)');
        assert.strictEqual(result.isEstimate, true);
    });

    it('preserves independent symbols when multiplying work', () => {
        const result = Complexity.variable('n').multiply(Complexity.variable('m'));

        assert.strictEqual(result.toString(), 'O( N M )');
    });

    it('preserves independent symbols when adding sequential work', () => {
        const result = Complexity.variable('n').add(Complexity.variable('m'));

        assert.strictEqual(result.toString(), 'O( N + M )');
    });

    it('removes dominated terms from sequential work', () => {
        const linear = Complexity.variable('n');
        const sorting = Complexity.variable('n').multiply(Complexity.logarithmic('n'));

        assert.strictEqual(linear.add(sorting).toString(), 'O( N log N )');
    });

    it('distributes multiplication across independent sequential terms', () => {
        const sum = Complexity.variable('n').add(Complexity.variable('m'));

        assert.strictEqual(Complexity.variable('k').multiply(sum).toString(), 'O( N K + K M )');
    });

    it('takes roots of symbolic products', () => {
        const product = Complexity.variable('n').multiply(Complexity.variable('m'));

        assert.strictEqual(product.root(2).toString(), 'O( √N √M )');
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

    it('treats a fixed-bound loop as constant time', () => {
        const result = analyze(`
            void test() {
                for (int i = 0; i < 100; i++) {
                    answer++;
                }
            }
        `, 'cpp');

        assert.strictEqual(result.complexity.toString(), 'O( 1 )');
    });

    it('preserves independent bounds in nested loops', () => {
        const result = analyze(`
            void test() {
                for (int i = 0; i < n; i++) {
                    for (int j = 0; j < m; j++) {
                        if (values[j] > 0) {
                            answer++;
                        }
                    }
                }
            }
        `, 'cpp');

        assert.strictEqual(result.complexity.toString(), 'O( N M )');
    });

    it('adds independent bounds for sequential loops', () => {
        const result = analyze(`
            void test() {
                for (int i = 0; i < n; i++) {
                    first[i]++;
                }
                for (int j = 0; j < m; j++) {
                    second[j]++;
                }
            }
        `, 'cpp');

        assert.strictEqual(result.complexity.toString(), 'O( N + M )');
    });

    it('does not mark container construction as an unknown function call', () => {
        const result = analyze(`
            int test() {
                int n, m;
                vector<int> first(n), second(m);
                for (int i = 0; i < n; i++) cin >> first[i];
                for (int j = 0; j < m; j++) cin >> second[j];
                return 0;
            }
        `, 'cpp');

        assert.strictEqual(result.complexity.toString(), 'O( N + M )');
        assert.strictEqual(result.complexity.isEstimate, false);
    });

    it('simplifies repeated sequential work over the same bound', () => {
        const result = analyze(`
            void test() {
                for (int i = 0; i < n; i++) first[i]++;
                for (int j = 0; j < n; j++) second[j]++;
            }
        `, 'cpp');

        assert.strictEqual(result.complexity.toString(), 'O( N )');
    });

    it('analyzes nested loops without compound-statement bodies', () => {
        const result = analyze(`
            void test() {
                for (int i = 0; i < n; i++)
                    for (int j = 0; j < m; j++)
                        answer++;
            }
        `, 'cpp');

        assert.strictEqual(result.complexity.toString(), 'O( N M )');
    });

    it('recognizes square-root loop conditions', () => {
        const result = analyze(`
            void test() {
                for (int i = 1; i * i <= n; i++) {
                    answer++;
                }
            }
        `, 'cpp');

        assert.strictEqual(result.complexity.toString(), 'O( √N )');
    });

    it('extracts a symbol from an arithmetic loop bound', () => {
        const result = analyze(`
            void test() {
                for (int i = 0; i < n - 1; i++) {
                    answer++;
                }
            }
        `, 'cpp');

        assert.strictEqual(result.complexity.toString(), 'O( N )');
    });

    it('preserves products used as loop bounds', () => {
        const result = analyze(`
            void test() {
                for (int i = 0; i < n * m; i++) {
                    answer++;
                }
            }
        `, 'cpp');

        assert.strictEqual(result.complexity.toString(), 'O( N M )');
    });

    it('preserves sums used as loop bounds', () => {
        const result = analyze(`
            void test() {
                for (int i = 0; i < n + m; i++) {
                    answer++;
                }
            }
        `, 'cpp');

        assert.strictEqual(result.complexity.toString(), 'O( N + M )');
    });

    it('uses a container name for size-based loop bounds', () => {
        const result = analyze(`
            void test() {
                for (int i = 0; i < values.size(); i++) {
                    answer += values[i];
                }
            }
        `, 'cpp');

        assert.strictEqual(result.complexity.toString(), 'O( VALUES )');
    });

    it('uses the symbolic bound for logarithmic loops', () => {
        const result = analyze(`
            void test() {
                for (int i = 1; i < m; i *= 2) {
                    answer++;
                }
            }
        `, 'cpp');

        assert.strictEqual(result.complexity.toString(), 'O( log M )');
    });

    it('uses the initializer as the bound for descending loops', () => {
        const result = analyze(`
            void test() {
                for (int i = n; i > 0; i -= 2) {
                    answer++;
                }
            }
        `, 'cpp');

        assert.strictEqual(result.complexity.toString(), 'O( N )');
    });

    it('supports loop variables declared before the for-loop', () => {
        const result = analyze(`
            void test() {
                int i;
                for (i = 0; i < m; i++) {
                    answer++;
                }
            }
        `, 'cpp');

        assert.strictEqual(result.complexity.toString(), 'O( M )');
    });

    it('uses the collection name for C++ range-based loops', () => {
        const result = analyze(`
            void test() {
                for (const auto& value : values) {
                    answer += value;
                }
            }
        `, 'cpp');

        assert.strictEqual(result.complexity.toString(), 'O( VALUES )');
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

    it('recognizes binary-search loop structure without a global fingerprint', () => {
        const result = analyze(`
            void test() {
                int left = 0;
                int right = n - 1;
                while (left <= right) {
                    int middle = left + (right - left) / 2;
                    if (values[middle] < target) {
                        left = middle + 1;
                    } else {
                        right = middle - 1;
                    }
                }
            }
        `, 'cpp');

        assert.strictEqual(result.complexity.toString(), 'O( log N )');
    });

    it('does not mistake unrelated division inside a while-loop for binary search', () => {
        const result = analyze(`
            void test() {
                int i = 0;
                while (i < n) {
                    int half = value / 2;
                    if (half > 0) answer++;
                    i += 1;
                }
            }
        `, 'cpp');

        assert.strictEqual(result.complexity.toString(), 'O( N )');
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

    it('preserves the bound used by Python range', () => {
        const result = analyze(`
def test(m):
    for i in range(m):
        answer += i
        `, 'python');

        assert.strictEqual(result.complexity.toString(), 'O( M )');
    });

    it('treats a constant Python range as constant work', () => {
        const result = analyze(`
def test():
    for i in range(100):
        answer += i
        `, 'python');

        assert.strictEqual(result.complexity.toString(), 'O( 1 )');
    });

    it('recognizes Java enhanced for-loops as linear', () => {
        const result = analyze(`
            void test(int[] values) {
                for (int value : values) {
                    answer += value;
                }
            }
        `, 'java');

        assert.strictEqual(result.complexity.toString(), 'O( VALUES )');
    });

    it('preserves symbolic bounds in classic Java for-loops', () => {
        const result = analyze(`
            void test(int m) {
                for (int i = 0; i < m; i++) {
                    answer++;
                }
            }
        `, 'java');

        assert.strictEqual(result.complexity.toString(), 'O( M )');
    });

    it('treats fixed classic Java for-loops as constant work', () => {
        const result = analyze(`
            void test() {
                for (int i = 0; i < 100; i++) {
                    answer++;
                }
            }
        `, 'java');

        assert.strictEqual(result.complexity.toString(), 'O( 1 )');
    });
});

describe('Post-v0.5 analyzer roadmap', () => {
    // These specifications belong to the call-graph and recurrence milestones,
    // not the v0.5 correctness foundation.

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
