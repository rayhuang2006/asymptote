import * as vscode from "vscode";
import { Scraper } from "./utils/Scraper";
import { CodeRunner, RunnerEvents, TestCase } from "./runner/CodeRunner";
import { getWebviewHtml } from "./webview/WebviewHtml";
import { WorkspaceState, migrateState } from "./webview/WorkspaceState";

const STATE_KEY = "asymptote-state";
const DEFAULT_TIMEOUT_MS = 2000;

export class SidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private readonly runner: CodeRunner;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext
  ) {
    this.runner = new CodeRunner(this.createRunnerEvents());
  }

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };

    webviewView.webview.html = getWebviewHtml(webviewView.webview, this.extensionUri);
    webviewView.webview.onDidReceiveMessage((message) => this.handleMessage(message));
    webviewView.onDidDispose(() => this.runner.dispose());
  }

  private async handleMessage(message: any): Promise<void> {
    switch (message.command) {
      case "ready":
        // The webview drives the handshake, so restoring state is no longer a race against a timer.
        this.post({ type: "init", state: this.loadState() });
        break;
      case "run":
        await this.runTests(message.testCases);
        break;
      case "run-interactive":
        await this.runInteractive();
        break;
      case "interactive-input":
        this.runner.sendInteractiveInput(message.text);
        break;
      case "stop-interactive":
        this.runner.stopInteractive();
        break;
      case "parse-url":
        await this.parseUrl(message.url);
        break;
      case "save-state":
        await this.context.workspaceState.update(STATE_KEY, message.state);
        break;
      case "copy":
        await vscode.env.clipboard.writeText(message.text ?? "");
        break;
      case "showError":
        vscode.window.showErrorMessage(message.text);
        break;
    }
  }

  private loadState(): WorkspaceState | null {
    return migrateState(this.context.workspaceState.get(STATE_KEY));
  }

  private async parseUrl(url: string): Promise<void> {
    this.post({ type: "status", scope: "fetch", value: "loading" });

    try {
      const problem = await Scraper.parse(url);
      this.post({
        type: "problem-loaded",
        problem: {
          title: problem.title,
          timeLimit: problem.timeLimit,
          memoryLimit: problem.memoryLimit,
          html: problem.htmlContent
        },
        testCases: problem.testCases
      });
    } catch (error: any) {
      const reason = error?.message ?? String(error);
      vscode.window.showErrorMessage(`Scraping Failed: ${reason}`);
      this.post({ type: "status", scope: "fetch", value: "error", message: reason });
    }
  }

  private async runTests(testCases: TestCase[]): Promise<void> {
    const filePath = await this.saveActiveFile();
    if (!filePath) {
      this.post({
        type: "run-error",
        title: "Nothing to run",
        output: "Open the solution you want to test in an editor, then run again."
      });
      return;
    }

    const config = vscode.workspace.getConfiguration("asymptote");
    await this.runner.runTests(filePath, testCases, {
      strict: config.get<boolean>("strictComparison", false),
      timeoutMs: DEFAULT_TIMEOUT_MS
    });
  }

  private async runInteractive(): Promise<void> {
    const filePath = await this.saveActiveFile();
    if (!filePath) {
      this.post({ type: "interactive-error", value: "Open the solution you want to run in an editor, then start again." });
      this.post({ type: "interactive-stopped" });
      return;
    }
    await this.runner.startInteractive(filePath);
  }

  private async saveActiveFile(): Promise<string | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return undefined;
    }
    await editor.document.save();
    return editor.document.fileName;
  }

  private createRunnerEvents(): RunnerEvents {
    return {
      onStatus: (value) => this.post({ type: "status", scope: "run", value }),
      onCompileError: (output) => this.post({ type: "compile-error", output }),
      onTestResult: (outcome) => this.post({ type: "test-result", ...outcome }),
      onFinished: () => this.post({ type: "finished" }),
      onInteractiveSystem: (value) => this.post({ type: "interactive-system", value }),
      onInteractiveStdout: (data) => this.post({ type: "interactive-stdout", data }),
      onInteractiveStderr: (data) => this.post({ type: "interactive-stderr", data }),
      onInteractiveError: (value) => this.post({ type: "interactive-error", value }),
      onInteractiveExit: (code) => this.post({ type: "interactive-exit", code }),
      onInteractiveStopped: () => this.post({ type: "interactive-stopped" })
    };
  }

  private post(message: unknown): void {
    this.view?.webview.postMessage(message);
  }
}
