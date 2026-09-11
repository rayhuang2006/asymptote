import { ParsedProblem, SiteAdapter, createTestCase } from "../types";

interface NcuProblem {
    title?: string;
    description?: string;
    input_description?: string;
    output_description?: string;
    hint?: string;
    /** Milliseconds. */
    time_limit?: number;
    /** Megabytes. */
    memory_limit?: number;
    samples?: { input?: string; output?: string }[];
}

/**
 * The site is a single page app, so the HTML it serves is an empty shell; the
 * same deployment exposes the problem as JSON, which is both complete and cheap.
 */
export const ncuOjAdapter: SiteAdapter = {
    name: "NCU Online Judge",
    transport: "http",

    matches(url: URL): boolean {
        return url.hostname.endsWith("ncuma-oj.math.ncu.edu.tw");
    },

    resolveRequestUrl(url: URL): string {
        const problemId = url.pathname.split("/").filter(Boolean).pop() ?? "";
        return `${url.origin}/api/problem?problem_id=${encodeURIComponent(problemId)}`;
    },

    parse(body: string, url: URL): ParsedProblem {
        const payload = JSON.parse(body);
        const problem: NcuProblem | undefined = payload?.data;

        if (!problem?.title) {
            throw new Error(`No problem found at ${url.href}`);
        }

        const samples = problem.samples ?? [];

        return {
            title: problem.title,
            timeLimit: formatSeconds(problem.time_limit),
            memoryLimit: problem.memory_limit ? `${problem.memory_limit} MB` : "",
            htmlContent: buildStatement(problem),
            testCases: samples.map((sample, index) =>
                createTestCase(sample.input ?? "", sample.output ?? "", index))
        };
    }
};

function formatSeconds(milliseconds: number | undefined): string {
    if (!milliseconds) {
        return "";
    }
    const seconds = milliseconds / 1000;
    return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
}

function buildStatement(problem: NcuProblem): string {
    const sections: [string, string | undefined][] = [
        ["", problem.description],
        ["Input", problem.input_description],
        ["Output", problem.output_description],
        ["Hint", problem.hint]
    ];

    return sections
        .filter(([, content]) => Boolean(content?.trim()))
        .map(([heading, content]) => (heading ? `<h3>${heading}</h3>${content}` : content))
        .join("\n");
}
