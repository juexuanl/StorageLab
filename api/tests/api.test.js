const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');

const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';

async function request(method, path, body) {
    let response;
    try {
        response = await fetch(new URL(path, baseUrl), {
            method,
            headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(5000)
        });
    } catch (error) {
        throw new Error(`Cannot reach ${baseUrl}. Start the API before running tests.`, {
            cause: error
        });
    }

    const text = await response.text();
    const data = text ? JSON.parse(text) : undefined;
    return { status: response.status, data, text };
}

function expectStatus(response, expected) {
    assert.equal(response.status, expected,
        `Expected HTTP ${expected}, received ${response.status}: ${response.text}`);
}

function expectWorkspace(actual, expected) {
    const { status, ...details } = actual;

    assert.deepEqual(details, {
        webEnabled: false,
        port: null,
        ...expected
    });
    assert.ok(['Pending', 'Ready'].includes(status.phase));
    assert.equal(typeof status.message, 'string');
    assert.ok(status.message.length > 0);
}

test('GET /health reports a healthy server', async () => {
    const response = await request('GET', '/health');
    expectStatus(response, 200);
    assert.deepEqual(response.data, { status: 'ok' });
});

test('Invalid requests return 400 without changing the workspace list', async () => {
    const before = await request('GET', '/workspaces');
    expectStatus(before, 200);
    assert.ok(Array.isArray(before.data.workspaces));

    const invalidBodies = [
        {},
        { name: '   ', sizeGiB: 1 },
        { name: 123, sizeGiB: 1 },
        { name: 'invalid-size', sizeGiB: 0 },
        { name: 'invalid-size', sizeGiB: -1 },
        { name: 'invalid-size', sizeGiB: 1.5 },
        { name: 'invalid-size', sizeGiB: '1' },
        { name: 'invalid-web', sizeGiB: 1, webEnabled: 'true' },
        { name: 'invalid-web', sizeGiB: 1, webEnabled: 1 },
        { name: 'invalid-web', sizeGiB: 1, webEnabled: null },
        { name: 'invalid-web', sizeGiB: 1, webEnabled: {} }
    ];

    for (const body of invalidBodies) {
        const response = await request('POST', '/workspaces', body);
        expectStatus(response, 400);
        assert.equal(typeof response.data.error, 'string');
        assert.ok(response.data.error.length > 0);
    }

    const after = await request('GET', '/workspaces');
    expectStatus(after, 200);
    const withoutStatus = workspaces => workspaces.map(
        ({ status, ...workspace }) => workspace
    );

    assert.deepEqual(
        withoutStatus(after.data.workspaces),
        withoutStatus(before.data.workspaces)
    );
});

test('Unknown workspace IDs return 404 for queries and deletion', async () => {
    const path = `/workspaces/${randomUUID()}`;
    for (const method of ['GET', 'DELETE']) {
        const response = await request(method, path);
        expectStatus(response, 404);
        assert.equal(response.data.error, 'Workspace not found');
    }
    expectStatus(await request('GET', `${path}/access`), 404);
});

test('Workspace lifecycle: create, reject duplicate, query, delete, and verify removal', async () => {
    const name = `smoke-${randomUUID()}`;
    let workspaceId;

    try {
        const created = await request('POST', '/workspaces', { name, sizeGiB: 1 });
        workspaceId = created.data?.workspace?.id;
        expectStatus(created, 201);
        assert.equal(typeof workspaceId, 'string');
        assert.ok(workspaceId.length > 0);
        expectWorkspace(created.data.workspace, {
            id: workspaceId,
            name,
            sizeGiB: 1
        });
        const duplicate = await request('POST', '/workspaces', { name, sizeGiB: 1 });
        expectStatus(duplicate, 409);

        const listed = await request('GET', '/workspaces');
        expectStatus(listed, 200);
        assert.equal(listed.data.workspaces.filter(workspace => workspace.name === name).length, 1);

        const path = `/workspaces/${encodeURIComponent(workspaceId)}`;
        const found = await request('GET', path);
        expectStatus(found, 200);
        expectWorkspace(found.data.workspace, {
            id: workspaceId,
            name,
            sizeGiB: 1
        });

        const deleted = await request('DELETE', path);
        expectStatus(deleted, 204);
        assert.equal(deleted.text, '');

        expectStatus(await request('GET', path), 404);
        expectStatus(await request('DELETE', path), 404);

        const remaining = await request('GET', '/workspaces');
        expectStatus(remaining, 200);
        assert.ok(!remaining.data.workspaces.some(workspace => workspace.id === workspaceId));
        workspaceId = undefined;
    } finally {
        // Only clean up the record created by this test, preserving existing workspaces.
        if (workspaceId) {
            const cleanup = await request('DELETE', `/workspaces/${encodeURIComponent(workspaceId)}`);
            assert.ok([204, 404].includes(cleanup.status), 'Test workspace cleanup failed');
        }
    }
});

test('Workspace creation preserves both Web Server choices', async () => {
    for (const webEnabled of [false, true]) {
        const name = `web-option-${randomUUID()}`;
        let workspaceId;

        try {
            const created = await request('POST', '/workspaces', {
                name,
                sizeGiB: 1,
                webEnabled
            });
            workspaceId = created.data?.workspace?.id;
            expectStatus(created, 201);
            assert.equal(typeof workspaceId, 'string');

            const expected = {
                id: workspaceId,
                name,
                sizeGiB: 1,
                webEnabled,
                port: webEnabled ? 8080 : null
            };

            expectWorkspace(created.data.workspace, expected);

            const found = await request('GET', `/workspaces/${workspaceId}`);
            expectStatus(found, 200);
            expectWorkspace(found.data.workspace, expected);

            if (!webEnabled) {
                const access = await request('GET', `/workspaces/${workspaceId}/access`);
                expectStatus(access, 409);
                assert.equal(access.data.error, 'Web Server is not enabled for this workspace');
            }

            const listed = await request('GET', '/workspaces');
            expectStatus(listed, 200);
            expectWorkspace(
                listed.data.workspaces.find(workspace => workspace.id === workspaceId),
                expected
            );
        } finally {
            if (workspaceId) {
                const cleanup = await request('DELETE', `/workspaces/${workspaceId}`);
                assert.ok([204, 404].includes(cleanup.status), 'Test workspace cleanup failed');
            }
        }
    }
});
