/// <reference types="mocha" />
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';


interface DiffRow {
    type: 'same' | 'changed' | 'missing' | 'extra';
    expected: string | null;
    actual: string | null;
    expectedLine: number | null;
    actualLine: number | null;
    whitespaceOnly?: boolean;
}

interface DiffResult {
    equal: boolean;
    whitespaceOnly: boolean;
    firstMismatch: number | null;
    rows: DiffRow[];
    truncated: boolean;
}

/**
 * media/diff.js ships to the webview as a plain script, so it is loaded here the same way:
 * evaluated against a stand-in global rather than imported as a module.
 */
function loadDiff(): { compare(expected: string, actual: string): DiffResult; MAX_LINES: number } {
    const source = fs.readFileSync(path.join(__dirname, '../media/diff.js'), 'utf8');
    const scope: any = {};
    new Function('globalThis', source)(scope);
    return scope.AsymptoteDiff;
}

describe('Output diff', () => {
    const diff = loadDiff();

    it('reports identical output as equal', () => {
        const result = diff.compare('1\n2\n3', '1\n2\n3');

        assert.strictEqual(result.equal, true);
        assert.strictEqual(result.firstMismatch, null);
        assert.deepStrictEqual(result.rows.map(row => row.type), ['same', 'same', 'same']);
    });

    it('ignores a trailing newline, the way the non-strict comparison does', () => {
        assert.strictEqual(diff.compare('YES\n', 'YES').equal, true);
    });

    it('pairs a replaced line into a single changed row', () => {
        const result = diff.compare('1\n2\n3', '1\n9\n3');

        assert.strictEqual(result.firstMismatch, 2);
        assert.deepStrictEqual(result.rows.map(row => row.type), ['same', 'changed', 'same']);
        assert.strictEqual(result.rows[1].expected, '2');
        assert.strictEqual(result.rows[1].actual, '9');
    });

    it('flags a line that differs only by invisible whitespace', () => {
        const result = diff.compare('1 2', '1 2  ');

        assert.strictEqual(result.equal, false);
        assert.strictEqual(result.whitespaceOnly, true);
        assert.strictEqual(result.rows[0].whitespaceOnly, true);
    });

    it('does not call a genuine difference a whitespace difference', () => {
        assert.strictEqual(diff.compare('1 2', '1 3').whitespaceOnly, false);
    });

    it('marks output that stops early as missing lines', () => {
        const result = diff.compare('1\n2\n3', '1');

        assert.deepStrictEqual(result.rows.map(row => row.type), ['same', 'missing', 'missing']);
        assert.strictEqual(result.firstMismatch, 2);
    });

    it('marks surplus output as extra lines', () => {
        const result = diff.compare('1', '1\n2');

        assert.deepStrictEqual(result.rows.map(row => row.type), ['same', 'extra']);
        assert.strictEqual(result.rows[1].actual, '2');
    });

    it('numbers each side independently so line numbers stay meaningful', () => {
        const result = diff.compare('a\nb\nc', 'a\nc');

        assert.deepStrictEqual(
            result.rows.map(row => [row.expectedLine, row.actualLine]),
            [[1, 1], [2, null], [3, 2]]
        );
    });

    it('handles empty output on either side', () => {
        assert.deepStrictEqual(diff.compare('', '').rows, []);
        assert.deepStrictEqual(diff.compare('1', '').rows.map(row => row.type), ['missing']);
        assert.deepStrictEqual(diff.compare('', '1').rows.map(row => row.type), ['extra']);
    });

    it('gives up on very large output instead of building a huge table', () => {
        const big = Array.from({ length: diff.MAX_LINES + 1 }, (_, index) => String(index)).join('\n');
        const result = diff.compare(big, big);

        assert.strictEqual(result.truncated, true);
        assert.strictEqual(result.equal, true);
        assert.deepStrictEqual(result.rows, []);
    });
});
