import * as cheerio from "cheerio";

/** Declarations that belong to the site's own page, not to a panel inside an editor. */
const AUTHOR_STYLES = /(^|;)\s*(color|background|background-color|font-family|font-size|line-height)\s*:[^;]*/gi;

/**
 * Strips the colours a judge wrote for its own page.
 *
 * NCU Online Judge stores statements with an inline colour of rgb(51, 51, 51),
 * which is near black: correct on the white page it was written for, and almost
 * invisible on a dark theme. The panel's own colours have to win.
 */
export function sanitizeStatement(html: string): string {
    if (!html.includes("style=") && !html.includes("<font")) {
        return html;
    }

    const $ = cheerio.load(html, null, false);

    $("[style]").each((_, node) => {
        const cleaned = String($(node).attr("style"))
            .replace(AUTHOR_STYLES, "")
            .replace(/^\s*;+/, "")
            .trim();

        if (cleaned) {
            $(node).attr("style", cleaned);
        } else {
            $(node).removeAttr("style");
        }
    });

    $("font").each((_, node) => {
        $(node).removeAttr("color").removeAttr("face").removeAttr("size");
    });

    return $.html();
}
