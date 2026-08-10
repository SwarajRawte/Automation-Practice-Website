# Testing Guide

Use accessible roles/names first, then stable `id`, `name`, and `data-testid`. Test mode makes seeded IDs, dates, delays, and records predictable. Reset through the Test Control Center or `POST /api/test/reset`.

Suggested smoke path: health check → admin login → product search → form submission → dynamic element wait → file upload/download → iframe → Shadow DOM → WebSocket event. Use `server-error@test.local` on the form for a deterministic 422. Use `/dynamic-elements?delay=3000` for explicit waits. The visual page accepts `freeze=true`; animation-heavy extensions should honor `animations=false`.

Assert both UI feedback and backend state. Run tests independently, seed/reset during setup, avoid fixed sleeps, keep downloads in temporary directories, and capture trace/screenshot/video on failure. CI runs health and Playwright smoke coverage.
