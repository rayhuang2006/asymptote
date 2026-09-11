import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import { performance } from "perf_hooks";
import { ExecutionStrategy, getExecutionStrategy } from "./ExecutionStrategy";
import { describeMissingCommand, isMissingCommand } from "./toolchain";

export interface TestCase {
    id: string;
    input: string;
    expected: string;
}

export type TestStatus = "AC" | "WA" | "TLE" | "RE";

export interface TestOutcome {
    id: string;
    output: string;
    passed: boolean;
    time: number;
    isError: boolean;
    statusText: TestStatus;
}

export interface RunOptions {
    strict: boolean;
    timeoutMs: number;
}

/** Everything the runner reports back to whoever drives it. */
export interface RunnerEvents {
    onStatus(value: string): void;
    onCompileError(output: string): void;
    /** A compiler or interpreter the run needs is not installed. */
    onToolchainMissing(message: string): void;
    onTestResult(outcome: TestOutcome): void;
    onFinished(): void;
    onInteractiveSystem(value: string): void;
    onInteractiveStdout(data: string): void;
    onInteractiveStderr(data: string): void;
    onInteractiveError(value: string): void;
    onInteractiveExit(code: number | null): void;
    onInteractiveStopped(): void;
}

interface ProcessResult {
    output: string;
    error: string;
    code: number | null;
    isTimeout: boolean;
    time: number;
    /** Set when the command itself could not be started. */
    missingCommand?: string;
}

export class CodeRunner {
    private interactiveProcess?: cp.ChildProcess;
    private activeRun?: { children: Set<cp.ChildProcess>; cancelled: boolean };

    constructor(
        private readonly events: RunnerEvents,
        private readonly resolveStrategy: typeof getExecutionStrategy = getExecutionStrategy
    ) {}

    public get isRunning(): boolean {
        return this.activeRun !== undefined;
    }

    public async runTests(filePath: string, testCases: TestCase[], options: RunOptions): Promise<void> {
        const location = this.resolve(filePath);
        const strategy = this.resolveStrategy(filePath, location.fileDir, location.fileName);

        if (strategy.compileCommand) {
            this.events.onStatus("Compiling...");
            const failure = await this.compile(strategy.compileCommand, location.fileDir);
            if (failure) {
                if (failure.missingCommand) {
                    this.events.onToolchainMissing(describeMissingCommand(failure.missingCommand));
                } else {
                    this.events.onCompileError(failure.output);
                }
                return;
            }
        }

        await this.executeTestCases(strategy, location.fileDir, testCases, options);
    }

    public cancelRun(): void {
        const run = this.activeRun;
        if (!run) {
            return;
        }
        run.cancelled = true;
        for (const child of run.children) {
            child.kill();
        }
    }

    public async startInteractive(filePath: string): Promise<void> {
        const location = this.resolve(filePath);
        const strategy = this.resolveStrategy(filePath, location.fileDir, location.fileName);

        if (strategy.compileCommand) {
            this.events.onInteractiveSystem("Compiling...");
            const failure = await this.compile(strategy.compileCommand, location.fileDir);
            if (failure) {
                this.events.onInteractiveError(failure.missingCommand
                    ? describeMissingCommand(failure.missingCommand)
                    : `Compilation Error:\n${failure.output}`);
                this.events.onInteractiveStopped();
                return;
            }
        }

        this.spawnInteractive(strategy, location.fileDir);
    }

    public sendInteractiveInput(text: string): void {
        const stdin = this.interactiveProcess?.stdin;
        if (!stdin) {
            return;
        }
        try {
            stdin.write(`${text}\n`);
        } catch {
            // The process died between the keystroke and the write; the exit event reports it.
        }
    }

    public stopInteractive(): void {
        if (this.interactiveProcess) {
            this.interactiveProcess.kill();
            this.interactiveProcess = undefined;
        }
    }

    public dispose(): void {
        this.cancelRun();
        this.stopInteractive();
    }

    private resolve(filePath: string): { fileDir: string; fileName: string } {
        return {
            fileDir: path.dirname(filePath),
            fileName: path.basename(filePath, path.extname(filePath))
        };
    }

    /** Resolves to undefined on success, or to what went wrong. */
    private compile(command: string, cwd: string): Promise<{ output: string; missingCommand?: string } | undefined> {
        return new Promise((resolve) => {
            cp.exec(command, { cwd }, (error: any, _stdout, stderr) => {
                if (!error) {
                    resolve(undefined);
                    return;
                }
                // A shell reports a missing program as exit 127, and reports it on
                // stderr rather than through an error code of its own.
                const missing = isMissingCommand(error) || /not found|is not recognized/i.test(stderr)
                    ? command.split(/\s+/)[0]
                    : undefined;
                resolve({ output: stderr || String(error.message ?? error), missingCommand: missing });
            });
        });
    }

