const { homedir } = require('node:os');
const { join } = require('node:path');

let customObjectsClientPromise;

async function loadKubernetesConfig() {
    const k8s = await import('@kubernetes/client-node');
    const kubeConfig = new k8s.KubeConfig();

    kubeConfig.loadFromFile(
        join(homedir(), '.colima', 'storagelab', 'kubeconfig')
    );

    return { k8s, kubeConfig };
}

function createCustomObjectsClient() {
    if (!customObjectsClientPromise) {
        customObjectsClientPromise = loadKubernetesConfig()
            .then(({ k8s, kubeConfig }) =>
                kubeConfig.makeApiClient(k8s.CustomObjectsApi)
            )
            .catch(error => {
                customObjectsClientPromise = undefined;
                throw error;
            });
    }

    return customObjectsClientPromise;
}

module.exports = { createCustomObjectsClient };
