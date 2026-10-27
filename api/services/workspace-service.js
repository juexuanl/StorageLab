const workspaceRepository = require('../repositories/workspace-repository');


async function listWorkspaces() {
    return workspaceRepository.findAll();
}

async function getWorkspaceById(id) {
    return workspaceRepository.findById(id);
}

async function createWorkspace(name, sizeGiB, webEnabled = false) {
    const exist = await workspaceRepository.findByName(name);
    if(exist) {
        return null;
    }
    return workspaceRepository.save({ name, sizeGiB, webEnabled });
}

async function deleteWorkspace(id) {
    return workspaceRepository.deleteById(id);
}

module.exports = {
    listWorkspaces,
    createWorkspace,
    getWorkspaceById,
    deleteWorkspace
}
