const { homedir } = require('node:os');
const { join } = require('node:path');

async function createCustomObjectsClient() {
    const k8s = await import('@kubernetes/client-node');
    const kubeConfig = new k8s.KubeConfig();

    kubeConfig.loadFromFile(
        join(homedir(), '.colima', 'storagelab', 'kubeconfig')
    );

    return kubeConfig.makeApiClient(k8s.CustomObjectsApi);
}

module.exports = { createCustomObjectsClient };