# Project Overview: E2E Test Lab

> Reference document for AI models/assistants to quickly understand this project without reading the full codebase.

## 1. What This Is

**E2E Test Lab** is a locally runnable, deterministic full-stack "practice" application purpose-built for teaching/exercising browser test automation tools (Playwright, Cypress, Selenium, WebdriverIO, Robot Framework, etc.). It is **not** a production product — it's a training/demo target app with a React/TypeScript frontend and a Node/Express/TypeScript backend, seeded SQLite data, fixed test accounts, and dedicated "test control" APIs that let automated test suites deterministically reset/seed state, freeze the clock, and simulate network conditions. Features are organized into five incremental "phases" covering auth, forms/UI interactions, data/CRUD/files, commerce/realtime, and quality/accessibility/i18n labs.

## 2. Tech Stack

- **Frontend**: React 19, TypeScript, React Router 7, Vite 8 (dev server on port 5173), lucide-react icons, Socket.IO client.
- **Backend**: Express 5, TypeScript run via `tsx`, Node's built-in `node:sqlite` (`DatabaseSync`) — no native SQLite addon, Socket.IO server, JWT (`jsonwebtoken`), `bcryptjs` for password hashing, `helmet` + custom CSP, `multer` for uploads, `swagger-ui-express` for OpenAPI docs.
- **Database**: SQLite file at `DB_PATH` (default `data/testlab.db`); tests use isolated in-memory DBs.
- **Testing (of the app itself)**: Node's built-in test runner (`node --test`) with `supertest` for server integration tests.
- **Testing examples (consume the app)**: `examples/playwright` (TypeScript, 3-browser matrix) and `examples/selenium-testng` (Java 17, Maven, Selenium + TestNG + REST Assured).
- **Tooling**: ESLint 10 + typescript-eslint, Prettier, `concurrently` for running multiple dev processes, Docker/Docker Compose.
- Requires Node ≥22.12 (24 LTS recommended).

## 3. High-Level Architecture

- Vite dev server serves the React SPA and proxies `/api` and `/socket.io` traffic to the Express API (default port 3100). In production, Express serves the built static bundle directly (single server, default port 3000 in Docker).
- Express ([server/index.ts](server/index.ts)) wires together: Helmet + custom CSP, CORS with an explicit allow-list, request observability (request ID + structured completion logs + Server-Timing), origin-guard middleware for unsafe methods, test-run context middleware, Swagger docs, auth routes, clock routes, generic `auth` middleware, and phase-specific routers (forms, phase3, phase4/realtime, advanced labs, test control).
- **Auth**: stateless JWT access tokens (15 min) signed with a custom HS256 implementation ([server/auth.ts](server/auth.ts)), verified via `jsonwebtoken`, plus rotating refresh tokens and other single-use tokens (verify/reset) stored only as SHA-256 hashes in `auth_tokens`. Access token delivered via HTTP-only cookie or bearer header; browser never persists tokens in localStorage (access token kept in memory only).
- **Sockets**: Socket.IO server authenticates each connection (`authenticateSocket`), joins per-run/per-user rooms, and is used for chat, counters, presence, test events, and live order updates. Revocation events (logout, lock, clock changes, run deletion) force-disconnect affected sockets.
- **Multi-tenancy for tests**: An `AsyncLocalStorage`-based `runContext` lets each test worker create an isolated in-memory SQLite database ("test run") via `POST /api/test/runs`, bound to requests via `x-test-run-id` header or `test_run` cookie, enabling parallel test execution without cross-test interference.
- **Health/Readiness**: `/api/health` (liveness only) and `/api/ready` (probes DB) are intentionally public and bypass run/auth context.

## 4. Features by Phase

