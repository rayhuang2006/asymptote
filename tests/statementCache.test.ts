/// <reference types="mocha" />
import * as assert from 'assert';
import { StatementCache, normalize } from '../src/scraper/StatementCache';
import { ParsedProblem } from '../src/scraper/types';

class FakeMemento {
    private readonly values = new Map<string, unknown>();

    public get<T>(key: string): T | undefined {
        return this.values.get(key) as T | undefined;
    }

    public async update(key: string, value: unknown): Promise<void> {
        if (value === undefined) {
            this.values.delete(key);
        } else {
            this.values.set(key, value);
        }
    }
}

function problem(title: string): ParsedProblem {
    return { title, timeLimit: '1 second', memoryLimit: '256 MB', htmlContent: '<p>x</p>', testCases: [] };
}

describe('Statement cache', () => {
    it('reads back what it was given', async () => {
        const cache = new StatementCache(new FakeMemento() as any);
        await cache.set('https://codeforces.com/problemset/problem/4/A', problem('A. Watermelon'));

        assert.strictEqual(cache.get('https://codeforces.com/problemset/problem/4/A')!.title, 'A. Watermelon');
    });

    it('has nothing for a URL it has not seen', () => {
        assert.strictEqual(new StatementCache(new FakeMemento() as any).get('https://atcoder.jp/x'), undefined);
    });

    it('treats addresses that differ only in dressing as the same problem', () => {
        const canonical = normalize('https://codeforces.com/problemset/problem/4/A');

        assert.strictEqual(normalize('https://www.codeforces.com/problemset/problem/4/A'), canonical);
        assert.strictEqual(normalize('https://CODEFORCES.com/problemset/problem/4/A/'), canonical);
        assert.strictEqual(normalize('  https://codeforces.com/problemset/problem/4/A#note '), canonical);
    });

    it('keeps a query string, which can name the problem', () => {
        assert.notStrictEqual(
            normalize('https://ncuma-oj.math.ncu.edu.tw/api/problem?problem_id=A001'),
            normalize('https://ncuma-oj.math.ncu.edu.tw/api/problem?problem_id=A002')
        );
    });

    it('survives something that is not a URL', () => {
        assert.strictEqual(normalize('  not a url  '), 'not a url');
    });

    it('forgets everything on request', async () => {
        const cache = new StatementCache(new FakeMemento() as any);
        await cache.set('https://atcoder.jp/x', problem('X'));
        await cache.clear();

        assert.strictEqual(cache.get('https://atcoder.jp/x'), undefined);
    });

    it('keeps the newest entries when it fills up', async function () {
        this.timeout(10000);
        const cache = new StatementCache(new FakeMemento() as any);

        for (let index = 0; index < 65; index++) {
            await cache.set(`https://atcoder.jp/p/${index}`, problem(`P${index}`));
        }

        assert.strictEqual(cache.get('https://atcoder.jp/p/64')!.title, 'P64');
        assert.strictEqual(cache.get('https://atcoder.jp/p/0'), undefined);
    });
});
