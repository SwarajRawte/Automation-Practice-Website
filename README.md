# E2E Test Lab

A locally runnable, deterministic full-stack practice application for Playwright, Cypress, Selenium, WebdriverIO, Robot Framework, and other browser automation tools.

## Professional interface

The application uses a tokenized developer-tool design system with intentional light, dark, and system themes. The authenticated shell includes grouped navigation, breadcrumbs, Ctrl/Cmd+K search, environment health details, notifications, profile/settings, user roles, and a responsive collapsed/mobile sidebar. Practice pages share reusable PageHeader and tabbed TestInfoPanel components so the target application remains visually distinct from testing guidance.

Theme preference persists locally. The UI respects reduced-motion preferences and adapts from 1440px desktop layouts through 375px mobile screens. See [UI_DESIGN_SYSTEM.md](UI_DESIGN_SYSTEM.md).

## Quick start

Requires Node 22.12+ (Node 24 LTS recommended).

```bash
cp .env.example .env
npm ci
npm run dev
```

Frontend: `http://localhost:5173`; API: `http://localhost:3100`; Swagger: `http://localhost:3100/api/docs`.

Local single-server build or Docker:

```bash
npm run build && npm start
docker compose up --build
```

Development, start, seed, and reset commands load `.env` when it exists, while
variables already exported by the shell take precedence. Tests always use an
isolated in-memory database and never load `.env`. Docker Compose reads `.env`,
requires an explicit `JWT_SECRET`, and binds the service to `127.0.0.1:3000`.
The values in `.env.example`, seeded accounts, and test controls are intended
only for a local automation lab; do not expose them to an untrusted network. The
container runs in production mode and rejects the example JWT placeholder, so
replace `JWT_SECRET` with a unique value of at least 32 characters before
running Compose. Docker test controls remain disabled unless
`DOCKER_TEST_MODE=true` and `DOCKER_TEST_CONTROL_KEY` are both supplied.

SQLite data is stored at `DB_PATH` (default `data/testlab.db`). The application
uses Node's built-in SQLite driver, avoiding native add-on setup. Run
`npm run seed` to restore deterministic products/orders without deleting
user-owned forms or uploads. Run `npm run reset` for a full reset; it also
invalidates every previously issued access and refresh token.

## Test accounts

| Role      | Email                | Password   |
| --------- | -------------------- | ---------- |
| Admin     | admin@testlab.local  | Admin123!  |
| Standard  | user@testlab.local   | User123!   |
| Read-only | viewer@testlab.local | Viewer123! |
| Locked    | locked@testlab.local | Locked123! |

## Phase 1 authentication

Phase 1 provides registration, simulated email verification, login/logout, remembered sessions, 15-minute JWT access tokens, rotating refresh tokens, forgot/reset password, authenticated password change, configurable five-attempt lockout, protected-route redirect, and Admin/User/Viewer authorization. Tokens used for verification, reset, and refresh are stored only as SHA-256 hashes. Passwords are stored with bcrypt.

Authentication is mandatory. Opening `/` or any module without a valid session shows only `/auth/login`; after login the application opens `/dashboard`. Direct protected URLs are preserved in `returnUrl`. The sidebar and application shell are never rendered until `GET /api/auth/session` succeeds. Authenticated users visiting `/` or `/auth/login` are redirected to `/dashboard`.

Browser access tokens remain in memory, while access and refresh cookies are
HTTP-only and same-site. Logout revokes refresh tokens, increments the
server-side session version to invalidate access tokens, disconnects active
sockets, clears browser authentication, and replaces browser history with the
login route. A successful login intentionally invalidates the account's prior
device session. See [AUTH_FLOW.md](AUTH_FLOW.md).

In test mode, registration and forgot-password responses expose deterministic
tokens so automation never depends on email. Because this project has no real
email provider, those simulation endpoints return `503 SIMULATION_DISABLED`
outside test mode. Authentication events are recorded in the `audit` table.

Authentication routes:

- `POST /api/auth/register`, `/verify`, `/login`, `/refresh`, `/logout`
- `POST /api/auth/forgot-password`, `/reset-password`, `/change-password`
- `GET /api/auth/session` (`/me` remains a compatibility alias)

Test controls require `TEST_MODE=true` and the `x-test-key` header matching `TEST_CONTROL_KEY`. They include database reset/seed, user lock/unlock, and refresh-session expiration.

## Commands

`npm run dev`, `npm run build`, `npm start`, `npm test`, `npm run lint`, `npm run typecheck`, `npm run seed`, `npm run reset`.

## Architecture and routes

Vite serves the React/TypeScript client in development and proxies REST/WebSocket traffic to Express. Express serves the production bundle, JWT authentication, SQLite-backed data, uploads, test controls, Swagger, and Socket.IO.

Practice routes include `/auth/login`, `/forms/basic`, `/interactions/buttons`, `/alerts`, `/windows`, `/frames`, `/tables/dynamic`, `/crud/products`, `/shop/products`, `/files/upload`, `/dynamic-elements?delay=3000`, `/shadow-dom`, `/storage`, `/api-playground`, `/realtime`, `/accessibility/good`, `/visual?freeze=true`, `/responsive`, `/i18n`, `/errors`, `/admin`, and `/test-control`.

