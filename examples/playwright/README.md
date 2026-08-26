# Playwright example

This TypeScript suite exercises authentication and RBAC, forms and APIs,
pointer actions, windows, frames, Shadow DOM, file transfer, and an axe
accessibility smoke check in Chromium, Firefox, and WebKit.

From the repository root, install the application once. Then install and run
the example:

```bash
npm ci
cd examples/playwright
npm ci
npx playwright install
npm test
```

The configuration starts the application automatically and keeps traces,
screenshots, and videos for failures. Set `PLAYWRIGHT_NO_WEBSERVER=1` when the
app is already running, and use `BASE_URL` and `API_URL` for non-default URLs.

Each worker requests an isolated test run when the server supports it. The
default `TEST_RUN_ISOLATION=auto` mode safely falls back to one worker and a
shared database reset on older servers. Use `required` to fail instead of
falling back, or `off` to exercise the shared-database behavior explicitly.