- **Phase 1 – Auth & foundation** ([PHASE_1.md](PHASE_1.md)): registration + simulated email verification, login/logout, remember-me, 15-min JWTs + rotating refresh tokens, forgot/reset/change password, 5-attempt lockout, protected-route redirects with `returnUrl`, RBAC (Admin/User/Viewer), audit log, test controls (reset/seed/lock/clock/session).
- **Phase 2 – Forms & UI interactions** ([PHASE_2.md](PHASE_2.md)): comprehensive native form controls & validation, dynamic/dependent fields, persisted submissions; mouse/keyboard interaction variants; native & custom alerts/modals/notifications; multi-window/tab handling; iframes (basic/nested/dynamic).
- **Phase 3 – Data, files, sync** ([PHASE_3.md](PHASE_3.md)): static/dynamic/virtual tables with server pagination/sort/filter (100 deterministic users); persistent product CRUD with optimistic versioning, soft-delete/undo, history; file upload/download with validation/quotas; deterministic delay/synchronization scenarios; Shadow DOM/web component labs.
- **Phase 4 – Commerce & realtime** ([PHASE_4.md](PHASE_4.md)): mock shop (catalog/cart/checkout/orders) with deterministic payment outcomes, persisted orders/stock; REST echo playground with configurable network delay/failure/offline; WebSocket chat/counter/order-event exercises; admin-only ops dashboard with CSV export.
- **Phase 5 – Quality/browser-state labs** ([PHASE_5.md](PHASE_5.md)): isolated cookie/localStorage/sessionStorage exercises; accessible vs. intentionally-problematic WCAG pages; frozen-time visual regression pages; explicit responsive breakpoints; i18n (5 locales incl. Arabic RTL); structured HTTP error/recovery scenarios.

## 5. Folder Structure

- [server/](server/) — Express/TypeScript API: routing per phase (`authRoutes`, `formsRoutes`, `phase3Routes`, `phase4Routes`, `advancedLabRoutes`, `clockRoutes`, `testControl`, `testRuns`), core services (`auth.ts`, `db.ts`, `security.ts`, `realtime.ts`, `observability.ts`, `health.ts`, `openapi.ts`, `shutdown.ts`, `clock.ts`, `runContext.ts`, `secondOrigin.ts`), plus colocated `*.test.ts`/`*.integration.test.ts` files and `scripts/` (seed/reset).
- [src/](src/) — React SPA: `main.tsx` (router/shell/auth guard), `moduleRegistry.tsx` (catalog of lab modules/nav), `authClient.ts` (token/session management + Socket.IO client), `Dashboard.tsx`, `Profile.tsx`, `phase2.tsx`–`phase5.tsx` (route components per phase), `advancedLabs.tsx`, `progress.ts`, shared `components/layout` and `components/testing` (PageHeader, TestInfoPanel).
- [examples/playwright/](examples/playwright/) — standalone Playwright TS test suite targeting the running app.
- [examples/selenium-testng/](examples/selenium-testng/) — standalone Java/Maven Selenium+TestNG+REST Assured suite.
- [public/](public/) — static assets incl. `lab-service-worker.js` and `offline-lab.json` for the offline/service-worker lab.
- [data/](data/) — SQLite database file location (`testlab.db`).
- [test-assets/](test-assets/) — sample fixture files (`sample.txt`, `users.csv`) used for upload tests.
- [uploads/](uploads/) — presumably runtime storage related to uploaded file blobs (though uploads are actually stored in SQLite `uploaded_files` BLOB column per `db.ts`).
- Root docs: [README.md](README.md), [PHASE_1.md](PHASE_1.md)..[PHASE_5.md](PHASE_5.md), [AUTH_FLOW.md](AUTH_FLOW.md), [SECURITY.md](SECURITY.md), [TESTING_GUIDE.md](TESTING_GUIDE.md), [UI_DESIGN_SYSTEM.md](UI_DESIGN_SYSTEM.md).

## 6. npm Scripts (root [package.json](package.json))

- `dev` — runs API (tsx watch) + Vite concurrently.
- `dev:origin` — runs only the secondary-origin fixture (port 3200).
- `dev:all` — API + Vite + secondary-origin fixture together.
- `build` — `tsc -b && vite build`.
- `start` — run built/production server directly via tsx.
- `test` — Node's built-in test runner over `server/**/*.test.ts` with a shared `testSetup.ts`, concurrency 1.
- `seed` / `reset` — deterministic DB seed / full reset (also invalidates tokens).
- `lint` — ESLint.
- `typecheck` — `tsc -b`.

## 7. Authentication Flow

