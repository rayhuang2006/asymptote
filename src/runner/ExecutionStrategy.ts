import * as path from "path";

export type SupportedLanguage = "cpp" | "python" | "java";

const LANGUAGE_BY_EXTENSION: Record<string, SupportedLanguage> = {
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".c++": "cpp",
    ".c": "cpp",
    ".py": "python",
    ".java": "java"
};

export const SUPPORTED_EXTENSIONS = Object.keys(LANGUAGE_BY_EXTENSION);

/** Returns null for a file the runner has no business compiling, such as a build artifact. */
export function getLanguage(filePath: string): SupportedLanguage | null {
    return LANGUAGE_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? null;
}

export interface ExecutionStrategy {
    /** Shell command that produces the runnable artifact, or undefined for interpreted languages. */
    compileCommand?: string;
    runCommand: string;
    runArgs: string[];
    /** Build artifacts to delete once the run is over. */
    cleanupFiles: string[];
}

export function getExecutionStrategy(filePath: string, fileDir: string, fileName: string): ExecutionStrategy {
    const language = getLanguage(filePath);
    const isWindows = process.platform === "win32";

    if (language === "python") {
        return {
            compileCommand: undefined,
            runCommand: isWindows ? "python" : "python3",
            runArgs: [filePath],
            cleanupFiles: []
        };
    }

    if (language === "java") {
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
