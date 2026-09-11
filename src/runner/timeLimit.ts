/** Falls back to this when a site reports no limit, or reports one we cannot read. */
export const DEFAULT_TIME_LIMIT_MS = 2000;

const UNITS: { pattern: RegExp; toMilliseconds: (value: number) => number }[] = [
    { pattern: /^(?:ms|msec|msecs|millisecond|milliseconds)$/, toMilliseconds: (value) => value },
    { pattern: /^(?:s|sec|secs|second|seconds)$/, toMilliseconds: (value) => value * 1000 },
    { pattern: /^(?:m|min|mins|minute|minutes)$/, toMilliseconds: (value) => value * 60000 }
];

/**
 * Reads the limit as each judge writes it: Codeforces says "2 seconds", AtCoder
 * says "2 sec", and a judge that reports milliseconds says so.
 */
export function parseTimeLimit(text: string | undefined | null): number | undefined {
    if (!text) {
        return undefined;
    }

    const match = /(\d+(?:[.,]\d+)?)\s*([a-z]+)/i.exec(text.trim());
    if (!match) {
        return undefined;
    }

    const value = Number(match[1].replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
        return undefined;
    }

    const unit = match[2].toLowerCase();
    const known = UNITS.find((candidate) => candidate.pattern.test(unit));

    return known ? Math.round(known.toMilliseconds(value)) : undefined;
}

/** The limit to enforce for a problem, which is the problem's own when it has one. */
export function resolveTimeLimit(text: string | undefined | null): number {
    return parseTimeLimit(text) ?? DEFAULT_TIME_LIMIT_MS;
}
