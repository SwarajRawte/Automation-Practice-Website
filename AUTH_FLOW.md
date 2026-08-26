# Mandatory Authentication Flow

The authentication pages and application shell are separate route trees. Only login, registration, forgot/reset password, and verification are public. Change password and every practice module are protected.

## Browser flow

1. The app displays an authentication-loading screen while validating its HTTP-only access cookie or in-memory access token with `GET /api/auth/session`.
2. If needed, it rotates the HTTP-only refresh cookie through `POST /api/auth/refresh`. Browser code does not persist access or refresh tokens in web storage.
3. Anonymous users are redirected to `/auth/login?returnUrl=<original URL>` without rendering the sidebar or dashboard.
4. Successful login replaces the current browser entry with the return URL or `/dashboard`.
5. Failed login keeps the email, clears the password, announces the inline error, and stays on the login page.
6. Logout revokes server tokens, clears both HTTP-only authentication cookies and cached browser user state, then replaces the current entry with `/auth/login`.

## Authorization

- Admin users can access all modules, `/admin`, and `/test-control` in test/development mode.
- Standard users can access normal modules but receive a visible/API 403 for admin routes.
- Viewer users can view supported modules; mutation APIs retain their route-specific role checks.
- Every module API is protected by backend authentication middleware. `/api/health`, `/api/docs`, and `/api/auth/*` are the public API surface.

## Stable login selectors

`login-page`, `login-email`, `login-password`, `toggle-password`, `remember-me`, `login-submit`, `login-error`, `forgot-password-link`, `register-link`, `logout-button`, `dashboard-page`, and `user-menu` are exposed as `data-testid` values.

## Deterministic responses

- Missing login fields: HTTP 422
- Invalid credentials: HTTP 401
- Authenticated but unauthorized: HTTP 403
- Locked account: HTTP 423
- Expired or revoked session: HTTP 401 with `SESSION_EXPIRED`
