import * as os from "os";

interface Toolchain {
    /** The command as it appears on PATH. */
    command: string;
    label: string;
    install: { darwin: string; win32: string; linux: string };
}

const TOOLCHAINS: Toolchain[] = [
    {
        command: "g++",
        label: "The C++ compiler (g++)",
        install: {
            darwin: "Run `xcode-select --install` in a terminal.",
            win32: "Install MinGW-w64, or run `winget install -e --id BrechtSanders.WinLibs.POSIX.UCRT`.",
            linux: "Run `sudo apt install g++`, or the equivalent for your distribution."
        }
    },
    {
        command: "python3",
        label: "Python 3",
        install: {
            darwin: "Run `brew install python`, or install it from python.org.",
            win32: "Run `winget install -e --id Python.Python.3.12`.",
            linux: "Run `sudo apt install python3`, or the equivalent for your distribution."
        }
    },
    {
        command: "python",
        label: "Python",
        install: {
            darwin: "Run `brew install python`, or install it from python.org.",
            win32: "Run `winget install -e --id Python.Python.3.12`.",
            linux: "Run `sudo apt install python3`, or the equivalent for your distribution."
        }
    },
    {
        command: "javac",
        label: "The Java compiler (javac)",
        install: {
            darwin: "Run `brew install openjdk`, or install a JDK from adoptium.net.",
            win32: "Run `winget install -e --id EclipseAdoptium.Temurin.21.JDK`.",
            linux: "Run `sudo apt install default-jdk`, or the equivalent for your distribution."
        }
    },
    {
        command: "java",
        label: "The Java runtime (java)",
        install: {
            darwin: "Run `brew install openjdk`, or install a JDK from adoptium.net.",
            win32: "Run `winget install -e --id EclipseAdoptium.Temurin.21.JDK`.",
            linux: "Run `sudo apt install default-jre`, or the equivalent for your distribution."
        }
    }
];

/**
 * Turns "spawn g++ ENOENT" into something a beginner can act on. The command may
 * arrive as a full path, since C++ runs a built executable rather than a tool.
 */
export function describeMissingCommand(command: string): string {
    const name = basename(command);
    const toolchain = TOOLCHAINS.find((candidate) => candidate.command === name);

    if (!toolchain) {
        return `${name} was not found on your PATH.`;
    }

    const platform = os.platform();
    const instruction = platform === "darwin"
        ? toolchain.install.darwin
        : platform === "win32" ? toolchain.install.win32 : toolchain.install.linux;

    return `${toolchain.label} was not found on your PATH.\n\n${instruction}`;
}

/** True when a failure is the operating system saying the command does not exist. */
export function isMissingCommand(error: { code?: string | number } | null | undefined): boolean {
    return error?.code === "ENOENT" || error?.code === 127;
}

function basename(command: string): string {
    const separator = command.includes("\\") ? "\\" : "/";
    return command.split(separator).pop() ?? command;
}
