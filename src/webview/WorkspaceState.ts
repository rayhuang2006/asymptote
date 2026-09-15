export const STATE_VERSION = 3;

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
    mode: "standard" | "interactive";
    tab: "runner" | "problem";
    problem: StoredProblem | null;
    testCases: StoredTestCase[];
}

/**
 * Version 1 stored the rendered problem markup and read the test cases straight out of
 * the DOM. Version 2 added a home screen and a pair of tabs, neither of which exists now
 * that the runner is a panel and the statement is an editor tab. Everything persisted by
 * either is upgraded here so a workspace keeps its cases across the change.
 */
export function migrateState(raw: unknown): WorkspaceState | null {
    if (!raw || typeof raw !== "object") {
        return null;
    }

    const candidate = raw as Record<string, any>;

    if (candidate.version === STATE_VERSION || candidate.version === 2) {
        return normalize(candidate);
    }

    if (candidate.view !== "workspace") {
        return null;
    }

    return normalize({
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
        mode: candidate.mode === "interactive" ? "interactive" : "standard",
        tab: candidate.tab === "problem" ? "problem" : "runner",
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
