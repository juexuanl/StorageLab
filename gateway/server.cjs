const http = require('node:http');
const { parseRoute, prefixLocation } = require('./routing.cjs');

function createGatewayServer({
    namespace = 'storagelab',
    targetForWorkspace = name => ({
        hostname: `${name}-web.${namespace}.svc.cluster.local`,
        port: 80
    })
} = {}) {
    return http.createServer((req, res) => {
        if (req.url === '/healthz') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{"status":"ok"}');
            return;
        }
        if (req.url === '/') {
            res.writeHead(302, { Location: '/workspaces/web-demo/' });
            res.end();
            return;
        }

        const route = parseRoute(req.url);
        if (!route) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Workspace website not found.');
            return;
        }
        if (route.redirect) {
            res.writeHead(308, { Location: route.redirect });
            res.end();
            return;
        }

        const target = targetForWorkspace(route.workspace);
        const headers = {
            ...req.headers,
            host: target.hostname,
            'x-forwarded-prefix': route.prefix,
            'x-forwarded-host': req.headers.host
        };
        delete headers.connection;

        const upstream = http.request({
            ...target,
            method: req.method,
            path: route.path,
            headers
        }, incoming => {
            const responseHeaders = { ...incoming.headers };
            delete responseHeaders.connection;
            delete responseHeaders['transfer-encoding'];
            if (responseHeaders.location) {
                responseHeaders.location = prefixLocation(
                    responseHeaders.location, route.prefix
                );
            }
            res.writeHead(incoming.statusCode, responseHeaders);
            incoming.on('error', () => res.destroy());
            incoming.pipe(res);
        });

        upstream.setTimeout(15000, () => {
            upstream.destroy(Object.assign(new Error('Upstream timed out'), {
                code: 'ETIMEDOUT'
            }));
        });
        upstream.on('error', error => {
            console.error('Workspace proxy request failed:', route.workspace, error.code);
            if (res.headersSent) {
                res.destroy();
                return;
            }
            res.writeHead(error.code === 'ENOTFOUND' ? 404 : 503, {
                'Content-Type': 'text/plain'
            });
            res.end('Workspace website is unavailable. Please try again.');
        });
        req.on('aborted', () => upstream.destroy());
        res.on('close', () => {
            if (!res.writableEnded) upstream.destroy();
        });
        req.pipe(upstream);
    });
}

if (require.main === module) {
    createGatewayServer().listen(8080, '0.0.0.0', () => {
        console.log('Workspace gateway listening on port 8080');
    });
}

module.exports = { createGatewayServer };
