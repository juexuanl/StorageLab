const net = require('node:net');
const { Writable } = require('node:stream');
const { createPortForwardClient } = require('../lib/kubernetes-client');
const workspaceRepository = require('../repositories/workspace-repository');

const namespace = 'storagelab';
const accessServers = new Map();

async function startAccessServer(workspace) {
    const forwarder = await createPortForwardClient();
    const sockets = new Set();
    const connections = new Set();

    const server = net.createServer(async socket => {
        sockets.add(socket);
        socket.on('error', () => socket.destroy());
        socket.on('close', () => sockets.delete(socket));
        socket.setTimeout(60000, () => socket.destroy());

        try {
            // Bind access to the CR UID, including when a name is later reused.
            const current = await workspaceRepository.findById(workspace.id);
            if (!current || !current.webEnabled) {
                socket.destroy();
                await closeWorkspaceAccess(workspace.id);
                return;
            }

            const errors = new Writable({
                write(chunk, encoding, callback) {
                    if (chunk.length > 0) {
                        console.error('Workspace forwarding failed:', chunk.toString());
                        socket.destroy();
                    }
                    callback();
                }
            });

            // Resolve the Service again for each TCP connection after Pod recreation.
            const connection = await forwarder.portForwardService(
                namespace,
                `${workspace.name}-web`,
                [8080],
                socket,
                errors,
                socket
            );

            if (socket.destroyed) {
                connection.close();
                return;
            }

            connections.add(connection);
            socket.on('close', () => connection.close());
            connection.on('error', () => socket.destroy());
            connection.on('close', () => {
                connections.delete(connection);
                socket.end();
            });
        } catch (error) {
            console.error('Workspace access failed:', workspace.name, error.message);
            socket.destroy();
        }
    });

    // Allocate a distinct loopback port without exposing it on the LAN.
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            server.removeListener('error', reject);
            resolve();
        });
    });
    server.on('error', error => {
        console.error('Workspace access listener failed:', error.message);
    });
    server.unref();

    return {
        url: `http://127.0.0.1:${server.address().port}/`,
        async close() {
            for (const socket of sockets) socket.destroy();
            for (const connection of connections) connection.close();
            await new Promise(resolve => server.close(resolve));
        }
    };
}

async function getWorkspaceAccessUrl(workspace) {
    // Cache the promise too, so simultaneous clicks create only one listener.
    let pending = accessServers.get(workspace.id);
    if (!pending) {
        pending = startAccessServer(workspace);
        accessServers.set(workspace.id, pending);
        pending.catch(() => {
            if (accessServers.get(workspace.id) === pending) {
                accessServers.delete(workspace.id);
            }
        });
    }
    return (await pending).url;
}

async function closeWorkspaceAccess(id) {
    const pending = accessServers.get(id);
    accessServers.delete(id);
    if (pending) {
        const access = await pending.catch(() => null);
        if (access) await access.close();
    }
}

module.exports = { getWorkspaceAccessUrl, closeWorkspaceAccess };