Separate public vs. protected route trees: only login/register/forgot/reset/verify are public; everything else (incl. change-password) requires auth. On load, the app calls `GET /api/auth/session` using the HTTP-only access cookie (or refreshes via `POST /api/auth/refresh`); nothing renders (no sidebar/dashboard) until this succeeds. Anonymous access redirects to `/auth/login?returnUrl=...`. Successful login replaces browser history entry with the return URL or `/dashboard`; a new login invalidates the prior device session (session_version increment). Logout revokes refresh tokens, bumps session version (invalidating outstanding access tokens), disconnects sockets, and clears cookies/cached user. Tokens: 15-min JWT access token (custom HS256 signer with logical + control clock timestamps), rotating refresh tokens, verify/reset tokens — all non-access tokens stored only as SHA-256 hashes; passwords hashed with bcrypt. Deterministic HTTP codes: 422 (missing fields), 401 (invalid credentials / expired session `SESSION_EXPIRED`), 403 (unauthorized), 423 (locked). RBAC: ADMIN/USER/VIEWER enforced both in UI and per-route API middleware (`auth`, `roles()`). Stable `data-testid`s are defined for login/dashboard elements for automation. Full details in [AUTH_FLOW.md](AUTH_FLOW.md).

## 8. Security Considerations

- Vulnerability reports go through GitHub Security Advisories; auth/authorization/test-control/file-handling/secrets/container isolation issues are treated as in-scope even though the app is an intentionally lab-like target.
- `TEST_MODE`/`TEST_CONTROL_KEY`/`TEST_RUN_KEY` gate all test-only endpoints and must never be enabled on an untrusted network.
- Production boot fails fast if `JWT_SECRET` is short or matches known placeholder patterns.
- CSP is origin-restricted (helmet disabled in favor of a custom `createContentSecurityPolicy()`), CORS uses an explicit allow-list, non-GET requests are checked against Origin/Referer (`unsafeRequestOriginGuard`), and API responses use `Cache-Control: private, no-store`.
- Docker Compose hardens the container: non-root user, read-only root FS, all capabilities dropped, `no-new-privileges`, bounded PIDs, tmpfs for `/tmp`, loopback-only published ports, graceful shutdown.
- Structured logs include only request ID/method/status/duration — never headers, bodies, cookies, or tokens.
- Full details in [SECURITY.md](SECURITY.md).

## 9. Testing Setup

- **App's own tests**: Node test runner + Supertest integration tests colocated in `server/` per feature (auth, forms, security, phase3/4, sockets, shutdown, etc.), run against isolated in-memory SQLite, never touching `.env`.
- **[examples/playwright](examples/playwright/)**: TypeScript Playwright suite (42 tests across Chromium/Firefox/WebKit) covering auth/RBAC, forms/APIs, pointer actions, windows/frames, Shadow DOM, file transfer, and accessibility (axe). Auto-starts the app; supports per-worker isolated test runs via `TEST_RUN_ISOLATION`.
- **[examples/selenium-testng](examples/selenium-testng/)**: Java 17/Maven suite using Selenium WebDriver (local or Grid), TestNG (parallel classes, groups `live`/`unit`), and REST Assured for API setup/auth. Structured into `config`, `driver`, `api`, `pages` (Page Object Model), `listeners` (screenshot-on-failure), `tests`. Creates one isolated test run per suite via `x-test-run-id`/`test_run` cookie.
- Shared testing conventions ([TESTING_GUIDE.md](TESTING_GUIDE.md)): prefer accessible roles/names then stable `data-testid`; use Test Control Center/`/api/test/reset` for determinism; avoid fixed sleeps; capture traces/screenshots on failure.

## 10. Docker/Deployment

- Multi-stage [Dockerfile](Dockerfile): build stage (`node:24-alpine`, `npm ci`, `vite build`), runtime stage installs prod-only deps, copies `dist`/`server`/tsconfigs, runs as `node` user, exposes 3000/3200, has a `HEALTHCHECK` hitting `/api/ready`.
- [docker-compose.yml](docker-compose.yml) defines two hardened services: `testlab` (main app, port mapped to host loopback only, requires `JWT_SECRET` env var) and `secondary-origin` (isolated cross-origin fixture for iframe/postMessage labs, port 3200). Both run read-only root filesystems, drop all capabilities, use tmpfs for `/tmp`, and have bounded `pids_limit`/`stop_grace_period`.
- Local dev binds to `127.0.0.1`; Compose binds `0.0.0.0` inside the container but only publishes to the host loopback interface.