    private async executeTestCases(
        strategy: ExecutionStrategy,
        cwd: string,
        testCases: TestCase[],
        options: RunOptions
    ): Promise<void> {
        const run = { children: new Set<cp.ChildProcess>(), cancelled: false };
        this.activeRun = run;
        this.events.onStatus("Running...");

        try {
            for (const testCase of testCases) {
                if (run.cancelled) {
                    break;
                }

                const result = await this.runBinary(
                    strategy.runCommand,
                    strategy.runArgs,
                    cwd,
                    testCase.input,
                    options.timeoutMs,
                    run.children
                );

                if (run.cancelled) {
                    break;
                }

                if (result.missingCommand) {
                    this.events.onToolchainMissing(describeMissingCommand(result.missingCommand));
                    break;
                }

                this.events.onTestResult(this.toOutcome(testCase, result, options.strict));
            }
        } finally {
            this.activeRun = undefined;
            this.events.onFinished();
            this.cleanup(strategy.cleanupFiles);
        }
    }

    private toOutcome(testCase: TestCase, result: ProcessResult, strict: boolean): TestOutcome {
        let output = result.output;
        if (result.error) {
            output += `\n[Stderr]:\n${result.error}`;
        }

        let passed = false;
        if (testCase.expected) {
            passed = strict
                ? output === testCase.expected
                : output.trim() === testCase.expected.trim();
        }

        const statusText: TestStatus = result.isTimeout
            ? "TLE"
            : result.code !== 0
                ? "RE"
                : passed ? "AC" : "WA";

        return {
            id: testCase.id,
            output,
            passed,
            time: result.time,
            isError: result.code !== 0 || result.isTimeout,
            statusText
        };
    }

    private runBinary(
        command: string,
        args: string[],
        cwd: string,
        input: string,
        timeoutMs: number,
        children: Set<cp.ChildProcess>
    ): Promise<ProcessResult> {
        return new Promise((resolve) => {
            const child = cp.spawn(command, args, { cwd });
            children.add(child);

            let output = "";
            let error = "";
            let isTimeout = false;
            const startTime = performance.now();

            const finish = (code: number | null, timedOut: boolean) => {
                children.delete(child);
                resolve({ output, error, code, isTimeout: timedOut, time: performance.now() - startTime });
            };

            const timer = setTimeout(() => {
                isTimeout = true;
                child.kill();
                finish(null, true);
            }, timeoutMs);

            if (input) {
                child.stdin.write(input);
                child.stdin.end();
            }

            child.stdout.on("data", (data) => { output += data.toString(); });
            child.stderr.on("data", (data) => { error += data.toString(); });

            // Without this, a command that does not exist emits an unhandled error
            // event, which takes the extension host down with it.
            child.on("error", (error: any) => {
                clearTimeout(timer);
                children.delete(child);
                resolve({
                    output,
                    error: String(error?.message ?? error),
                    code: null,
                    isTimeout: false,
                    time: performance.now() - startTime,
                    missingCommand: isMissingCommand(error) ? command : undefined
                });
            });

            child.on("close", (code) => {
                if (!isTimeout) {
                    clearTimeout(timer);
                    finish(code, false);
                }
            });
        });
    }

    private spawnInteractive(strategy: ExecutionStrategy, cwd: string): void {
        this.events.onInteractiveSystem("Running Interactive Mode...");
        this.stopInteractive();

        const child = cp.spawn(strategy.runCommand, strategy.runArgs, { cwd });
        this.interactiveProcess = child;

        child.stdout?.on("data", (data) => this.events.onInteractiveStdout(data.toString()));
        child.stderr?.on("data", (data) => this.events.onInteractiveStderr(data.toString()));
        child.on("close", (code) => {
            this.events.onInteractiveExit(code);
            this.interactiveProcess = undefined;
            this.cleanup(strategy.cleanupFiles);
        });
    }

    private cleanup(files: string[]): void {
        for (const file of files) {
            if (!fs.existsSync(file)) {
                continue;
            }
            try {
                fs.unlinkSync(file);
            } catch {
                // A locked artifact is harmless; it gets overwritten by the next compile.
            }
        }
    }
}
