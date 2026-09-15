import * as vscode from "vscode";
import { ParsedProblem } from "./types";

const CACHE_KEY = "asymptote-statements";
/** Enough for a contest's worth of problems several times over. */
const MAX_ENTRIES = 60;

interface CacheEntry {
    fetchedAt: number;
    /**
     * Insertion order. Several problems can be fetched inside the same millisecond,
     * so a timestamp alone cannot say which of them is the newest.
     */
    seq: number;
    problem: ParsedProblem;
}

/**
 * Remembers what a URL resolved to.
 *
 * Reading a problem again should not cost another fetch, and for Codeforces that
 * fetch means a browser. The cache is global rather than per workspace, because a
 * problem is the same problem whichever folder it is being solved in.
 */
export class StatementCache {
    constructor(private readonly memento: vscode.Memento) {}

    public get(url: string): ParsedProblem | undefined {
        return this.load()[normalize(url)]?.problem;
    }

    public async set(url: string, problem: ParsedProblem): Promise<void> {
        const entries = this.load();
        const seq = Object.values(entries).reduce((highest, entry) => Math.max(highest, entry.seq ?? 0), 0) + 1;
        entries[normalize(url)] = { fetchedAt: Date.now(), seq, problem };

        await this.memento.update(CACHE_KEY, trim(entries));
    }

    public async clear(): Promise<void> {
        await this.memento.update(CACHE_KEY, undefined);
    }

    private load(): Record<string, CacheEntry> {
        return this.memento.get<Record<string, CacheEntry>>(CACHE_KEY) ?? {};
    }
}

/** The same problem reached by a slightly different address is the same problem. */
export function normalize(url: string): string {
    try {
        const parsed = new URL(url.trim());
        parsed.hash = "";
        parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
        parsed.pathname = parsed.pathname.replace(/\/+$/, "");
        return parsed.href;
    } catch {
        return url.trim();
    }
}

function trim(entries: Record<string, CacheEntry>): Record<string, CacheEntry> {
    const keys = Object.keys(entries);
    if (keys.length <= MAX_ENTRIES) {
        return entries;
    }

    const newest = keys
        .sort((left, right) => (entries[right].seq ?? 0) - (entries[left].seq ?? 0))
        .slice(0, MAX_ENTRIES);

    const kept: Record<string, CacheEntry> = {};
    newest.forEach((key) => { kept[key] = entries[key]; });
    return kept;
}
