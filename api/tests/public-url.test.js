const assert = require('node:assert/strict');
const { test } = require('node:test');
const { validatePublicUrl } = require('../lib/public-url');

test('Public URLs must target the matching workspace on a Quick Tunnel origin', () => {
    const valid = 'https://example-demo.trycloudflare.com/workspaces/demo/';
    assert.equal(validatePublicUrl(valid, 'demo'), valid);
    for (const invalid of [
        '', undefined, 'javascript:alert(1)',
        'http://example-demo.trycloudflare.com/workspaces/demo/',
        'https://evil.example/workspaces/demo/',
        'https://example-demo.trycloudflare.com/workspaces/another/',
        'https://example-demo.trycloudflare.com/workspaces/demo/?redirect=evil',
        'https://user:password@example-demo.trycloudflare.com/workspaces/demo/'
    ]) {
        assert.equal(validatePublicUrl(invalid, 'demo'), null);
    }
});
