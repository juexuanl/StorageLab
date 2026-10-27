const namespace = 'storagelab';
const configName = 'storagelab-public-access';
const gatewayOrigin = 'http://workspace-gateway.storagelab.svc.cluster.local:80';
const urlPattern = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

function isReady(pod) {
    return pod && !pod.metadata.deletionTimestamp
        && pod.status?.conditions?.some(
            condition => condition.type === 'Ready' && condition.status === 'True'
        );
}

export async function refreshPublicAccess(coreApi) {
    const [tunnels, gateways] = await Promise.all([
        coreApi.listNamespacedPod({
            namespace,
            labelSelector: 'app.kubernetes.io/name=web-demo-tunnel'
        }),
        coreApi.listNamespacedPod({
            namespace,
            labelSelector: 'app.kubernetes.io/name=workspace-gateway'
        })
    ]);

    let config;
    try {
        config = await coreApi.readNamespacedConfigMap({ namespace, name: configName });
    } catch (error) {
        if (error.code !== 404) throw error;
    }

    const pod = tunnels.items
        .filter(item => !item.metadata.deletionTimestamp)
        .sort((a, b) => new Date(b.metadata.creationTimestamp ?? 0).getTime()
            - new Date(a.metadata.creationTimestamp ?? 0).getTime())[0];
    const uid = pod?.metadata.uid ?? '';
    const restartCount = String(pod?.status?.containerStatuses?.find(
        container => container.name === 'cloudflared'
    )?.restartCount ?? 0);
    let baseUrl = '';

    if (pod?.status?.phase === 'Running') {
        if (config?.data?.tunnelPodUid === uid
            && config.data.tunnelRestartCount === restartCount) {
            baseUrl = config.data.baseUrl ?? '';
            if (!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(baseUrl)) baseUrl = '';
        }
        if (!baseUrl) {
            try {
                const logs = await coreApi.readNamespacedPodLog({
                    namespace,
                    name: pod.metadata.name,
                    container: 'cloudflared',
                    tailLines: 300
                });
                baseUrl = logs.match(urlPattern)?.[0] ?? '';
            } catch (error) {
                if (error.code !== 400 && error.code !== 404) throw error;
            }
        }
    }

    const correctOrigin = pod?.spec?.containers?.some(
        container => container.name === 'cloudflared'
            && container.args?.includes(gatewayOrigin)
    );
    const ready = Boolean(baseUrl && correctOrigin && isReady(pod)
        && gateways.items.some(isReady));
    const data = { baseUrl, tunnelPodUid: uid,
        tunnelRestartCount: restartCount, ready: String(ready) };

    if (!config || Object.entries(data).some(([key, value]) => config.data?.[key] !== value)) {
        const body = {
            apiVersion: 'v1',
            kind: 'ConfigMap',
            metadata: {
                name: configName,
                namespace,
                ...(config ? { resourceVersion: config.metadata.resourceVersion } : {})
            },
            data
        };
        if (config) {
            await coreApi.replaceNamespacedConfigMap({ namespace, name: configName, body });
        } else {
            await coreApi.createNamespacedConfigMap({ namespace, body });
        }
    }

    return { ready, baseUrl: ready ? baseUrl : '' };
}
