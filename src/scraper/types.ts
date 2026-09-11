export interface TestCase {
    id: string;
    input: string;
    expected: string;
}

export interface ParsedProblem {
    title: string;
    timeLimit: string;
    memoryLimit: string;
    htmlContent: string;
    testCases: TestCase[];
}

/** How an adapter gets the bytes it needs. */
export type Transport = "http" | "browser";

export interface SiteAdapter {
    /** Human readable, used in error messages. */
    readonly name: string;
    readonly transport: Transport;

    matches(url: URL): boolean;

    /**
     * The address the transport should actually request, which is not always the
     * page the user pasted: a site with a JSON API is asked for the JSON.
     */
    resolveRequestUrl(url: URL): string;

    /** For the browser transport, the selector that means the page is ready. */
    readonly readySelector?: string;

    parse(body: string, url: URL): ParsedProblem;
}

export function createTestCase(input: string, expected: string, index: number): TestCase {
    return {
        id: `case-${Date.now()}-${index}`,
        input: input.trim(),
        expected: expected.trim()
    };
}
