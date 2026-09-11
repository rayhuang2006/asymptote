const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Sites that are not behind a browser check are fetched directly, which costs a
 * request rather than a browser launch.
 */
export async function fetchText(url: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            headers: {
                "User-Agent": USER_AGENT,
                "Accept-Language": "en-US,en;q=0.9"
            },
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`${url} responded with ${response.status}`);
        }

        return await response.text();
    } catch (error: any) {
        if (error?.name === "AbortError") {
            throw new Error(`Timed out after ${timeoutMs / 1000}s requesting ${url}`);
        }
        throw error;
    } finally {
        clearTimeout(timer);
    }
}
