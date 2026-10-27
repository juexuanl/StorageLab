import { useEffect, useRef, useState } from 'react';

function App() {
    const [workspaces, setWorkspaces] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [name, setName] = useState('');
    const [sizeGiB, setSizeGiB] = useState('1');
    const [webEnabled, setWebEnabled] = useState(false);
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState('');
    const [createMessage, setCreateMessage] = useState('');
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const [deleteMessage, setDeleteMessage] = useState('');
    const deleteDialog = useRef(null);
    const listRevision = useRef(0);

    useEffect(() => {
        if (deleteTarget && !deleteDialog.current.open) {
            deleteDialog.current.showModal();
        } else if (!deleteTarget && deleteDialog.current.open) {
            deleteDialog.current.close();
        }
    }, [deleteTarget]);

    useEffect(() => {
        const controller = new AbortController();
        let refreshTimer;

        async function loadWorkspaces() {
            const revision = listRevision.current;

            try {
                const response = await fetch('/api/workspaces', {
                    signal: AbortSignal.any([
                        controller.signal,
                        AbortSignal.timeout(10000)
                    ])
                });

                if (!response.ok) {
                    throw new Error(
                        `Failed to load workspaces (HTTP ${response.status})`
                    );
                }

                const data = await response.json();

                if (!controller.signal.aborted) {
                    if (revision === listRevision.current) {
                        setWorkspaces(data.workspaces);
                    }
                    setError('');
                }
            } catch (error) {
                if (!controller.signal.aborted) {
                    setError(`${error.message}. Retrying automatically.`);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                    refreshTimer = setTimeout(loadWorkspaces, 3000);
                }
            }
        }

        loadWorkspaces();

        return () => {
            controller.abort();
            clearTimeout(refreshTimer);
        };
    }, []);

    async function handleCreate(event) {
        event.preventDefault();

        if (creating) {
            return;
        }

        setCreateError('');
        setCreateMessage('');

        const requestedSize = Number(sizeGiB);

        if (!Number.isInteger(requestedSize) || requestedSize < 1) {
            setCreateError('Size must be a positive integer');
            return;
        }

        setCreating(true);

        try {
            const response = await fetch('/api/workspaces', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: name.trim(),
                    sizeGiB: requestedSize,
                    webEnabled
                })
            });

            const data = await response.json();

            if (response.status !== 201) {
                throw new Error(
                    data.error ?? `Creation failed (HTTP ${response.status})`
                );
            }

            // Discard any list response started before this change completed.
            listRevision.current += 1;
            setWorkspaces(current => (
                current.some(workspace => workspace.id === data.workspace.id)
                    ? current
                    : [...current, data.workspace]
            ));
            setCreateMessage(`Created workspace "${data.workspace.name}".`);
            setName('');
            setWebEnabled(false);
        } catch (error) {
            setCreateError(error.message);
        } finally {
            setCreating(false);
        }
    }

    async function handleDelete() {
        if (!deleteTarget || deleting) {
            return;
        }

        setDeleting(true);
        setDeleteError('');

        try {
            const response = await fetch(
                `/api/workspaces/${encodeURIComponent(deleteTarget.id)}`,
                {
                    method: 'DELETE',
                    signal: AbortSignal.timeout(10000)
                }
            );

            // A workspace already removed by another client is also absent.
            if (response.status !== 204 && response.status !== 404) {
                const data = await response.json().catch(() => null);
                throw new Error(
                    data?.error ?? `Deletion failed (HTTP ${response.status})`
                );
            }

            listRevision.current += 1;
            setWorkspaces(current => current.filter(
                workspace => workspace.id !== deleteTarget.id
            ));
            setDeleteMessage(`Deleted workspace "${deleteTarget.name}".`);
            setDeleteTarget(null);
        } catch (error) {
            setDeleteError(error.message);
        } finally {
            setDeleting(false);
        }
    }

    return (
        <main>
            <h1>StorageLab</h1>
            <p>Request storage workspaces and track their readiness.</p>

            <section>
                <h2>Create workspace</h2>

                <form onSubmit={handleCreate}>
                    <fieldset disabled={creating}>
                        <legend>Storage request</legend>

                        <div>
                            <label htmlFor="workspace-name">Name</label>
                            <input
                                id="workspace-name"
                                type="text"
                                value={name}
                                onChange={event => setName(event.target.value)}
                                maxLength={63}
                                placeholder="training-data"
                                required
                            />
                            <p>
                                Use lowercase letters, digits, and hyphens.
                                Start and end with a letter or digit.
                            </p>
                        </div>

                        <div>
                            <label htmlFor="workspace-size">Size (GiB)</label>
                            <input
                                id="workspace-size"
                                type="number"
                                value={sizeGiB}
                                onChange={event => setSizeGiB(event.target.value)}
                                min={1}
                                step={1}
                                required
                            />
                        </div>

                        <div>
                            <input
                                id="workspace-web-enabled"
                                type="checkbox"
                                checked={webEnabled}
                                onChange={event => setWebEnabled(event.target.checked)}
                            />
                            <label htmlFor="workspace-web-enabled">Enable Web Server</label>
                            <p>Serve website files from this workspace on Pod port 8080.</p>
                        </div>

                        <button
                            type="submit"
                            disabled={creating || loading || Boolean(error)}
                        >
                            {creating ? 'Creating...' : 'Create workspace'}
                        </button>
                    </fieldset>
                </form>

                {createError && <p role="alert">{createError}</p>}
                {createMessage && <p role="status">{createMessage}</p>}
            </section>

            <section>
                <h2>Workspaces</h2>
                <p>Statuses refresh automatically every 3 seconds.</p>

                {loading && <p>Loading workspaces...</p>}
                {error && <p role="alert">{error}</p>}
                {deleteMessage && <p role="status">{deleteMessage}</p>}

                {!loading && (
                    workspaces.length === 0 ? (
                        !error && <p>No workspaces yet.</p>
                    ) : (
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Size</th>
                                    <th>Web enabled</th>
                                    <th>Port (Pod)</th>
                                    <th>Status</th>
                                    <th>Message</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {workspaces.map(workspace => (
                                    <tr key={workspace.id}>
                                        <td>{workspace.name}</td>
                                        <td>{workspace.sizeGiB} GiB</td>
                                        <td>{workspace.webEnabled ? 'true' : 'false'}</td>
                                        <td>{workspace.webEnabled ? workspace.port : ''}</td>
                                        <td>{workspace.status.phase}</td>
                                        <td>{workspace.status.message}</td>
                                        <td>
                                            {workspace.webEnabled && (
                                                <button
                                                    type="button"
                                                    aria-label={`Open website ${workspace.name}`}
                                                    disabled={workspace.status.phase !== 'Ready' || !workspace.publicUrl}
                                                    title={workspace.status.phase === 'Ready' && workspace.publicUrl
                                                        ? 'Open the website through the shared cluster gateway'
                                                        : 'Waiting for the Web Server and shared public gateway'}
                                                    onClick={() => window.open(
                                                        workspace.publicUrl,
                                                        '_blank',
                                                        'noopener,noreferrer'
                                                    )}
                                                >
                                                    Open website
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                aria-label={`Delete ${workspace.name}`}
                                                disabled={deleting}
                                                onClick={() => {
                                                    setDeleteTarget(workspace);
                                                    setDeleteError('');
                                                    setDeleteMessage('');
                                                }}
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )
                )}
            </section>

            <dialog
                ref={deleteDialog}
                className="delete-dialog"
                aria-labelledby="delete-title"
                aria-describedby="delete-description"
                onCancel={event => {
                    event.preventDefault();
                    if (!deleting) {
                        setDeleteTarget(null);
                    }
                }}
            >
                <h2 id="delete-title">Delete workspace?</h2>
                <p id="delete-description">
                    Delete "{deleteTarget?.name}"? Associated Pods, Services,
                    and the PVC will be removed. Stored files may be permanently
                    deleted under the current storage reclaim policy.
                </p>
                {deleteError && <p role="alert">{deleteError}</p>}
                <div className="dialog-actions">
                    <button
                        type="button"
                        disabled={deleting}
                        autoFocus
                        onClick={() => setDeleteTarget(null)}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={deleting}
                        onClick={handleDelete}
                    >
                        {deleting ? 'Deleting...' : 'Delete workspace'}
                    </button>
                </div>
            </dialog>
        </main>
    );
}

export default App;
