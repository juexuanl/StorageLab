function validatePublicUrl(value, workspaceName) {
    if (typeof value !== 'string' || !value) return null;
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:'
            || !/^[a-z0-9-]+\.trycloudflare\.com$/.test(url.hostname)
            || url.port || url.username || url.password || url.search || url.hash
            || url.pathname !== `/workspaces/${workspaceName}/`) {
            return null;
        }
        return url.href;
    } catch {
        return null;
    }
}

module.exports = { validatePublicUrl };
