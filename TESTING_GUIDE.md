# Testing Guide

Use accessible roles/names first, then stable `id`, `name`, and `data-testid`. Test mode makes seeded IDs, dates, delays, and records predictable. Reset through the Test Control Center or `POST /api/test/reset`.

Suggested smoke path: health check → admin login → product search → form submission → dynamic element wait → file upload/download → iframe → Shadow DOM → WebSocket event. Use `server-error@test.local` on the form for a deterministic 422. Use `/dynamic-elements?delay=3000` for explicit waits. The visual page accepts `freeze=true`; animation-heavy extensions should honor `animations=false`.

Assert both UI feedback and backend state. Run tests independently, seed/reset during setup, avoid fixed sleeps, keep downloads in temporary directories, and capture trace/screenshot/video on failure. CI runs health and Playwright smoke coverage.

## Phase 1 scenarios

Use the four fixed accounts for role assertions. Five wrong passwords lock a normal account; reset restores it. New registrations are unverified until `/api/auth/verify` consumes the returned test token. Refresh tokens rotate, so the previous token must fail after refresh. Logout and `POST /api/test/sessions/:userId/expire` revoke refresh sessions. Send `x-test-key: testlab-control` to test-control endpoints under the default local configuration.

Protected UI routes preserve their original URL in the login `returnUrl` query parameter. Assert that unauthenticated access redirects to login, successful login returns to the original route, and non-admin users receive a visible 403 on `/admin` while the protected API also returns HTTP 403.

For example, `/auth/login?returnUrl=/tables/dynamic`. Login failures preserve the email and consistently clear the password. During startup, assert the session-loading status rather than the dashboard. Expired sessions add `reason=session-expired` and show “Your session has expired. Please log in again.”

## Phase 2 scenarios

The comprehensive form includes native text, email, password, number, telephone, URL, search, textarea, radio, checkbox, select, multi-select, datalist, autocomplete, date/time, color, range, switch, upload, hidden/read-only/disabled, dependent, conditional, and dynamic controls. Assert both the validation summary and the persisted confirmation table. Use mismatched passwords, an inverted date range, an employed user without a company, or `server-error@test.local` for negative paths.

Interaction pages expose a visible ordered event log. Prefer event assertions over timing alone for double/right/hold/hover, conditionally enabled, delayed, moving, covered, icon-only, scroll, generated-link, drag/drop, and floating-action scenarios. The keyboard route reports the complete last event and supports arrows, Escape, modifiers, listbox navigation, and Control/Command+Enter.

Dialog responses are stored in a visible status output. Verify native alert/confirm/prompt values, modal focus, Escape/outside close, nested dialogs, validation, required dismissal, and auto-disappearing notifications. Window and frame pages give each context unique text. Always switch context explicitly and close created windows during cleanup.

## Phase 3 scenarios

The table API always generates 100 exact users. Assert `QA User 001`, `qa.user001@testlab.local`, inactive IDs divisible by 9, page counts, sort direction, Shift+click secondary sorting, row selection, bulk actions, inline edits, column visibility/order, sticky cells, incremental virtual scrolling, and loading/empty states.

Product IDs 1–30 are reseeded predictably. Admin tests should cover create, duplicate-name 409, version-conflict 409, update, duplicate, history, delete, and undo. Standard/Viewer accounts may browse; mutation attempts must return 403. Reset before tests that modify inventory.

Use files in `test-assets/` for upload assertions. Duplicate content returns 409, unsupported types 415, zero bytes 422, and `?fail=true` returns 503. Downloads expose deterministic text, CSV, minimal PDF/invoice, delayed, and failed variants.

Configure synchronization waits with the `delay` query parameter. Assert visible outcomes instead of sleeping: appearance/disappearance, changed text, enabled state, spinner/skeleton replacement, progress, polling completion, debounced results, and DOM generation replacement. Shadow DOM tests cover open, nested, multiple, dynamic, and intentionally inaccessible closed roots.
