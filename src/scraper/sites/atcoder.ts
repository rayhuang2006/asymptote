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

    return clone.html() ?? "";
}
