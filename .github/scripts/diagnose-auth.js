// Makes one authenticated request and reports what the server actually said.
//
// The publish failure returned an HTML page rather than an API response, which
// means something in front of the API answered instead. The page carries the
// reason; the log only ever showed its stylesheet.
//
// The token is read from the environment and never printed.
const https = require('https');

const HOST = 'marketplace.visualstudio.com';
const PATH = '/_apis/gallery/publishers/rayhuang2006/extensions?api-version=3.0-preview.1';
const TIMEOUT_MS = 45000;

const INTERESTING_HEADERS = [
    'content-type', 'retry-after', 'x-ratelimit-limit', 'x-ratelimit-remaining',
    'x-ratelimit-reset', 'x-ratelimit-resource', 'x-ratelimit-delay',
    'x-tfs-serviceerror', 'x-tfs-processid', 'x-vss-e2eid', 'activityid',
    'www-authenticate', 'x-msedge-ref', 'location', 'server'
];

function textOf(html) {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function request(token) {
    return new Promise((resolve) => {
        const started = Date.now();
        const req = https.request({
            host: HOST,
            path: PATH,
            method: 'GET',
            headers: {
                'Accept': 'application/json;api-version=3.0-preview.1',
                'Authorization': `Basic ${Buffer.from(`:${token}`).toString('base64')}`,
                'User-Agent': 'asymptote-publish-diagnostic'
            }
        }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body, ms: Date.now() - started }));
        });
        req.setTimeout(TIMEOUT_MS, () => {
            req.destroy();
            resolve({ status: 'TIMED OUT', headers: {}, body: '', ms: Date.now() - started });
        });
        req.on('error', (error) => resolve({ status: `error ${error.code}`, headers: {}, body: '', ms: Date.now() - started }));
        req.end();
    });
}

(async () => {
    const token = process.env.VSCE_PAT;
    if (!token) {
        console.log('VSCE_PAT is not set; skipping the authenticated check.');
        return;
    }

    const result = await request(token);
    console.log(`status    : ${result.status} after ${result.ms}ms`);

    for (const name of INTERESTING_HEADERS) {
        if (result.headers[name]) {
            console.log(`${name.padEnd(10)}: ${result.headers[name]}`);
        }
    }

    if (!result.body) {
        return;
    }

    const isHtml = /^\s*<!DOCTYPE|^\s*<html/i.test(result.body);
    console.log(`body      : ${isHtml ? 'HTML page' : 'not HTML'}, ${result.body.length} bytes`);
    console.log(`body text : ${textOf(result.body).slice(0, 800)}`);
})();
