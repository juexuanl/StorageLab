import { KubeConfig, CustomObjectsApi, CoreV1Api } from '@kubernetes/client-node';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const namespace = 'storagelab';

async function ensurePersistentVolumeClaim(coreApi, workspace) {
    const name = `${workspace.metadata.name}-data`;

    try {
        return await coreApi.readNamespacedPersistentVolumeClaim({
            namespace,
            name
        });
    } catch (error) {
        if (error.code !== 404) {
            throw error;
        }
    }

    const body = {
        apiVersion: 'v1',
        kind: 'PersistentVolumeClaim',
        metadata: {
            name,
            namespace,
            ownerReferences: [{
                apiVersion: workspace.apiVersion,
                kind: workspace.kind,
                name: workspace.metadata.name,
                uid: workspace.metadata.uid,
                controller: true
            }]
        },
        spec: {
            accessModes: ['ReadWriteOnce'],
            storageClassName: workspace.spec.storageClassName,
            resources: {
                requests: {
                    storage: `${workspace.spec.sizeGiB}Gi`
                }
            }
        }
    };

    try {
        const pvc = await coreApi.createNamespacedPersistentVolumeClaim({
            namespace,
            body
        });

        console.log('Created PVC:', name);
        return pvc;
    } catch (error) {
        if (error.code !== 409) {
            throw error;
        }

        return coreApi.readNamespacedPersistentVolumeClaim({
            namespace,
            name
        });
    }
}

async function ensurePod(coreApi, workspace, pvc) {
    const name = `${workspace.metadata.name}-worker`;

    try {
        return await coreApi.readNamespacedPod({
            namespace,
            name
        });
    } catch (error) {
        if (error.code !== 404) {
            throw error;
        }
    }

    const body = {
        apiVersion: 'v1',
        kind: 'Pod',
        metadata: {
            name,
            namespace,
            ownerReferences: [{
                apiVersion: workspace.apiVersion,
                kind: workspace.kind,
                name: workspace.metadata.name,
                uid: workspace.metadata.uid,
                controller: true
            }]
        },
        spec: {
            containers: [{
                name: 'worker',
                image: 'busybox:1.37.0',
                command: ['sh', '-c', 'while true; do sleep 3600; done'],
                resources: {
                    requests: {
                        cpu: '10m',
                        memory: '16Mi'
                    },
                    limits: {
                        cpu: '100m',
                        memory: '64Mi'
                    }
                },
                volumeMounts: [{
                    name: 'data',
                    mountPath: '/data'
                }]
            }],
            volumes: [{
                name: 'data',
                persistentVolumeClaim: {
                    claimName: pvc.metadata.name
                }
            }]
        }
    };

    try {
        const pod = await coreApi.createNamespacedPod({
            namespace,
            body
        });

        console.log('Created Pod:', name);
        return pod;
    } catch (error) {
        if (error.code !== 409) {
            throw error;
        }

        return coreApi.readNamespacedPod({
            namespace,
            name
        });
    }
}

async function updateWorkspaceStatus(customObjectsApi, workspace, pvc, pod) {
    const pvcBound = pvc.status?.phase === 'Bound';
    const podReady = !pod.metadata.deletionTimestamp
        && pod.status?.conditions?.some(
            condition => condition.type === 'Ready'
                && condition.status === 'True'
        );

    const status = {
        phase: pvcBound && podReady ? 'Ready' : 'Pending',
        message: pvcBound && podReady
            ? 'Storage is bound and the worker is ready'
            : 'Waiting for storage binding or worker readiness'
    };

    if (
        workspace.status?.phase === status.phase
        && workspace.status?.message === status.message
    ) {
        return;
    }

    await customObjectsApi.replaceNamespacedCustomObjectStatus({
        group: 'storagelab.example.com',
        version: 'v1alpha1',
        namespace,
        plural: 'storageworkspaces',
        name: workspace.metadata.name,
        body: {
            apiVersion: workspace.apiVersion,
            kind: workspace.kind,
            metadata: {
                name: workspace.metadata.name,
                namespace,
                uid: workspace.metadata.uid,
                resourceVersion: workspace.metadata.resourceVersion
            },
            status
        }
    });

    console.log('Workspace status updated:', {
        workspace: workspace.metadata.name,
        ...status
    });
}

async function main() {
    const kubeConfig = new KubeConfig();

    kubeConfig.loadFromFile(
        join(homedir(), '.colima', 'storagelab', 'kubeconfig')
    );

    const customObjectsApi = kubeConfig.makeApiClient(CustomObjectsApi);

    const coreApi = kubeConfig.makeApiClient(CoreV1Api);

    console.log('StorageLab operator started');

    while (true) {
        try {
            const result = await customObjectsApi.listNamespacedCustomObject({
                group: 'storagelab.example.com',
                version: 'v1alpha1',
                namespace,
                plural: 'storageworkspaces'
            });

            for (const workspace of result.items) {
                if (workspace.metadata.deletionTimestamp) {
                    continue;
                }

                try {
                    const pvc = await ensurePersistentVolumeClaim(
                        coreApi,
                        workspace
                    );
                    const pod = await ensurePod(coreApi, workspace, pvc);

                    await updateWorkspaceStatus(
                        customObjectsApi,
                        workspace,
                        pvc,
                        pod
                    );

                    console.log('Workspace reconciled:', {
                        workspace: workspace.metadata.name,
                        requestedStorage: pvc.spec.resources.requests.storage,
                        pvcPhase: pvc.status?.phase ?? 'Pending',
                        pod: pod.metadata.name,
                        podPhase: pod.status?.phase ?? 'Pending'
                    });
                } catch (error) {
                    console.error(
                        'Workspace reconciliation failed:',
                        workspace.metadata.name,
                        error
                    );
                }
            }
        } catch (error) {
            console.error('Failed to list workspaces:', error);
        }

        await delay(5000);
    }
  
}

main().catch(error => {
    console.error('Operator failed:', error);
    process.exitCode = 1;
});