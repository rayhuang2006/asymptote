import * as vscode from "vscode";
import { StoredProblem } from "./WorkspaceState";
import { getWebviewHtml } from "./WebviewHtml";

/**
 * The statement in an editor tab beside the code.
 *
 * A problem is reading material: it wants the width of a column, not the height of
 * a panel, and it should stay open while the runner does its work.
 */
export class StatementPanel {
    private static current?: StatementPanel;

    private constructor(
        private readonly panel: vscode.WebviewPanel,
        private readonly extensionUri: vscode.Uri
    ) {
        panel.onDidDispose(() => {
            if (StatementPanel.current === this) {
                StatementPanel.current = undefined;
            }
        });
    }

    /** Opens the statement, or brings the open one forward, without stealing focus. */
    public static show(extensionUri: vscode.Uri, problem: StoredProblem): void {
        if (StatementPanel.current) {
            StatementPanel.current.update(problem);
            StatementPanel.current.panel.reveal(undefined, true);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            "asymptote.statement",
            problem.title || "Problem",
            { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        StatementPanel.current = new StatementPanel(panel, extensionUri);
        StatementPanel.current.update(problem);
    }

    /** Refreshes an open statement when a different problem is imported. */
    public static refresh(problem: StoredProblem): void {
        StatementPanel.current?.update(problem);
    }

    public static get isOpen(): boolean {
        return StatementPanel.current !== undefined;
    }

    private update(problem: StoredProblem): void {
        this.panel.title = problem.title || "Problem";
        this.panel.webview.html = getWebviewHtml(
            this.panel.webview,
            this.extensionUri,
            "statement.html",
            {
                problemTitle: escapeHtml(problem.title),
                problemLimits: escapeHtml(formatLimits(problem)),
                problemBody: problem.html
            }
        );
    }
}

function formatLimits(problem: StoredProblem): string {
    return [problem.timeLimit, problem.memoryLimit]
        .filter((limit) => limit && limit.toLowerCase() !== "unknown")
        .join(" / ");
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
