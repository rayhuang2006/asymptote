/// <reference types="mocha" />
import * as assert from 'assert';
import { SessionStore } from '../src/webview/SessionStore';
import { STATE_VERSION, WorkspaceState } from '../src/webview/WorkspaceState';

/** Stands in for the editor's workspace memento, which is a get/update pair. */
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

    public keys(): readonly string[] {
        return [...this.values.keys()];
    }
}

function session(input: string): WorkspaceState {
    return {
        version: STATE_VERSION,
        tab: 'runner',
        problem: null,
        testCases: [{ id: 'case-1', input, expected: '' }]
    };
}

function storeOn(memento: FakeMemento): SessionStore {
    return new SessionStore(memento as any);
}

describe('Session store', () => {
    it('has nothing for a file it has not seen', () => {
        assert.strictEqual(storeOn(new FakeMemento()).read('/tmp/a.cpp'), null);
    });

    it('keeps a session per file', async () => {
        const memento = new FakeMemento();
        const store = storeOn(memento);

        await store.write('/tmp/a.cpp', session('from a'));
        await store.write('/tmp/b.cpp', session('from b'));

        assert.strictEqual(store.read('/tmp/a.cpp')!.testCases[0].input, 'from a');
        assert.strictEqual(store.read('/tmp/b.cpp')!.testCases[0].input, 'from b');
    });

    it('forgets a file on request', async () => {
        const memento = new FakeMemento();
        const store = storeOn(memento);

        await store.write('/tmp/a.cpp', session('from a'));
        await store.forget('/tmp/a.cpp');

        assert.strictEqual(store.read('/tmp/a.cpp'), null);
    });

    it('hands the session that predates files to whichever file asks first', async () => {
        const memento = new FakeMemento();
        await memento.update('asymptote-state', {
            version: 3,
            tab: 'runner',
            problem: null,
            testCases: [{ id: 'case-1', input: 'inherited', expected: '' }]
        });

        const store = storeOn(memento);
        assert.strictEqual(store.read('/tmp/a.cpp')!.testCases[0].input, 'inherited');
    });

    it('stops handing the old session out once a file has claimed it', async () => {
        const memento = new FakeMemento();
        await memento.update('asymptote-state', {
            version: 3,
            tab: 'runner',
            problem: null,
            testCases: [{ id: 'case-1', input: 'inherited', expected: '' }]
        });

        const store = storeOn(memento);
        await store.write('/tmp/a.cpp', session('claimed'));

        assert.strictEqual(store.read('/tmp/a.cpp')!.testCases[0].input, 'claimed');
        assert.strictEqual(store.read('/tmp/b.cpp'), null);
    });

    it('upgrades an old single session and leaves the old key behind', async () => {
        const memento = new FakeMemento();
        await memento.update('asymptote-state', {
            view: 'workspace',
            testCases: [{ id: 'case-1', input: 'v1', expected: '' }]
        });

        const store = storeOn(memento);
        await store.write('/tmp/a.cpp', session('now'));

        assert.ok(!memento.keys().includes('asymptote-state'));
        assert.deepStrictEqual(memento.keys(), ['asymptote-sessions']);
    });
});
