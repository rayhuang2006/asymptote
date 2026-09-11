import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
const chromeFinder = require("chrome-finder");

puppeteer.use(StealthPlugin());

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
export class BrowserSession {
    private browser: any;
    private launching?: Promise<any>;
    private idleTimer?: NodeJS.Timeout;

    constructor(private readonly profileRoot: vscode.Uri) {}

    public async loadHtml(url: string, readySelector?: string): Promise<string> {
        const browser = await this.getBrowser();
        const page = await browser.newPage();

        try {
            await page.setUserAgent(USER_AGENT);
            await page.setViewport({ width: 1440, height: 900 });
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAVIGATION_TIMEOUT_MS });

            if (readySelector) {
                await page.waitForSelector(readySelector, { timeout: READY_TIMEOUT_MS });
            }

            return await page.content();
        } finally {
            await page.close().catch(() => undefined);
            this.scheduleShutdown();
        }
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
        const userDataDir = path.join(this.profileRoot.fsPath, "browser-profile");
        fs.mkdirSync(userDataDir, { recursive: true });

        return puppeteer.launch({
            headless: true,
            executablePath,
            userDataDir,
            args: ["--no-sandbox", "--disable-setuid-sandbox"]
        });
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
