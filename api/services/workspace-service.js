const workspaceRepository = require('../repositories/workspace-repository');
const { closeWorkspaceAccess } = require('./workspace-access-service');


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
    const deleted = await workspaceRepository.deleteById(id);
    await closeWorkspaceAccess(id);
    return deleted;
}

module.exports = {
    listWorkspaces,
    createWorkspace,
    getWorkspaceById,
    deleteWorkspace
}
