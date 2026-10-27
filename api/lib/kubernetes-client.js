const { homedir } = require('node:os');
const { join } = require('node:path');

async function loadKubernetesConfig() {
    const k8s = await import('@kubernetes/client-node');
    const kubeConfig = new k8s.KubeConfig();

    kubeConfig.loadFromFile(
        join(homedir(), '.colima', 'storagelab', 'kubeconfig')
    );

    return { k8s, kubeConfig };
}

async function createCustomObjectsClient() {
    const { k8s, kubeConfig } = await loadKubernetesConfig();
    return kubeConfig.makeApiClient(k8s.CustomObjectsApi);
}

async function createPortForwardClient() {
    const { k8s, kubeConfig } = await loadKubernetesConfig();
    return new k8s.PortForward(kubeConfig);
}

module.exports = { createCustomObjectsClient, createPortForwardClient };
