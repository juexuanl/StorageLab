const { createCustomObjectsClient } = require('../lib/kubernetes-client');

const resource = {
    group: 'storagelab.example.com',
    version: 'v1alpha1',
    namespace: 'storagelab',
    plural: 'storageworkspaces'
};

function toWorkspace(object) {
    return {
        id: object.metadata.uid,
        name: object.metadata.name,
        sizeGiB: object.spec.sizeGiB,
        webEnabled: object.spec.webEnabled === true,
        port: object.spec.webEnabled === true ? 8080 : null,
        status: {
            phase: object.status?.phase ?? 'Pending',
            message: object.status?.message ?? 'Waiting for operator reconciliation'
        }
    };
}

async function findAll() {
    const client = await createCustomObjectsClient();
    const result = await client.listNamespacedCustomObject(resource);
    return result.items.map(toWorkspace);
}

async function findById(id) {
    const workspaces = await findAll();
    return workspaces.find(workspace => workspace.id ===id );   
}

async function findByName(name) {
    const client = await createCustomObjectsClient();
    try{
        const result = await client.getNamespacedCustomObject({
            ...resource,
            name
        });
        return toWorkspace(result);
    }catch(error) {
        if(error.code === 404) {
            return undefined;
        }
        throw error;
    }
}

async function save(workspace) {
    const client = await createCustomObjectsClient();

    try {
        const result = await client.createNamespacedCustomObject({
            ...resource,
            body: {
                apiVersion: `${resource.group}/${resource.version}`,
                kind: 'StorageWorkspace',
                metadata: {
                    name: workspace.name,
                    namespace: resource.namespace
                },
                spec: {
                    sizeGiB: workspace.sizeGiB,
                    webEnabled: workspace.webEnabled
                }
            }
        });

        return toWorkspace(result);
    } catch (error) {
        if (error.code === 409) {
            return null;
        }

        throw error;
    }
}

async function deleteById(id) {
    const workspace = await findById(id);
    if(!workspace) {
        return false;
    }
    const client = await createCustomObjectsClient();
    try{
        await client.deleteNamespacedCustomObject({
            ...resource,
            name: workspace.name,
            body: {
                preconditions: {
                    uid: workspace.id
                }
            }
        });
        return true;
    }catch(error) {
        if(error.code === 404) {
            return false;
        }
        throw error;
    }
}

module.exports = {
    findAll,
    findById,
    findByName,
    save,
    deleteById
}
