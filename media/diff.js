/**
 * Line diff for comparing a run's output against the expected answer.
 *
 * Kept free of DOM access so it can be unit tested directly; the webview and the
 * test suite both load this file and read AsymptoteDiff off the global object.
 */
(function (global) {
    'use strict';

    var MAX_LINES = 400;

    function splitLines(text) {
        if (text === undefined || text === null || text === '') {
            return [];
        }
        return String(text).replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
    }

    /** Trailing spaces and tabs are invisible in the panel, so they are called out separately. */
    function differsOnlyByWhitespace(expected, actual) {
        return expected !== actual && expected.trim() === actual.trim();
    }

    function longestCommonSubsequence(left, right) {
        var lengths = [];
        var i;
        var j;

        for (i = 0; i <= left.length; i++) {
            lengths.push(new Array(right.length + 1).fill(0));
        }

        for (i = left.length - 1; i >= 0; i--) {
            for (j = right.length - 1; j >= 0; j--) {
                lengths[i][j] = left[i] === right[j]
                    ? lengths[i + 1][j + 1] + 1
                    : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
            }
        }

        return lengths;
    }

    function buildRows(expectedLines, actualLines) {
        var lengths = longestCommonSubsequence(expectedLines, actualLines);
        var rows = [];
        var i = 0;
        var j = 0;

        while (i < expectedLines.length && j < actualLines.length) {
            if (expectedLines[i] === actualLines[j]) {
                rows.push({ type: 'same', expected: expectedLines[i], actual: actualLines[j] });
                i++;
                j++;
            } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
                rows.push({ type: 'missing', expected: expectedLines[i], actual: null });
                i++;
            } else {
                rows.push({ type: 'extra', expected: null, actual: actualLines[j] });
                j++;
            }
        }

        while (i < expectedLines.length) {
            rows.push({ type: 'missing', expected: expectedLines[i], actual: null });
            i++;
        }

        while (j < actualLines.length) {
            rows.push({ type: 'extra', expected: null, actual: actualLines[j] });
            j++;
        }

        return rows;
    }

    /** A deletion immediately followed by an insertion reads better as one changed line. */
    function pairChangedRows(rows) {
        var paired = [];
        var index = 0;

        while (index < rows.length) {
            var row = rows[index];
            var next = rows[index + 1];

            if (row.type === 'missing' && next && next.type === 'extra') {
                paired.push({
                    type: 'changed',
                    expected: row.expected,
                    actual: next.actual,
                    whitespaceOnly: differsOnlyByWhitespace(row.expected, next.actual)
                });
                index += 2;
                continue;
            }

            paired.push(row);
            index++;
        }

        return paired;
    }

    function numberRows(rows) {
        var expectedLine = 0;
        var actualLine = 0;

        return rows.map(function (row) {
            if (row.expected !== null && row.expected !== undefined) {
                expectedLine++;
            }
            if (row.actual !== null && row.actual !== undefined) {
                actualLine++;
            }
            return Object.assign({}, row, {
                expectedLine: row.expected === null || row.expected === undefined ? null : expectedLine,
                actualLine: row.actual === null || row.actual === undefined ? null : actualLine
            });
        });
    }

    /**
     * Compares expected and actual output.
     * Returns { equal, whitespaceOnly, firstMismatch, rows, truncated }, where
     * firstMismatch is the 1-based row number of the first difference, or null.
     */
    function compare(expected, actual) {
        var expectedLines = splitLines(expected);
        var actualLines = splitLines(actual);

        if (expectedLines.length > MAX_LINES || actualLines.length > MAX_LINES) {
            return {
                equal: String(expected) === String(actual),
                whitespaceOnly: false,
                firstMismatch: null,
                rows: [],
                truncated: true
            };
        }

        var rows = numberRows(pairChangedRows(buildRows(expectedLines, actualLines)));
        var firstMismatch = null;

        for (var index = 0; index < rows.length; index++) {
            if (rows[index].type !== 'same') {
                firstMismatch = index + 1;
                break;
            }
        }

        return {
            equal: firstMismatch === null,
            whitespaceOnly: firstMismatch !== null && rows.every(function (row) {
                return row.type === 'same' || (row.type === 'changed' && row.whitespaceOnly);
            }),
            firstMismatch: firstMismatch,
            rows: rows,
            truncated: false
        };
    }

    global.AsymptoteDiff = { compare: compare, MAX_LINES: MAX_LINES };
}(typeof globalThis === 'undefined' ? this : globalThis));
