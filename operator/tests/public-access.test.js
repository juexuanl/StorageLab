import assert from 'node:assert/strict';
import test from 'node:test';
import { refreshPublicAccess } from '../lib/public-access.js';

function fixture() {
    const state = { uid: 'pod-one', gatewayReady: true, originCorrect: true,
        logUrl: 'https://first.trycloudflare.com', restartCount: 0, writes: 0, logReads: 0 };
    const client = {
        async listNamespacedPod({ labelSelector }) {
            const tunnel = labelSelector.includes('web-demo-tunnel');
            return { items: [{
                metadata: { name: tunnel ? 'tunnel' : 'gateway', uid: state.uid },
                spec: { containers: [{ name: 'cloudflared', args: [state.originCorrect
                    ? 'http://workspace-gateway.storagelab.svc.cluster.local:80'
                    : 'http://web-demo-web:80'] }] },
                status: { phase: 'Running', containerStatuses: [{
                    name: 'cloudflared', restartCount: state.restartCount
                }], conditions: [{ type: 'Ready',
                    status: tunnel || state.gatewayReady ? 'True' : 'False' }] }
            }] };
        },
        async readNamespacedConfigMap() {
            if (!state.config) throw Object.assign(new Error('Not found'), { code: 404 });
            return structuredClone(state.config);
        },
        async readNamespacedPodLog() {
            state.logReads += 1;
            return `Your tunnel: ${state.logUrl}`;
        },
        async createNamespacedConfigMap({ body }) {
            state.writes += 1;
            state.config = structuredClone(body);
            state.config.metadata.resourceVersion = String(state.writes);
        },
        async replaceNamespacedConfigMap({ body }) {
            return this.createNamespacedConfigMap({ body });
        }
    };
    return { state, client };
}

test('Shared access publishes once and reuses the URL while the tunnel Pod is unchanged', async () => {
    const { state, client } = fixture();
    assert.deepEqual(await refreshPublicAccess(client), {
        ready: true, baseUrl: state.logUrl
    });
    await refreshPublicAccess(client);
    assert.equal(state.writes, 1);
    assert.equal(state.logReads, 1);
});

test('A replacement tunnel Pod publishes its new URL automatically', async () => {
    const { state, client } = fixture();
    await refreshPublicAccess(client);
    state.uid = 'pod-two';
    state.logUrl = 'https://second.trycloudflare.com';
    assert.deepEqual(await refreshPublicAccess(client), {
        ready: true, baseUrl: state.logUrl
    });
    assert.equal(state.config.data.tunnelPodUid, 'pod-two');
});

test('A restarted container refreshes its URL even when the Pod UID is unchanged', async () => {
    const { state, client } = fixture();
    await refreshPublicAccess(client);
    state.restartCount = 1;
    state.logUrl = 'https://restarted.trycloudflare.com';
    assert.deepEqual(await refreshPublicAccess(client), {
        ready: true, baseUrl: state.logUrl
    });
    assert.equal(state.config.data.tunnelRestartCount, '1');
});

test('A failed gateway or a tunnel aimed at the old single Service cannot publish access', async () => {
    const { state, client } = fixture();
    await refreshPublicAccess(client);
    state.gatewayReady = false;
    assert.deepEqual(await refreshPublicAccess(client), { ready: false, baseUrl: '' });
    state.gatewayReady = true;
    state.originCorrect = false;
    assert.deepEqual(await refreshPublicAccess(client), { ready: false, baseUrl: '' });
});
