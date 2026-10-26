import kubernetesClient from '../lib/kubernetes-client.js';

async function main() {
    const client = await kubernetesClient.createCustomObjectsClient();

    const result = await client.listNamespacedCustomObject({
        group: 'storagelab.example.com',
        version: 'v1alpha1',
        namespace: 'storagelab',
        plural: 'storageworkspaces'
    });

    for (const workspace of result.items) {
        console.log({
            name: workspace.metadata.name,
            sizeGiB: workspace.spec.sizeGiB,
            storageClassName: workspace.spec.storageClassName
        });
    }
}

main().catch(error => {
    console.error('Kubernetes connection check failed:', error.message);
    process.exitCode = 1;
});