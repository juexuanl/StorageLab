const workspaceService = require('../services/workspace-service');

async function openWorkspace(req, res, next) {
    try {
        const workspace = await workspaceService.getWorkspaceById(req.params.id);
        if (!workspace) {
            return res.status(404).json({error: 'Workspace not found'});
        }
        if (!workspace.webEnabled) {
            return res.status(409).json({error: 'Web Server is not enabled for this workspace'});
        }
        if (workspace.status.phase !== 'Ready') {
            return res.status(409).json({error: 'Workspace is not ready yet'});
        }
        if (!workspace.publicUrl) {
            return res.status(409).json({error: 'Public website access is not ready yet'});
        }

        res.set('Cache-Control', 'no-store');
        return res.redirect(302, workspace.publicUrl);
    } catch (error) {
        next(error);
    }
}

async function listWorkspaces(req, res, next) {
    try{
        const workspaces = await workspaceService.listWorkspaces();
        res.json({workspaces});
    }catch(error) {
        next(error);
    }
    
}

async function getWorkspaceById(req, res, next) {
    try{
        const workspace = await workspaceService.getWorkspaceById(req.params.id);
        if(!workspace) {
            return res.status(404).json({error: 'Workspace not found'});
        }
        res.json({workspace});
    }catch(error) {
        next(error);
    }
}

async function createWorkspace(req, res, next) {
    const { name, sizeGiB, webEnabled = false } = req.body ?? {};
    if(typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({error: 'Name must be a non-empty string'});
    }
    const validName = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

    if (!validName.test(name.trim())) {
        return res.status(400).json({
            error: 'name must be 1-63 lowercase letters, digits, or hyphens, starting and ending with a letter or digit'
        });
    }
    if(!Number.isInteger(sizeGiB) || sizeGiB <= 0) {
        return res.status(400).json({error: 'Size must be a positive integer'});
    }
    if (typeof webEnabled !== 'boolean') {
        return res.status(400).json({error: 'webEnabled must be a boolean'});
    }
    try{
        const workspace = await workspaceService.createWorkspace(name.trim(), sizeGiB, webEnabled);
        if(workspace === null) {
            return res.status(409).json({error: 'Workspace with this name already exists'});
        }
        res.status(201).json({workspace});
    }catch(error) {
        next(error);
    }
}

async function deleteWorkspace(req, res, next) {
    try{
        const deleted = await workspaceService.deleteWorkspace(req.params.id);
        if(!deleted) {
            return res.status(404).json({error: 'Workspace not found'});
        }
        return res.status(204).end();
    }catch(error) {
        next(error);
    }
}

module.exports = {
    openWorkspace,
    listWorkspaces,
    createWorkspace,
    getWorkspaceById,
    deleteWorkspace
}
