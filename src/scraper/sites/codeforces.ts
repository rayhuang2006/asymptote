import * as cheerio from "cheerio";
import { ParsedProblem, SiteAdapter, createTestCase } from "../types";

/**
 * Codeforces serves its HTML behind a browser check: a plain request is answered
 * with a challenge page whatever headers it carries, so this adapter needs a real
 * browser engine. The API at /api is not gated, but it carries no statements.
 */
export const codeforcesAdapter: SiteAdapter = {
    name: "Codeforces",
    transport: "browser",
    readySelector: ".problem-statement",

    matches(url: URL): boolean {
        return url.hostname.endsWith("codeforces.com");
    },

    resolveRequestUrl(url: URL): string {
        return url.href;
    },

    parse(body: string, url: URL): ParsedProblem {
        const $ = cheerio.load(body);

        if ($("body").text().includes("Just a moment...") || $("#challenge-running").length > 0) {
            throw new Error("Codeforces asked for a browser check.");
        }

        const statement = $(".problem-statement");
        if (statement.length === 0) {
            throw new Error(`No problem statement found at ${url.href}`);
        }

        return {
            title: statement.find(".header .title").text().trim(),
            timeLimit: statement.find(".header .time-limit").text().replace("time limit per test", "").trim(),
            memoryLimit: statement.find(".header .memory-limit").text().replace("memory limit per test", "").trim(),
            htmlContent: buildStatement($, statement),
            testCases: readSamples($, statement)
        };
    }
};

/** Sample blocks are either a list of line divs or one pre with <br> separators. */
function readSampleText($: cheerio.CheerioAPI, node: cheerio.Cheerio<any>): string {
    const lines = node.find("div");
    if (lines.length > 0) {
        return lines.map((_, line) => $(line).text()).get().join("\n");
    }

    const html = node.html() ?? "";
    return cheerio.load(html.replace(/<br\s*\/?>/g, "\n")).text();
}

function readSamples($: cheerio.CheerioAPI, statement: cheerio.Cheerio<any>): ParsedProblem["testCases"] {
    const inputs = statement.find(".sample-test .input pre");
    const outputs = statement.find(".sample-test .output pre");

    return inputs.map((index, input) => createTestCase(
        readSampleText($, $(input)),
        readSampleText($, $(outputs[index])),
        index
    )).get();
}

function buildStatement($: cheerio.CheerioAPI, statement: cheerio.Cheerio<any>): string {
    const clone = statement.clone();

    // .sample-tests is the wrapper holding the Examples heading; removing only the
    // inner .sample-test used to leave that heading behind with nothing under it.
    clone.find(".header, .sample-tests, .sample-test, .MathJax_Preview, .MathJax_Display, .MathJax").remove();

    // Codeforces ships the TeX source beside the rendered maths; keep the source
    // so the panel can typeset it itself.
    clone.find('script[type="math/tex"]').each((_, node) => {
        $(node).replaceWith(`$${$(node).html()}$`);
    });
    clone.find('script[type="math/tex; mode=display"]').each((_, node) => {
        $(node).replaceWith(`$$${$(node).html()}$$`);
    });
    clone.find("script").remove();

    clone.find("img").each((_, image) => {
        const source = $(image).attr("src");
        if (source && !source.startsWith("http")) {
            $(image).attr("src", `https://codeforces.com${source}`);
        }
    });

    return clone.html() ?? "";
}