## Phase 2 practice routes

- Forms: `/forms/basic`, `/forms/validation`, `/forms/dynamic`, `/forms/confirmation`
- Mouse and links: `/interactions/buttons`
- Keyboard events and accessible listbox/modal: `/interactions/keyboard`
- Native dialogs, custom/nested/form/non-dismissible modals, and notifications: `/alerts`, `/modals`
- Browser tabs and child windows: `/windows`
- Basic, multiple, form, nested, and dynamic frames: `/frames`

Form submissions use real persistence through `POST /api/forms`; confirmation records are available at `GET /api/forms/:id`. The deterministic server-error address is `server-error@test.local`.

## Phase 3 data and synchronization labs

- Tables: `/tables/static`, `/tables/dynamic`, `/tables/virtual`
- Persistent product CRUD: `/crud/products`
- Uploads and downloads: `/files/upload`, `/files/download`
- Wait and synchronization scenarios: `/dynamic-elements?delay=1500&deterministic=true`
- Web components: `/shadow-dom`

Table data contains exactly 100 generated users and supports server pagination,
filtering, and multi-column sorting. Product writes require Admin, use
optimistic version checks, preserve history, soft-delete with deterministic undo
tokens, and return 409 for duplicate names/conflicts. Upload persistence is
user-scoped, accepts TXT/CSV/PDF/PNG/JPEG up to 5 MB per file, defaults to a
50 MB stored quota per user, and rejects zero-byte, same-user duplicate,
disallowed, referenced-delete, and simulated-failure scenarios. Viewer accounts
can browse practice data but cannot mutate it.

## Environment

See `.env.example`. `HOST` and `PORT` control the API listener; local development
binds to `127.0.0.1`, while Compose listens on all container interfaces but
publishes the port only on the host loopback interface. Vite derives its proxy
target from `PORT` unless `VITE_API_TARGET` supplies a full URL. `APP_ORIGIN`
defines the development browser origin; Compose uses
`DOCKER_APP_ORIGIN` (default `http://localhost:3000`) so the development value
cannot accidentally override the container origin. Docker likewise ignores the
development `TEST_MODE` and `TEST_CONTROL_KEY`: set `DOCKER_TEST_MODE=true` and
an explicit `DOCKER_TEST_CONTROL_KEY` only for a local containerized test lab.
`COOKIE_SECURE=true` is
appropriate only when the application is served over HTTPS. Test-control
endpoints are available only when `TEST_MODE=true` and require
`TEST_CONTROL_KEY`.
`VITE_TEST_CONTROL_KEY` exposes that same local key to the Test Control page at
build time; every `VITE_` value is browser-visible, so this setting is test-only
and must never be treated as a secret. Always replace the local JWT secret and
test-control key before sharing the service. No payment/email provider or
hardware permission is contacted.

## Automation examples

The repository includes a pinned Playwright starter configuration in
`examples/playwright`. Run `npm ci` there, add suites under its `tests`
directory, start this app, and run `npm test`. Set `BASE_URL` when the app is not
running at the default development URL, `http://localhost:5173`.

## Troubleshooting

- Delete `data/testlab.db` only when the server is stopped, or use `npm run reset`.
- The API uses port `3100` and Vite uses port `5173`. If the API port is busy,
  set `PORT`; set `VITE_API_TARGET` only when Vite must proxy to a different
  host or URL.
- For Docker, change `HOST_PORT` and the matching `DOCKER_APP_ORIGIN` together.
- File uploads are limited to 5 MB and five files.
- Login once as admin before testing protected management APIs.

See [TESTING_GUIDE.md](TESTING_GUIDE.md), [AUTH_FLOW.md](AUTH_FLOW.md), the
phase completion documents, and [UI_DESIGN_SYSTEM.md](UI_DESIGN_SYSTEM.md).

## Known limitations and next improvements

This deliberately compact lab demonstrates every major automation surface, but advanced rich editors, real cross-origin frames, closed-shadow-root access, camera/microphone hardware, email delivery, and real payments are simulations or documented constraints. Natural next steps are deeper per-module variants, snapshot/restore, richer accessibility/visual exercises, and additional framework examples.
## Phase 4 application and network workflows

Phase 4 adds a complete mock commerce flow across `/shop/products`, `/shop/cart`, `/shop/checkout`, and `/shop/orders`, deterministic payment outcomes, persisted orders and stock, configurable API/network simulations, WebSocket exercises, and an admin-only operational dashboard with CSV export. See `PHASE_4.md` for the route and scenario checklist.

## Phase 5 quality and browser-state labs

Phase 5 expands `/storage`, `/accessibility/*`, `/visual`, `/responsive`, `/i18n`, and `/errors` into deterministic labs for isolated browser state, WCAG scanning and keyboard behavior, stable and intentionally changed screenshots, explicit viewport breakpoints, Unicode/RTL localization, and structured failure recovery. See `PHASE_5.md` for the scenario checklist.
