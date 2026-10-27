const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { test } = require('node:test');

const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';

async function request(path, options = {}) {
    return fetch(new URL(path, baseUrl), {
        ...options,
        redirect: 'manual',
        signal: AbortSignal.timeout(10000)
    });
}

async function waitUntilReady(id) {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
        const response = await request(`/workspaces/${id}`);
        assert.equal(response.status, 200);
        const { workspace } = await response.json();
        if (workspace.status.phase === 'Ready') return;
        await delay(1000);
    }
    assert.fail('Workspace did not become Ready. Start the Operator before this test.');
}

test('Web access provides separate reusable listeners and closes them on deletion', {
    timeout: 120000
}, async () => {
    const created = [];
    try {
        for (let index = 0; index < 2; index += 1) {
            const response = await request('/workspaces', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: `access-${randomUUID()}`,
                    sizeGiB: 1,
                    webEnabled: true
                })
            });
            const { workspace } = await response.json();
            if (workspace?.id) created.push({ id: workspace.id });
            assert.equal(response.status, 201);
        }

        await Promise.all(created.map(workspace => waitUntilReady(workspace.id)));

        for (const workspace of created) {
            const path = `/workspaces/${workspace.id}/access`;
            const response = await request(path);
            assert.equal(response.status, 302);
            assert.equal(response.headers.get('cache-control'), 'no-store');
            workspace.url = response.headers.get('location');
            assert.equal(new URL(workspace.url).hostname, '127.0.0.1');

            const repeated = await request(path);
            assert.equal(repeated.headers.get('location'), workspace.url);

            const homepage = await fetch(workspace.url, {
                signal: AbortSignal.timeout(10000)
            });
            assert.equal(homepage.status, 200);
            assert.match(await homepage.text(), /StorageLab Web Workspace/);

            const missing = await fetch(new URL('/missing-file', workspace.url), {
                signal: AbortSignal.timeout(10000)
            });
            assert.equal(missing.status, 404);
            await missing.arrayBuffer();
        }

        assert.notEqual(created[0].url, created[1].url);
    } finally {
        for (const workspace of created) {
            const removed = await request(`/workspaces/${workspace.id}`, {
                method: 'DELETE'
            });
            assert.ok([204, 404].includes(removed.status), 'Test workspace cleanup failed');
            if (workspace.url) {
                await assert.rejects(fetch(workspace.url, {
                    signal: AbortSignal.timeout(2000)
                }), 'The local access listener should close after deletion');
            }
        }
    }
});
