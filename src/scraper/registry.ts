import { SiteAdapter } from "./types";
import { atcoderAdapter } from "./sites/atcoder";
import { codeforcesAdapter } from "./sites/codeforces";
import { ncuOjAdapter } from "./sites/ncuOj";

export const adapters: SiteAdapter[] = [codeforcesAdapter, atcoderAdapter, ncuOjAdapter];

export function parseUrl(rawUrl: string): URL {
    try {
        return new URL(rawUrl.trim());
    } catch {
        throw new Error(`${rawUrl} is not a valid URL.`);
    }
}

/**
 * An unknown host used to fall through to whichever parser happened to be last,
 * which produced an empty problem instead of an error.
 */
export function resolveAdapter(url: URL): SiteAdapter {
    const adapter = adapters.find((candidate) => candidate.matches(url));

    if (!adapter) {
        const supported = adapters.map((candidate) => candidate.name).join(", ");
        throw new Error(`${url.hostname} is not supported yet. Asymptote can read: ${supported}.`);
    }

    return adapter;
}
