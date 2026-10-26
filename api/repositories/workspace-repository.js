const workspaces = [];

async function findAll() {
    return [...workspaces];
}

async function findById(id) {
    return workspaces.find(workspace => workspace.id ===id );   
}

async function findByName(name) {
    return workspaces.find(workspace => workspace.name === name);
}

async function save(workspace) {
    workspaces.push(workspace);
    return workspace;
}

async function deleteById(id) {
    const index = workspaces.findIndex(workspace => workspace.id === id );
    if(index === -1) {
        return false;
    }
    workspaces.splice(index, 1);
    return true;
}

module.exports = {
    findAll,
    findById,
    findByName,
    save,
    deleteById
}