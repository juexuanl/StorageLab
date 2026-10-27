const assert = require('node:assert/strict');
const http = require('node:http');
const { test } = require('node:test');
const { createGatewayServer } = require('../server.cjs');
const { parseRoute, prefixLocation } = require('../routing.cjs');

async function listen(server) {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return server.address().port;
}

async function close(server) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
}

test('Workspace routes validate names and preserve paths and query strings', () => {
    assert.deepEqual(parseRoute('/workspaces/demo/assets/app.js?v=2'), {
        workspace: 'demo', prefix: '/workspaces/demo/',
        path: '/assets/app.js?v=2', redirect: null
    });
    assert.equal(parseRoute('/workspaces/demo?x=1').redirect, '/workspaces/demo/?x=1');
    for (const path of ['/assets/app.js', '/workspaces/UPPER/', '/workspaces/a.b/',
        '/workspaces/%2f/', 'http://other.example/', '//other.example/']) {
        assert.equal(parseRoute(path), null);
    }
    assert.equal(prefixLocation('/login', '/workspaces/demo/'), '/workspaces/demo/login');
    assert.equal(prefixLocation('https://other.example/', '/workspaces/demo/'), 'https://other.example/');
});

test('The gateway separates websites and preserves scripts, images, queries, and POST bodies', async () => {
    const image = Buffer.from([0, 255, 137, 80, 78, 71, 13, 10]);
    const origins = new Map();
    const servers = [];
    let gateway;
    try {
        for (const name of ['alpha', 'beta']) {
            const server = http.createServer((req, res) => {
                if (req.url === '/image.png') {
                    res.writeHead(200, { 'Content-Type': 'image/png' });
                    res.end(image);
                } else if (req.url === '/redirect') {
                    res.writeHead(302, { Location: '/next' });
                    res.end();
                } else if (req.url === '/assets/app.js?v=2') {
                    res.setHeader('Content-Type', 'text/javascript');
                    res.end(`console.log('${name}');`);
                } else if (req.method === 'POST') {
                    const chunks = [];
                    req.on('data', chunk => chunks.push(chunk));
                    req.on('end', () => res.end(Buffer.concat(chunks)));
                } else {
                    res.end(`<h1>${name}</h1>`);
                }
            });
            origins.set(name, await listen(server));
            servers.push(server);
        }
        gateway = createGatewayServer({
            targetForWorkspace: name => ({ hostname: '127.0.0.1', port: origins.get(name) })
        });
        const base = `http://127.0.0.1:${await listen(gateway)}`;
        for (const name of origins.keys()) {
            const url = `${base}/workspaces/${name}/`;
            assert.equal(await (await fetch(url)).text(), `<h1>${name}</h1>`);
            const script = await fetch(`${url}assets/app.js?v=2`);
            assert.equal(await script.text(), `console.log('${name}');`);
            const binary = await fetch(`${url}image.png`);
            assert.equal(binary.headers.get('content-type'), 'image/png');
            assert.deepEqual(Buffer.from(await binary.arrayBuffer()), image);
            const posted = await fetch(`${url}submit`, { method: 'POST', body: 'hello' });
            assert.equal(await posted.text(), 'hello');
            const redirect = await fetch(`${url}redirect`, { redirect: 'manual' });
            assert.equal(redirect.headers.get('location'), `/workspaces/${name}/next`);
        }
        const invalid = await fetch(`${base}/workspaces/invalid.name/`);
        assert.equal(invalid.status, 404);
        await invalid.text();
    } finally {
        if (gateway) await close(gateway);
        await Promise.all(servers.map(close));
    }
});
