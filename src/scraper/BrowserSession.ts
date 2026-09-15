import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import puppeteer from "puppeteer-core";
const chromeFinder = require("chrome-finder");

/** Launching a browser costs several seconds; a page load costs a fraction of one. */
const IDLE_SHUTDOWN_MS = 5 * 60 * 1000;
const NAVIGATION_TIMEOUT_MS = 30000;
const READY_TIMEOUT_MS = 30000;

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

/**
 * Holds one browser for as long as it keeps being useful.
 *
 * The profile directory is kept between runs, so whatever a site remembers about
 * this browser, including a clearance cookie earned once, survives a restart of
 * the editor instead of being thrown away after every fetch.
 */
/** A site asked this browser to prove it is not a robot. */
export class ChallengeError extends Error {
    constructor(host: string) {
        super(`${host} asked this browser to verify itself and would not serve the page.`);
        this.name = "ChallengeError";
    }
}

export class BrowserSession {
    private browser: any;
    private launching?: Promise<any>;
    private idleTimer?: NodeJS.Timeout;
    /** Set when the profile could not be used and a throwaway one is standing in. */
    private throwawayProfile?: string;

    constructor(private readonly profileRoot: vscode.Uri) {}

    /**
     * A profile builds up a reputation with the sites it visits, which is the point
     * of keeping one. It can also acquire a bad one, and then every request is
     * answered with a challenge. A challenge is therefore worth one retry from a
     * clean profile, and the spoiled one is discarded rather than kept.
     */
    public async loadHtml(url: string, readySelector?: string): Promise<string> {
        try {
            return await this.attempt(url, readySelector);
        } catch (error) {
            if (!(error instanceof ChallengeError)) {
                throw error;
            }

            await this.discardProfile();
            return this.attempt(url, readySelector);
        }
    }

    private async attempt(url: string, readySelector?: string): Promise<string> {
        const browser = await this.getBrowser();
        const page = await browser.newPage();

        try {
            await page.setUserAgent(USER_AGENT);
            await page.setViewport({ width: 1440, height: 900 });
            const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });

            if (isChallenge(response, await page.content())) {
                throw new ChallengeError(new URL(url).hostname);
            }

            if (readySelector) {
                await page.waitForSelector(readySelector, { timeout: READY_TIMEOUT_MS });
            }

            return await page.content();
        } finally {
            await page.close().catch(() => undefined);
            this.scheduleShutdown();
        }
    }

    /** Throws away the profile a site has taken against, so the next launch is clean. */
    private async discardProfile(): Promise<void> {
        const directory = this.profileDirectory();
        await this.dispose();

        if (!this.throwawayProfile) {
            fs.rmSync(directory, { recursive: true, force: true });
        }
        this.throwawayProfile = undefined;
    }

    public async dispose(): Promise<void> {
        this.clearIdleTimer();
        const browser = this.browser;
        this.browser = undefined;
        await browser?.close().catch(() => undefined);
    }

    private async getBrowser(): Promise<any> {
        this.clearIdleTimer();

        if (this.browser?.connected !== false && this.browser) {
            return this.browser;
        }
        if (this.launching) {
            return this.launching;
        }

        this.launching = this.launch();
        try {
            this.browser = await this.launching;
            return this.browser;
        } finally {
            this.launching = undefined;
        }
    }

    private async launch(): Promise<any> {
        const executablePath = await resolveBrowserPath();
        const userDataDir = this.profileDirectory();
        fs.mkdirSync(userDataDir, { recursive: true });

        try {
            return await this.launchWith(executablePath, userDataDir);
        } catch (error: any) {
            // A profile belongs to one browser at a time, and another window or a
            // browser left behind by a previous session may still hold it.
            if (!/already running/i.test(String(error?.message))) {
                throw error;
            }

            this.throwawayProfile = fs.mkdtempSync(path.join(os.tmpdir(), "asymptote-browser-"));
            return this.launchWith(executablePath, this.throwawayProfile);
        }
    }

    private launchWith(executablePath: string, userDataDir: string): Promise<any> {
        return puppeteer.launch({
            headless: true,
            executablePath,
            userDataDir,
            args: ["--no-sandbox", "--disable-setuid-sandbox"]
        });
    }

    private profileDirectory(): string {
        return this.throwawayProfile ?? path.join(this.profileRoot.fsPath, "browser-profile");
    }

    private scheduleShutdown(): void {
        this.clearIdleTimer();
        this.idleTimer = setTimeout(() => {
            void this.dispose();
        }, IDLE_SHUTDOWN_MS);
    }

    private clearIdleTimer(): void {
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
            this.idleTimer = undefined;
        }
    }
}

/**
 * Cloudflare says so in a header, and says it again in the markup it serves. The
 * page itself is localised, so its words are no use for recognising it.
 */
function isChallenge(response: any, html: string): boolean {
    if (response?.headers?.()["cf-mitigated"] === "challenge") {
        return true;
    }

    return response?.status?.() === 403 &&
        (html.includes("cdn-cgi/challenge-platform") || html.includes("__cf_chl"));
}

async function resolveBrowserPath(): Promise<string> {
    const config = vscode.workspace.getConfiguration("asymptote");
    const configured = config.get<string>("chromePath") || "";
    if (configured) {
        return configured;
    }

    try {
        const found = chromeFinder();
        if (found) {
            return found;
        }
    } catch {
        // chrome-finder throws when it recognises nothing; the known paths are tried next.
    }

    const known = knownBrowserPaths().find((candidate) => fs.existsSync(candidate));
    if (known) {
        return known;
    }

    const chosen = await askForBrowser();
    if (!chosen) {
        throw new Error("Asymptote needs Chrome, Edge or Brave to read Codeforces problems.");
    }

    await config.update("chromePath", chosen, vscode.ConfigurationTarget.Global);
    return chosen;
}

function knownBrowserPaths(): string[] {
    switch (os.platform()) {
        case "darwin":
            return [
                "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
                "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
            ];
        case "win32":
            return [
                "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
                "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
                "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
                "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
            ];
        default:
            return ["/usr/bin/google-chrome", "/usr/bin/microsoft-edge", "/usr/bin/brave-browser"];
    }
}

async function askForBrowser(): Promise<string | undefined> {
    const selection = await vscode.window.showErrorMessage(
        "Asymptote needs Chrome, Edge or Brave to read Codeforces problems.",
        "Locate Browser",
        "Cancel"
    );

    if (selection !== "Locate Browser") {
        return undefined;
    }

    const picked = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectMany: false,
        openLabel: "Select Browser"
    });

    const chosen = picked?.[0]?.fsPath;
    if (chosen && os.platform() === "darwin" && chosen.endsWith(".app")) {
        return `${chosen}/Contents/MacOS/${path.basename(chosen, ".app")}`;
    }
    return chosen;
}
