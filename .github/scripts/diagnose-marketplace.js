// Reports what the runner can actually reach, so a failed publish says which half
// is broken instead of only that something timed out.
//
// vsce reports "Request timeout: /_apis/gallery" after typed-rest-client's three
// minute socket timeout, which means the request went out and nothing came back.
// That looks the same whether the address is unreachable or the server is silent.
const dns = require('dns').promises;
const net = require('net');
const https = require('https');

const HOST = 'marketplace.visualstudio.com';
const CONNECT_TIMEOUT_MS = 10000;
const REQUEST_TIMEOUT_MS = 30000;

async function resolve() {
    const families = {};
    for (const [label, lookup] of [['A', dns.resolve4], ['AAAA', dns.resolve6]]) {
        try {
            families[label] = await lookup.call(dns, HOST);
        } catch (error) {
            families[label] = `none (${error.code})`;
        }
    }
    console.log(`DNS A     : ${families.A}`);
    console.log(`DNS AAAA  : ${families.AAAA}`);
    return families;
}

function connect(address, family) {
    return new Promise((resolve) => {
        const started = Date.now();
        const socket = net.connect({ host: address, port: 443, family });
        const finish = (outcome) => {
            socket.destroy();
            resolve(`${outcome} after ${Date.now() - started}ms`);
        };
        socket.setTimeout(CONNECT_TIMEOUT_MS, () => finish('TIMED OUT'));
        socket.on('connect', () => finish('connected'));
        socket.on('error', (error) => finish(`failed (${error.code})`));
    });
}

function request(family) {
    return new Promise((resolve) => {
        const started = Date.now();
        const req = https.request({
            host: HOST,
            path: '/_apis/public/gallery/extensionquery',
            method: 'POST',
            family,
            headers: {
                'Accept': 'application/json;api-version=3.0-preview.1',
                'Content-Type': 'application/json'
            }
        }, (res) => {
            res.resume();
            resolve(`status ${res.statusCode} after ${Date.now() - started}ms`);
        });
        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
            req.destroy();
            resolve(`TIMED OUT after ${Date.now() - started}ms`);
        });
        req.on('error', (error) => resolve(`failed (${error.code}) after ${Date.now() - started}ms`));
        req.end(JSON.stringify({ filters: [{ criteria: [{ filterType: 8, value: 'Microsoft.VisualStudio.Code' }], pageSize: 1 }], flags: 0 }));
    });
}

(async () => {
    console.log(`node      : ${process.version}`);
    console.log(`dns order : ${require('dns').getDefaultResultOrder?.() ?? 'unknown'}`);

    const families = await resolve();

    if (Array.isArray(families.A)) {
        console.log(`TCP v4    : ${await connect(families.A[0], 4)}`);
    }
    if (Array.isArray(families.AAAA)) {
        console.log(`TCP v6    : ${await connect(families.AAAA[0], 6)}`);
    }

    console.log(`HTTPS auto: ${await request(undefined)}`);
    console.log(`HTTPS v4  : ${await request(4)}`);
})();
