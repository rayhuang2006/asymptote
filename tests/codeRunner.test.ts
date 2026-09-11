/// <reference types="mocha" />
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CodeRunner, RunnerEvents, TestOutcome } from '../src/runner/CodeRunner';

/** Python needs no compile step, so these exercise the runner rather than a toolchain. */
function writeProgram(body: string): string {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'asymptote-runner-'));
    const file = path.join(directory, 'solution.py');
    fs.writeFileSync(file, body);
    return file;
}

function collect(): { events: RunnerEvents; outcomes: TestOutcome[]; toolchain: string[] } {
    const outcomes: TestOutcome[] = [];
    const toolchain: string[] = [];
    const events: RunnerEvents = {
        onStatus: () => undefined,
        onCompileError: () => undefined,
        onToolchainMissing: (message) => toolchain.push(message),
        onTestResult: (outcome) => outcomes.push(outcome),
        onFinished: () => undefined,
        onInteractiveSystem: () => undefined,
        onInteractiveStdout: () => undefined,
        onInteractiveStderr: () => undefined,
        onInteractiveError: () => undefined,
        onInteractiveExit: () => undefined,
        onInteractiveStopped: () => undefined
    };
    return { events, outcomes, toolchain };
}

describe('Code runner', () => {
    it('explains a missing interpreter instead of taking the extension down', async function () {
        this.timeout(20000);
        const { events, outcomes, toolchain } = collect();
        const file = writeProgram('print("hi")\n');

        // The strategy is supplied so the test does not depend on what this machine
        // happens to have installed.
        const runner = new CodeRunner(events, () => ({
            compileCommand: undefined,
            runCommand: 'asymptote-no-such-interpreter',
            runArgs: [file],
            cleanupFiles: []
        }));

        await runner.runTests(file, [{ id: 'case-1', input: '', expected: 'hi' }], { strict: false, timeoutMs: 5000 });

        assert.strictEqual(outcomes.length, 0, 'a missing interpreter is not a verdict');
        assert.strictEqual(toolchain.length, 1);
        assert.match(toolchain[0], /was not found on your PATH/);
    });

    it('explains a missing compiler', async function () {
        this.timeout(20000);
        const { events, toolchain } = collect();
        const file = writeProgram('print("hi")\n');

        const runner = new CodeRunner(events, () => ({
            compileCommand: 'asymptote-no-such-compiler --version',
            runCommand: 'python3',
            runArgs: [file],
            cleanupFiles: []
        }));

        await runner.runTests(file, [{ id: 'case-1', input: '', expected: 'hi' }], { strict: false, timeoutMs: 5000 });

        assert.strictEqual(toolchain.length, 1);
        assert.match(toolchain[0], /asymptote-no-such-compiler was not found on your PATH/);
    });

    it('judges a slow solution against the limit it is given', async function () {
        this.timeout(20000);
        const file = writeProgram('import time\ntime.sleep(0.6)\nprint("done")\n');
        const testCases = [{ id: 'case-1', input: '', expected: 'done' }];

        const tight = collect();
        await new CodeRunner(tight.events).runTests(file, testCases, { strict: false, timeoutMs: 200 });
        assert.strictEqual(tight.outcomes[0].statusText, 'TLE');

        const generous = collect();
        await new CodeRunner(generous.events).runTests(file, testCases, { strict: false, timeoutMs: 3000 });
        assert.strictEqual(generous.outcomes[0].statusText, 'AC');
    });

    it('separates a wrong answer from a crash', async function () {
        this.timeout(20000);
        const { events, outcomes } = collect();
        const file = writeProgram('import sys\nvalue = input().strip()\nif value == "boom":\n    sys.exit(1)\nprint("wrong")\n');

        await new CodeRunner(events).runTests(file, [
            { id: 'case-1', input: 'fine\n', expected: 'right' },
            { id: 'case-2', input: 'boom\n', expected: 'right' }
        ], { strict: false, timeoutMs: 5000 });

        assert.strictEqual(outcomes[0].statusText, 'WA');
        assert.strictEqual(outcomes[1].statusText, 'RE');
    });

    it('ignores surrounding whitespace unless asked not to', async function () {
        this.timeout(20000);
        const file = writeProgram('print("42 ")\n');
        const testCases = [{ id: 'case-1', input: '', expected: '42' }];

        const lenient = collect();
        await new CodeRunner(lenient.events).runTests(file, testCases, { strict: false, timeoutMs: 5000 });
        assert.strictEqual(lenient.outcomes[0].statusText, 'AC');

        const strict = collect();
        await new CodeRunner(strict.events).runTests(file, testCases, { strict: true, timeoutMs: 5000 });
        assert.strictEqual(strict.outcomes[0].statusText, 'WA');
    });
});
