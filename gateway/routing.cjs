const namePattern = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const routePattern = new RegExp(`^/workspaces/(${namePattern})(/.*)?$`);

function parseRoute(requestPath) {
    if (!requestPath.startsWith('/') || requestPath.startsWith('//')) return null;
    const url = new URL(requestPath, 'http://gateway.invalid');
    const match = url.pathname.match(routePattern);
    if (!match) return null;
    return {
        workspace: match[1],
        prefix: `/workspaces/${match[1]}/`,
        path: `${match[2] ?? '/'}${url.search}`,
        redirect: match[2] ? null : `/workspaces/${match[1]}/${url.search}`
    };
}

function prefixLocation(location, prefix) {
    if (location?.startsWith('/') && !location.startsWith('//')) {
        return `${prefix}${location.slice(1)}`;
    }
    return location;
}

module.exports = { parseRoute, prefixLocation };
