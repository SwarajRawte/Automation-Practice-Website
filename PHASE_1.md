# Phase 1 Completion

Phase 1 establishes the project, responsive navigation, deterministic SQLite data, complete local authentication, role authorization, predictable test users, and protected test controls.

## Acceptance checklist

- [x] React/TypeScript client and Express/TypeScript API
- [x] SQLite schema, deterministic seed, reset commands, stable user IDs
- [x] Admin, Standard, Viewer, and Locked accounts
- [x] Registration and simulated email verification
- [x] Login, logout, remember-me, access and rotating refresh tokens
- [x] Invalid credentials and configurable account lockout
- [x] Forgot/reset and authenticated password change
- [x] Strong-password policy and show/hide password controls
- [x] Protected route redirect and role-based access control
- [x] Session expiration/revocation controls and authentication audit log
- [x] Test-only reset, seed, account lock, clock/network/event, and session controls
- [x] Integration tests for positive and negative authentication paths

## Deterministic credentials and tokens

Fixed credentials are in the README. Under `TEST_MODE=true`, verification/reset tokens use `VERIFY-<id>-TEST` and `RESET-<id>-TEST`. Test controls fail closed unless `TEST_CONTROL_KEY` is configured; `.env.example` contains a local-only demonstration value.

## Verification commands

```bash
npm run typecheck
npm run lint
npm test
npm run build
```
