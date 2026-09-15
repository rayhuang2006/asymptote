/// <reference types="mocha" />
import * as assert from 'assert';
import { STATE_VERSION, migrateState } from '../src/webview/WorkspaceState';

describe('Webview state migration', () => {
    it('ignores an empty workspace', () => {
        assert.strictEqual(migrateState(undefined), null);
        assert.strictEqual(migrateState(null), null);
        assert.strictEqual(migrateState('not-an-object'), null);
    });

    it('upgrades a version 1 session and keeps its test cases', () => {
        const migrated = migrateState({
            view: 'workspace',
            tab: 'problem',
            interactive: true,
            problemHtml: '<p>statement</p>',
            testCases: [{ id: 'case-1', input: '8', expected: 'YES' }]
        });

        assert.ok(migrated);
        assert.strictEqual(migrated!.version, STATE_VERSION);
        assert.strictEqual(migrated!.mode, 'interactive');
        assert.strictEqual(migrated!.problem?.html, '<p>statement</p>');
        assert.deepStrictEqual(migrated!.testCases, [{ id: 'case-1', input: '8', expected: 'YES' }]);
    });

    it('upgrades a version 2 session, dropping the chrome it was built around', () => {
        const migrated = migrateState({
            version: 2,
            view: 'workspace',
            tab: 'problem',
            mode: 'standard',
            problem: { title: 'A', timeLimit: '1 second', memoryLimit: '64 MB', html: '<p>a</p>' },
            testCases: [{ id: 'case-1', input: '8', expected: 'YES' }]
        });

        assert.strictEqual(migrated!.version, STATE_VERSION);
        assert.ok(!('tab' in migrated!), 'the tab is gone');
        assert.ok(!('view' in migrated!), 'the home screen is gone');
        assert.strictEqual(migrated!.problem?.title, 'A');
        assert.strictEqual(migrated!.testCases.length, 1);
    });

    it('drops a version 1 session that never reached the workspace', () => {
        assert.strictEqual(migrateState({ view: 'home', testCases: [] }), null);
    });

    it('keeps a current session as it was stored', () => {
        const stored = {
            version: STATE_VERSION,
            mode: 'standard' as const,
            problem: { title: 'A', timeLimit: '1 second', memoryLimit: '256 MB', html: '<p>a</p>' },
            testCases: [{ id: 'case-1', input: '1', expected: '1' }]
        };

        assert.deepStrictEqual(migrateState(stored), stored);
    });

    it('repairs test cases that lost their fields', () => {
        const migrated = migrateState({
            version: STATE_VERSION,
            testCases: [{}, { input: '5' }]
        });

        assert.deepStrictEqual(migrated!.testCases, [
            { id: 'case-restored-0', input: '', expected: '' },
            { id: 'case-restored-1', input: '5', expected: '' }
        ]);
    });

    it('falls back to standard mode for an unknown value', () => {
        const migrated = migrateState({ version: STATE_VERSION, mode: 'nope' });

        assert.strictEqual(migrated!.mode, 'standard');
        assert.strictEqual(migrated!.problem, null);
    });
});
