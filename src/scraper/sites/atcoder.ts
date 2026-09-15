import * as cheerio from "cheerio";
import { ParsedProblem, SiteAdapter, createTestCase } from "../types";

/**
 * A task page carries both translations inside #task-statement, wrapped in
 * .lang-en and .lang-ja. Only one of them should reach the panel.
 */
export const atcoderAdapter: SiteAdapter = {
    name: "AtCoder",
    transport: "http",

    matches(url: URL): boolean {
        return url.hostname.endsWith("atcoder.jp");
    },

    resolveRequestUrl(url: URL): string {
        const withLanguage = new URL(url.href);
        withLanguage.searchParams.set("lang", "en");
        return withLanguage.href;
    },

    parse(body: string, url: URL): ParsedProblem {
        const $ = cheerio.load(body);
        const statement = $("#task-statement");

        if (statement.length === 0) {
            throw new Error(`No task statement found at ${url.href}`);
        }

        const localized = statement.find("span.lang-en").first();
        const content = localized.length > 0 ? localized : statement;
        const limits = readLimits($("body").text());

        return {
            title: $("title").first().text().trim(),
            timeLimit: limits.time,
            memoryLimit: limits.memory,
            htmlContent: buildStatement($, content),
            testCases: readSamples($, content)
        };
    }
};

function readLimits(text: string): { time: string; memory: string } {
    const match = text.match(/Time Limit:\s*([^/\n]+?)\s*\/\s*Memory Limit:\s*([^\n]+?)\s*$/m);
    return {
        time: match?.[1]?.trim() ?? "",
        memory: match?.[2]?.trim() ?? ""
    };
}

function readSamples($: cheerio.CheerioAPI, content: cheerio.Cheerio<any>): ParsedProblem["testCases"] {
    const inputs: string[] = [];
    const outputs: string[] = [];

    content.find("h3").each((_, heading) => {
        const label = $(heading).text().trim();
        const sample = $(heading).nextAll("pre").first().text();

        if (/^Sample Input/i.test(label)) {
            inputs.push(sample);
        } else if (/^Sample Output/i.test(label)) {
            outputs.push(sample);
        }
    });

    return inputs.map((input, index) => createTestCase(input, outputs[index] ?? "", index));
}

/**
 * AtCoder marks inline maths with <var> rather than with delimiters, and configures
 * its own typesetter to read those tags. Display maths uses \[ \], which is why it
 * was the half that rendered. Rewriting <var> into \( \) puts both halves into the
 * form any typesetter understands.
 */
function normaliseMaths($: cheerio.CheerioAPI, clone: cheerio.Cheerio<any>): void {
    // A pre holding <var> is an input format rather than code, and its maths is
    // meant to be typeset; a typesetter skips pre, so it cannot stay one.
    clone.find("pre").each((_, block) => {
        if ($(block).find("var").length > 0) {
            $(block).replaceWith(`<div class="io-format">${$(block).html() ?? ""}</div>`);
        }
    });

    clone.find("var").each((_, node) => {
        // The text is put back as markup, and a comparison written as &lt; decodes
        // to a character that would start a tag. It has to be escaped again.
        $(node).replaceWith(`\\(${escapeMarkup($(node).text())}\\)`);
    });
}

function escapeMarkup(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function buildStatement($: cheerio.CheerioAPI, content: cheerio.Cheerio<any>): string {
    const clone = content.clone();

    // The samples are rendered as test cases, so they would only be duplicated here.
    clone.find("h3").each((_, heading) => {
        if (/^Sample (Input|Output)/i.test($(heading).text().trim())) {
            $(heading).nextAll("pre").first().remove();
            $(heading).next("div").remove();
            $(heading).remove();
        }
    });
    clone.find("script, .btn-copy, .div-btn-copy").remove();
    normaliseMaths($, clone);

    return clone.html() ?? "";
}
