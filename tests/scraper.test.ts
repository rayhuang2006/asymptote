/// <reference types="mocha" />
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { atcoderAdapter } from '../src/scraper/sites/atcoder';
import { codeforcesAdapter } from '../src/scraper/sites/codeforces';
import { ncuOjAdapter } from '../src/scraper/sites/ncuOj';
import { parseUrl, resolveAdapter } from '../src/scraper/registry';

function fixture(name: string): string {
    return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

describe('Site registry', () => {
    it('routes each supported host to its own adapter', () => {
        assert.strictEqual(resolveAdapter(parseUrl('https://codeforces.com/problemset/problem/4/A')).name, 'Codeforces');
        assert.strictEqual(resolveAdapter(parseUrl('https://atcoder.jp/contests/abc300/tasks/abc300_a')).name, 'AtCoder');
        assert.strictEqual(resolveAdapter(parseUrl('https://ncuma-oj.math.ncu.edu.tw/problem/A001')).name, 'NCU Online Judge');
    });

    it('refuses a host it cannot read instead of guessing', () => {
        assert.throws(
            () => resolveAdapter(parseUrl('https://example.com/problem/1')),
            /example\.com is not supported yet/
        );
    });

    it('rejects something that is not a URL', () => {
        assert.throws(() => parseUrl('problem 4A'), /not a valid URL/);
    });

    it('asks Codeforces for the page and the others for what they serve best', () => {
        assert.strictEqual(codeforcesAdapter.transport, 'browser');
        assert.strictEqual(atcoderAdapter.transport, 'http');
        assert.strictEqual(ncuOjAdapter.transport, 'http');

        assert.strictEqual(
            ncuOjAdapter.resolveRequestUrl(parseUrl('https://ncuma-oj.math.ncu.edu.tw/problem/A001')),
            'https://ncuma-oj.math.ncu.edu.tw/api/problem?problem_id=A001'
        );
        assert.strictEqual(
            atcoderAdapter.resolveRequestUrl(parseUrl('https://atcoder.jp/contests/abc300/tasks/abc300_a')),
            'https://atcoder.jp/contests/abc300/tasks/abc300_a?lang=en'
        );
    });
});

describe('Codeforces adapter', () => {
    const url = parseUrl('https://codeforces.com/problemset/problem/4/A');
    const problem = codeforcesAdapter.parse(fixture('codeforces-4a.html'), url);

    it('reads the heading', () => {
        assert.strictEqual(problem.title, 'A. Watermelon');
        assert.strictEqual(problem.timeLimit, '1 second');
        assert.strictEqual(problem.memoryLimit, '64 megabytes');
    });

    it('reads the sample test', () => {
        assert.strictEqual(problem.testCases.length, 1);
        assert.strictEqual(problem.testCases[0].input, '8');
        assert.strictEqual(problem.testCases[0].expected, 'YES');
    });

    it('keeps the statement but not the sample block or the rendered maths', () => {
        assert.ok(problem.htmlContent.length > 200);
        assert.ok(!problem.htmlContent.includes('sample-test'));
        assert.ok(!problem.htmlContent.includes('MathJax'));
        assert.ok(!problem.htmlContent.includes('<script'));
    });

    it('recognises a browser check rather than reporting an empty problem', () => {
        assert.throws(
            () => codeforcesAdapter.parse('<html><body>Just a moment...</body></html>', url),
            /browser check/
        );
    });
});

describe('AtCoder adapter', () => {
    const url = parseUrl('https://atcoder.jp/contests/abc300/tasks/abc300_a');
    const problem = atcoderAdapter.parse(fixture('atcoder-abc300-a.html'), url);

    it('reads the heading and the limits', () => {
        assert.strictEqual(problem.title, 'A - N-choice question');
        assert.strictEqual(problem.timeLimit, '2 sec');
        assert.strictEqual(problem.memoryLimit, '1024 MiB');
    });

    it('reads every sample pair', () => {
        assert.strictEqual(problem.testCases.length, 3);
        assert.strictEqual(problem.testCases[0].input, '3 125 175\n200 300 400');
        assert.strictEqual(problem.testCases[0].expected, '2');
    });

    it('keeps the English statement only', () => {
        assert.ok(problem.htmlContent.includes('Problem Statement'));
        assert.ok(!problem.htmlContent.includes('問題文'));
    });

    it('does not repeat the samples inside the statement', () => {
        assert.ok(!problem.htmlContent.includes('Sample Input 1'));
    });

    it('rewrites the tags AtCoder uses for inline maths into delimiters', () => {
        // The site marks inline maths with <var> and configures its own typesetter
        // to read those; display maths already uses \[ \], which is why only half
        // of a statement used to render.
        assert.ok(!problem.htmlContent.includes('<var>'));
        assert.ok(problem.htmlContent.includes('\\('));
    });

    it('keeps a comparison inside inline maths from becoming markup', () => {
        // AtCoder writes <var>0\leq y&lt;H</var>; decoding that and putting it back
        // unescaped starts a tag and swallows the rest of the sentence.
        const converted = atcoderAdapter.parse(
            '<div id="task-statement"><span class="lang-en"><p>if <var>0\\leq y&lt;H</var> then</p></span></div>',
            url
        );

        assert.ok(converted.htmlContent.includes('&lt;H'));
        assert.ok(converted.htmlContent.includes('then'));
    });

    it('turns an input format block into something a typesetter will read', () => {
        // A typesetter skips pre, and the input format is maths rather than code.
        assert.ok(problem.htmlContent.includes('io-format'));
    });
});

describe('NCU Online Judge adapter', () => {
    const url = parseUrl('https://ncuma-oj.math.ncu.edu.tw/problem/A001');
    const problem = ncuOjAdapter.parse(fixture('ncu-oj-a001.json'), url);

    it('reads the limits the rendered page never showed', () => {
        assert.strictEqual(problem.title, '兩數運算');
        assert.strictEqual(problem.timeLimit, '1 second');
        assert.strictEqual(problem.memoryLimit, '256 MB');
    });

    it('reads the samples as structured data rather than paired pre blocks', () => {
        assert.deepStrictEqual(
            problem.testCases.map(testCase => [testCase.input, testCase.expected]),
            [['1 3', '3'], ['2 5', '3']]
        );
    });

    it('assembles the statement from the parts the API returns', () => {
        assert.ok(problem.htmlContent.includes('<h3>Input</h3>'));
        assert.ok(problem.htmlContent.includes('<h3>Output</h3>'));
    });

    it('reports a missing problem instead of returning an empty one', () => {
        assert.throws(() => ncuOjAdapter.parse('{"data":null}', url), /No problem found/);
    });
});
