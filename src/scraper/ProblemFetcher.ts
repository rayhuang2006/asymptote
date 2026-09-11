import * as vscode from "vscode";
import { BrowserSession } from "./BrowserSession";
import { fetchText } from "./http";
import { parseUrl, resolveAdapter } from "./registry";
import { ParsedProblem } from "./types";

/**
 * Resolves a pasted URL to a problem, using the cheapest transport the site allows.
 */
export class ProblemFetcher {
    private session?: BrowserSession;

    constructor(private readonly profileRoot: vscode.Uri) {}

    public async fetch(rawUrl: string): Promise<ParsedProblem> {
        const url = parseUrl(rawUrl);
        const adapter = resolveAdapter(url);
        const requestUrl = adapter.resolveRequestUrl(url);

        const body = adapter.transport === "browser"
            ? await this.browser().loadHtml(requestUrl, adapter.readySelector)
            : await fetchText(requestUrl);

        return adapter.parse(body, url);
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
