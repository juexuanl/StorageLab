# API smoke tests

These tests use the Node.js built-in test runner and fetch API. No additional packages are required.

Start the server in one terminal from the project root:

```bash
npm --prefix api start
```

After every server restart, run the tests in a second terminal from the project root:

```bash
npm --prefix api test
```

Alternatively, run `npm test` from the `api` directory.

The tests cover health, input validation, duplicate names, list and ID queries,
deletion, and unknown IDs. They create a uniquely named workspace and attempt to
delete it afterward. They do not require an empty list or remove existing records.
If deletion is broken, a test record may remain until the server restarts.

To test a different local port:

```bash
API_BASE_URL=http://localhost:3001 npm --prefix api test
```

Run these tests against your local development API. They send real create and
delete requests. Avoid making other changes to workspaces while tests are running.
