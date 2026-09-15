/// <reference types="mocha" />
import * as assert from 'assert';
import { STATE_VERSION, migrateState } from '../src/webview/WorkspaceState';

describe('Webview state migration', () => {
    it('ignores an empty workspace', () => {
        assert.strictEqual(migrateState(undefined), null);
        assert.strictEqual(migrateState(null), null);
        assert.strictEqual(migrateState('not-an-object'), null);
    });

    it('opens the runner for a session that predates the tabs', () => {
        const migrated = migrateState({
            view: 'workspace',
            interactive: false,
            testCases: [{ id: 'case-1', input: '1', expected: '1' }]
        });

        assert.strictEqual(migrated!.tab, 'runner');
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

    it('upgrades a version 2 session, keeping the tab it was left on', () => {
        const migrated = migrateState({
            version: 2,
            view: 'workspace',
            tab: 'problem',
            mode: 'standard',
            problem: { title: 'A', timeLimit: '1 second', memoryLimit: '64 MB', html: '<p>a</p>' },
            testCases: [{ id: 'case-1', input: '8', expected: 'YES' }]
        });

        assert.strictEqual(migrated!.version, STATE_VERSION);
        assert.ok(!('view' in migrated!), 'the home screen is gone');
        assert.strictEqual(migrated!.tab, 'problem', 'the reader was on the statement');
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
            tab: 'runner' as const,
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

    it('falls back to the runner and standard mode for unknown values', () => {
        const migrated = migrateState({ version: STATE_VERSION, mode: 'nope', tab: 'nope' });

        assert.strictEqual(migrated!.mode, 'standard');
        assert.strictEqual(migrated!.tab, 'runner');
        assert.strictEqual(migrated!.problem, null);
    });
});
