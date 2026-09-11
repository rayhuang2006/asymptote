import * as fs from "fs";
import * as vscode from "vscode";

const NONCE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Loads media/webview.html and fills in the values that can only be known at runtime:
 * the webview-scoped asset URIs, the CSP source and a per-load script nonce.
 */
export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const templateUri = vscode.Uri.joinPath(extensionUri, "media", "webview.html");
    const template = fs.readFileSync(templateUri.fsPath, "utf8");

    const replacements: Record<string, string> = {
        cspSource: webview.cspSource,
        nonce: createNonce(),
        styleUri: asset(webview, extensionUri, "main.css"),
        scriptUri: asset(webview, extensionUri, "main.js"),
        diffUri: asset(webview, extensionUri, "diff.js")
    };

    return template.replace(/\$\{(\w+)\}/g, (match, key: string) =>
        key in replacements ? replacements[key] : match
    );
}

function asset(webview: vscode.Webview, extensionUri: vscode.Uri, fileName: string): string {
    return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "media", fileName)).toString();
}

function createNonce(): string {
    let nonce = "";
    for (let i = 0; i < 32; i++) {
        nonce += NONCE_ALPHABET.charAt(Math.floor(Math.random() * NONCE_ALPHABET.length));
    }
    return nonce;
}
