import * as path from "path";

export interface ExecutionStrategy {
    /** Shell command that produces the runnable artifact, or undefined for interpreted languages. */
    compileCommand?: string;
    runCommand: string;
    runArgs: string[];
    /** Build artifacts to delete once the run is over. */
    cleanupFiles: string[];
}

export function getExecutionStrategy(filePath: string, fileDir: string, fileName: string): ExecutionStrategy {
    const extension = path.extname(filePath).toLowerCase();
    const isWindows = process.platform === "win32";

    if (extension === ".py") {
        return {
            compileCommand: undefined,
            runCommand: isWindows ? "python" : "python3",
            runArgs: [filePath],
            cleanupFiles: []
        };
    }

    if (extension === ".java") {
        return {
            compileCommand: `javac "${filePath}"`,
            runCommand: "java",
            runArgs: [fileName],
            cleanupFiles: [path.join(fileDir, `${fileName}.class`)]
        };
    }

    const executableName = isWindows ? `${fileName}.exe` : `${fileName}.out`;
    const executablePath = path.join(fileDir, executableName);
    return {
        compileCommand: `g++ -std=c++17 "${filePath}" -o "${executablePath}"`,
        runCommand: executablePath,
        runArgs: [],
        cleanupFiles: [executablePath]
    };
}
