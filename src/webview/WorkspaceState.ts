export const STATE_VERSION = 2;

export interface StoredProblem {
    title: string;
    timeLimit: string;
    memoryLimit: string;
    html: string;
}

export interface StoredTestCase {
    id: string;
    input: string;
    expected: string;
}

export interface WorkspaceState {
    version: number;
    view: "home" | "workspace";
    tab: "problem" | "runner";
    mode: "standard" | "interactive";
    problem: StoredProblem | null;
    testCases: StoredTestCase[];
}

/**
 * Version 1 stored the rendered problem markup and read the test cases straight out of the DOM.
 * Anything persisted by that version is upgraded here so an existing workspace keeps its cases.
 */
export function migrateState(raw: unknown): WorkspaceState | null {
    if (!raw || typeof raw !== "object") {
        return null;
    }

    const candidate = raw as Record<string, any>;

    if (candidate.version === STATE_VERSION) {
        return normalize(candidate);
    }

    if (candidate.view !== "workspace") {
        return null;
    }

    return normalize({
        version: STATE_VERSION,
        view: "workspace",
        tab: candidate.tab,
        mode: candidate.interactive ? "interactive" : "standard",
        problem: candidate.problemHtml
            ? { title: "", timeLimit: "", memoryLimit: "", html: candidate.problemHtml }
            : null,
        testCases: candidate.testCases
    });
}

function normalize(candidate: Record<string, any>): WorkspaceState {
    const testCases: StoredTestCase[] = Array.isArray(candidate.testCases)
        ? candidate.testCases.map((testCase: any, index: number) => ({
            id: typeof testCase?.id === "string" ? testCase.id : `case-restored-${index}`,
            input: typeof testCase?.input === "string" ? testCase.input : "",
            expected: typeof testCase?.expected === "string" ? testCase.expected : ""
        }))
        : [];

    return {
        version: STATE_VERSION,
        view: candidate.view === "home" ? "home" : "workspace",
        tab: candidate.tab === "problem" ? "problem" : "runner",
        mode: candidate.mode === "interactive" ? "interactive" : "standard",
        problem: candidate.problem?.html
            ? {
                title: candidate.problem.title ?? "",
                timeLimit: candidate.problem.timeLimit ?? "",
                memoryLimit: candidate.problem.memoryLimit ?? "",
                html: candidate.problem.html
            }
            : null,
        testCases
    };
}
