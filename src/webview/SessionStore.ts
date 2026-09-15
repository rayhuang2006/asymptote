import * as vscode from "vscode";
import { WorkspaceState, migrateState } from "./WorkspaceState";

const SESSIONS_KEY = "asymptote-sessions";
const SINGLE_KEY = "asymptote-state";
const STORE_VERSION = 1;

interface StoredSessions {
    version: number;
    sessions: Record<string, WorkspaceState>;
    /**
     * The one session that existed before sessions were per file. It is handed to
     * the first source file that does not have one, so existing work is not lost.
     */
    legacy?: WorkspaceState | null;
}

/**
 * Test cases belong to the file they were written for.
 *
 * A contest folder is a handful of solutions open at once, and the panel should be
 * showing the one whose file is in front of you rather than whichever problem was
 * imported last.
 */
export class SessionStore {
    constructor(private readonly memento: vscode.Memento) {}

    public read(filePath: string | undefined): WorkspaceState | null {
        const stored = this.load();

        if (!filePath) {
            return stored.legacy ?? null;
        }

        const session = stored.sessions[filePath];
        if (session) {
            return session;
        }

        return stored.legacy ?? null;
    }

    public async write(filePath: string | undefined, state: WorkspaceState | null): Promise<void> {
        const stored = this.load();

        if (!filePath) {
            stored.legacy = state;
            await this.save(stored);
            return;
        }

        if (state) {
            stored.sessions[filePath] = state;
        } else {
            delete stored.sessions[filePath];
        }

        // Whatever the reader does next belongs to a file, so the unattached
        // session has served its purpose.
        stored.legacy = null;
        await this.save(stored);
    }

    public async forget(filePath: string | undefined): Promise<void> {
        await this.write(filePath, null);
    }

    private load(): StoredSessions {
        const stored = this.memento.get<StoredSessions>(SESSIONS_KEY);

        if (stored?.version === STORE_VERSION) {
            return { version: STORE_VERSION, sessions: stored.sessions ?? {}, legacy: stored.legacy ?? null };
        }

        return {
            version: STORE_VERSION,
            sessions: {},
            legacy: migrateState(this.memento.get(SINGLE_KEY))
        };
    }

    private async save(stored: StoredSessions): Promise<void> {
        await this.memento.update(SESSIONS_KEY, stored);
        await this.memento.update(SINGLE_KEY, undefined);
    }
}
