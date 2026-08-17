# E2E Test Lab

A locally runnable, deterministic full-stack practice application for Playwright, Cypress, Selenium, WebdriverIO, Robot Framework, and other browser automation tools.

## Professional interface

The application uses a tokenized developer-tool design system with intentional light, dark, and system themes. The authenticated shell includes grouped navigation, breadcrumbs, Ctrl/Cmd+K search, environment health details, notifications, profile/settings, user roles, and a responsive collapsed/mobile sidebar. Practice pages share reusable PageHeader and tabbed TestInfoPanel components so the target application remains visually distinct from testing guidance.

Theme preference persists locally. The UI respects reduced-motion preferences and adapts from 1440px desktop layouts through 375px mobile screens. See [UI_DESIGN_SYSTEM.md](UI_DESIGN_SYSTEM.md).

## Quick start

Requires Node 22.5+ (Node 24 LTS recommended).

```bash
cp .env.example .env
npm install
npm run dev
```

Frontend: `http://localhost:5173`; API: `http://localhost:3100`; Swagger: `http://localhost:3100/api/docs`.

Production or Docker:

```bash
npm run build && npm start
docker compose up --build
```

SQLite data is stored at `DB_PATH` (default `data/testlab.db`). The application uses Node's built-in SQLite driver, avoiding native add-on setup. Run `npm run seed` to restore deterministic products/orders, or `npm run reset` for a full reset.

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

Access tokens are accepted through the authorization header and an HTTP-only same-site cookie. Logout revokes refresh tokens, increments the server-side session version to invalidate access tokens, clears browser authentication, and replaces browser history with the login route. See [AUTH_FLOW.md](AUTH_FLOW.md).

In test mode, registration and forgot-password responses expose deterministic tokens so automation never depends on email. Production-style mode omits these values. Authentication events are recorded in the `audit` table.

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

Table data contains exactly 100 generated users and supports server pagination, filtering, and multi-column sorting. Product writes require Admin, use optimistic version checks, preserve history, soft-delete with deterministic undo tokens, and return 409 for duplicate names/conflicts. Uploads persist in SQLite, accept TXT/CSV/PDF/PNG/JPEG up to 5 MB, and reject zero-byte, duplicate, disallowed, and simulated-failure scenarios.

## Environment

See `.env.example`. Test-control endpoints are unavailable when `TEST_MODE=false`. Always replace `JWT_SECRET` outside local development. No payment/email provider or hardware permission is contacted.

## Automation examples

Install the example project's dependencies, start this app, then use `npm test` in `examples/playwright` or `examples/cypress`. For Selenium, use Maven in `examples/selenium-java`. Examples are intentionally small and demonstrate reusable page objects, stable selectors, API setup, UI assertions, screenshots, traces/reports, and CI-ready configuration.

## Troubleshooting

- Delete `data/testlab.db` only when the server is stopped, or use `npm run reset`.
- The API uses port `3100` and Vite uses port `5173`. If either is busy, set
  `PORT` and adjust the matching target in `vite.config.ts`.
- File uploads are limited to 5 MB and five files.
- Login once as admin before testing protected management APIs.

See [TESTING_GUIDE.md](TESTING_GUIDE.md), [API_GUIDE.md](API_GUIDE.md), and [MODULE_CATALOG.md](MODULE_CATALOG.md). Contributions should follow [CONTRIBUTING.md](CONTRIBUTING.md).

## Known limitations and next improvements

This deliberately compact lab demonstrates every major automation surface, but advanced rich editors, real cross-origin frames, closed-shadow-root access, camera/microphone hardware, email delivery, and real payments are simulations or documented constraints. Natural next steps are deeper per-module variants, snapshot/restore, richer accessibility/visual exercises, and additional framework examples.
## Phase 4 application and network workflows

Phase 4 adds a complete mock commerce flow across `/shop/products`, `/shop/cart`, `/shop/checkout`, and `/shop/orders`, deterministic payment outcomes, persisted orders and stock, configurable API/network simulations, WebSocket exercises, and an admin-only operational dashboard with CSV export. See `PHASE_4.md` for the route and scenario checklist.

## Phase 5 quality and browser-state labs

Phase 5 expands `/storage`, `/accessibility/*`, `/visual`, `/responsive`, `/i18n`, and `/errors` into deterministic labs for isolated browser state, WCAG scanning and keyboard behavior, stable and intentionally changed screenshots, explicit viewport breakpoints, Unicode/RTL localization, and structured failure recovery. See `PHASE_5.md` for the scenario checklist.
