const express = require('express');
const { listWorkspaces, createWorkspace, getWorkspaceById, deleteWorkspace } = require('./contollers/workspace-controller');

const app = express();
app.use(express.json());
const port = 3000;

app.get('/health', (req, res) => {
    res.json({status: 'ok'});
})

app.get('/workspaces', listWorkspaces);
app.get('/workspaces/:id', getWorkspaceById);
app.post('/workspaces', createWorkspace);
app.delete('/workspaces/:id', deleteWorkspace);

app.use((error, req, res, next) => {
    console.error(error);

    res.status(500).json({
        error: 'Internal Server Error'
    });
});

app.listen(port, () => {
    console.log(`Storagelab API listening on http://localhost:${port}`); 
});