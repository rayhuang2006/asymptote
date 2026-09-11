/// <reference types="mocha" />
import * as assert from 'assert';
import { DEFAULT_TIME_LIMIT_MS, parseTimeLimit, resolveTimeLimit } from '../src/runner/timeLimit';

describe('Time limit', () => {
    it('reads the way Codeforces writes it', () => {
        assert.strictEqual(parseTimeLimit('1 second'), 1000);
        assert.strictEqual(parseTimeLimit('2 seconds'), 2000);
        assert.strictEqual(parseTimeLimit('3 seconds'), 3000);
    });

    it('reads the way AtCoder writes it', () => {
        assert.strictEqual(parseTimeLimit('2 sec'), 2000);
        assert.strictEqual(parseTimeLimit('10 sec'), 10000);
    });

    it('reads milliseconds and fractions', () => {
        assert.strictEqual(parseTimeLimit('500 ms'), 500);
        assert.strictEqual(parseTimeLimit('1500 milliseconds'), 1500);
        assert.strictEqual(parseTimeLimit('1.5 seconds'), 1500);
        assert.strictEqual(parseTimeLimit('2,5 s'), 2500);
    });

    it('gives up rather than guessing', () => {
        assert.strictEqual(parseTimeLimit(''), undefined);
        assert.strictEqual(parseTimeLimit(undefined), undefined);
        assert.strictEqual(parseTimeLimit('Unknown'), undefined);
        assert.strictEqual(parseTimeLimit('2 fortnights'), undefined);
        assert.strictEqual(parseTimeLimit('0 seconds'), undefined);
    });

    it('falls back only when there is nothing to read', () => {
        assert.strictEqual(resolveTimeLimit('3 seconds'), 3000);
        assert.strictEqual(resolveTimeLimit('Unknown'), DEFAULT_TIME_LIMIT_MS);
        assert.strictEqual(resolveTimeLimit(undefined), DEFAULT_TIME_LIMIT_MS);
    });
});
