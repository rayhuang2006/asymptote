import * as vscode from "vscode";
import { BrowserSession } from "./BrowserSession";
import { fetchText } from "./http";
import { parseUrl, resolveAdapter } from "./registry";
import { ParsedProblem } from "./types";
import { StatementCache } from "./StatementCache";

/**
 * Resolves a pasted URL to a problem, using the cheapest transport the site allows.
 */
export class ProblemFetcher {
    private session?: BrowserSession;

    constructor(
        private readonly profileRoot: vscode.Uri,
        private readonly cache?: StatementCache
    ) {}

    /** Set refresh to go past whatever was remembered for this URL. */
    public async fetch(rawUrl: string, refresh: boolean = false): Promise<ParsedProblem> {
        const url = parseUrl(rawUrl);
        const adapter = resolveAdapter(url);

        if (!refresh) {
            const remembered = this.cache?.get(url.href);
            if (remembered) {
                return remembered;
            }
        }

        const requestUrl = adapter.resolveRequestUrl(url);
        const body = adapter.transport === "browser"
            ? await this.browser().loadHtml(requestUrl, adapter.readySelector)
            : await fetchText(requestUrl);

        const problem = adapter.parse(body, url);
        await this.cache?.set(url.href, problem);
        return problem;
    }

    public async dispose(): Promise<void> {
        await this.session?.dispose();
        this.session = undefined;
    }

    private browser(): BrowserSession {
        if (!this.session) {
            this.session = new BrowserSession(this.profileRoot);
        }
        return this.session;
    }
}
