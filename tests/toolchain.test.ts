/// <reference types="mocha" />
import * as assert from 'assert';
import * as os from 'os';
import { describeMissingCommand, isMissingCommand } from '../src/runner/toolchain';

describe('Missing toolchain', () => {
    it('names the tool rather than the spawn failure', () => {
        assert.match(describeMissingCommand('g++'), /^The C\+\+ compiler \(g\+\+\) was not found/);
        assert.match(describeMissingCommand('python3'), /^Python 3 was not found/);
        assert.match(describeMissingCommand('javac'), /^The Java compiler \(javac\) was not found/);
    });

    it('tells the reader what to install on this platform', () => {
        const advice = describeMissingCommand('g++');

        if (os.platform() === 'darwin') {
            assert.ok(advice.includes('xcode-select --install'));
        } else if (os.platform() === 'win32') {
            assert.ok(advice.includes('winget'));
        } else {
            assert.ok(advice.includes('apt install'));
        }
    });

    it('reads a tool out of a full path', () => {
        assert.match(describeMissingCommand('/usr/bin/python3'), /^Python 3 was not found/);
        assert.match(describeMissingCommand('C:\\tools\\javac'), /^The Java compiler/);
    });

    it('still says something useful about a command it does not know', () => {
        assert.strictEqual(
            describeMissingCommand('/tmp/solution.out'),
            'solution.out was not found on your PATH.'
        );
    });

    it('recognises the two ways a missing command is reported', () => {
        assert.strictEqual(isMissingCommand({ code: 'ENOENT' }), true);
        assert.strictEqual(isMissingCommand({ code: 127 }), true);
        assert.strictEqual(isMissingCommand({ code: 1 }), false);
        assert.strictEqual(isMissingCommand(null), false);
    });
});
