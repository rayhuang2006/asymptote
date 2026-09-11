/// <reference types="mocha" />
import * as assert from 'assert';
import { getExecutionStrategy, getLanguage } from '../src/runner/ExecutionStrategy';

describe('Execution strategy', () => {
    it('recognises the source files the runner supports', () => {
        assert.strictEqual(getLanguage('/tmp/main.cpp'), 'cpp');
        assert.strictEqual(getLanguage('/tmp/main.CC'), 'cpp');
        assert.strictEqual(getLanguage('/tmp/main.c'), 'cpp');
        assert.strictEqual(getLanguage('/tmp/main.py'), 'python');
        assert.strictEqual(getLanguage('/tmp/Main.java'), 'java');
    });

    it('refuses anything it would otherwise hand to the C++ compiler by accident', () => {
        assert.strictEqual(getLanguage('/tmp/test'), null);
        assert.strictEqual(getLanguage('/tmp/notes.txt'), null);
        assert.strictEqual(getLanguage('/tmp/main.out'), null);
    });

    it('compiles C++ to an executable beside the source', () => {
        const strategy = getExecutionStrategy('/tmp/main.cpp', '/tmp', 'main');

        assert.ok(strategy.compileCommand?.startsWith('g++ -std=c++17'));
        assert.strictEqual(strategy.cleanupFiles.length, 1);
    });

    it('runs Python without a compile step', () => {
        const strategy = getExecutionStrategy('/tmp/main.py', '/tmp', 'main');

        assert.strictEqual(strategy.compileCommand, undefined);
        assert.deepStrictEqual(strategy.runArgs, ['/tmp/main.py']);
        assert.deepStrictEqual(strategy.cleanupFiles, []);
    });

    it('runs Java by class name and cleans up the class file', () => {
        const strategy = getExecutionStrategy('/tmp/Main.java', '/tmp', 'Main');

        assert.strictEqual(strategy.runCommand, 'java');
        assert.deepStrictEqual(strategy.runArgs, ['Main']);
        assert.ok(strategy.cleanupFiles[0].endsWith('Main.class'));
    });
});
