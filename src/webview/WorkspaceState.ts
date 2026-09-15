export const STATE_VERSION = 3;

export interface StoredProblem {
    /** Where it was imported from, which is what makes a re-import recognisable. */
    url?: string;
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
    /** Interactive is a tab of its own now, so the mode it used to be is gone. */
    tab: "runner" | "interactive" | "problem";
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
        tab: candidate.interactive ? "interactive" : "runner",
        problem: candidate.problemHtml
            ? { title: "", timeLimit: "", memoryLimit: "", html: candidate.problemHtml }
            : null,
        testCases: candidate.testCases
    });
}

/** A session stored before problems remembered their address has no url to keep. */
function readProblem(problem: Record<string, any>): StoredProblem {
    const stored: StoredProblem = {
        title: problem.title ?? "",
        timeLimit: problem.timeLimit ?? "",
        memoryLimit: problem.memoryLimit ?? "",
        html: problem.html
    };

    return problem.url ? { ...stored, url: problem.url } : stored;
}

/** A version 1 session recorded interactive as a flag rather than a tab. */
function readTab(candidate: Record<string, any>): WorkspaceState["tab"] {
    const tab = candidate.mode === "interactive" ? "interactive" : candidate.tab;
    return tab === "interactive" || tab === "problem" ? tab : "runner";
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
        tab: readTab(candidate),
        problem: candidate.problem?.html ? readProblem(candidate.problem) : null,
        testCases
    };
}
