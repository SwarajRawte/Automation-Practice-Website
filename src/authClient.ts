import { io, type Socket } from "socket.io-client";

export type SessionUser = {
  id: string | number;
  email: string;
  name: string;
  role: string;
  [key: string]: unknown;
};

type CredentialPayload = {
  token?: unknown;
  refreshToken?: unknown;
  user?: unknown;
};

type AuthFetchOptions = {
  redirectOnUnauthorized?: boolean;
  retryOnUnauthorized?: boolean;
};

const ACCESS_STORAGE_KEY = "token";
const REFRESH_STORAGE_KEY = "refreshToken";
const USER_STORAGE_KEY = "user";

let accessToken: string | null = null;
let legacyRefreshToken: string | null = null;
let legacyRefreshFallbackAvailable = false;
let sessionUser: SessionUser | null = null;
let refreshRequest: Promise<boolean> | null = null;
let sessionRequest: Promise<SessionUser | null> | null = null;
let logoutInProgress = false;
let logoutRequest: Promise<Response> | null = null;

function readStorage(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function removeStorage(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Authentication still works through same-origin cookies when storage is unavailable.
  }
}

function migrateLegacyCredentials() {
  accessToken = readStorage(ACCESS_STORAGE_KEY);
  legacyRefreshToken = readStorage(REFRESH_STORAGE_KEY);
  legacyRefreshFallbackAvailable = Boolean(legacyRefreshToken);
  removeStorage(ACCESS_STORAGE_KEY);
  removeStorage(REFRESH_STORAGE_KEY);
}

migrateLegacyCredentials();

function isSessionUser(value: unknown): value is SessionUser {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const user = value as Partial<SessionUser>;
  return (
    (typeof user.id === "string" || typeof user.id === "number") &&
    typeof user.email === "string" &&
    typeof user.name === "string" &&
    typeof user.role === "string"
  );
}

export function readCachedUser(): SessionUser | null {
  const value = readStorage(USER_STORAGE_KEY);
  if (!value) return null;
  try {
    const user: unknown = JSON.parse(value);
    if (isSessionUser(user)) return user;
  } catch {
    // Invalid cache data is removed below.
  }
  removeStorage(USER_STORAGE_KEY);
  return null;
}

function cacheUser(user: SessionUser | null) {
  try {
    if (user) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_STORAGE_KEY);
  } catch {
    // The in-memory validated session remains authoritative.
  }
}

function setSessionUser(user: unknown) {
  if (!isSessionUser(user))
    throw new Error("The authentication service returned invalid user data.");
  sessionUser = user;
  cacheUser(user);
  return user;
}

function acceptCredentialPayload(payload: CredentialPayload) {
  accessToken =
    typeof payload.token === "string" && payload.token ? payload.token : null;
  removeStorage(ACCESS_STORAGE_KEY);
  removeStorage(REFRESH_STORAGE_KEY);
}

function retireLegacyRefreshFallback() {
  legacyRefreshToken = null;
  legacyRefreshFallbackAvailable = false;
}

export function acceptLogin(payload: CredentialPayload) {
  const user = setSessionUser(payload.user);
  logoutInProgress = false;
  logoutRequest = null;
  retireLegacyRefreshFallback();
  acceptCredentialPayload(payload);
  return user;
}

export function getSessionUser() {
  return sessionUser;
}

export function getAccessToken() {
  return accessToken;
}

export function hasAuthenticationHint() {
  return Boolean(accessToken || legacyRefreshToken || readCachedUser());
}

export function clearAuthentication() {
  accessToken = null;
  retireLegacyRefreshFallback();
  sessionUser = null;
  removeStorage(ACCESS_STORAGE_KEY);
  removeStorage(REFRESH_STORAGE_KEY);
  removeStorage(USER_STORAGE_KEY);
}

function requestUrl(input: RequestInfo | URL) {
  if (input instanceof Request) return new URL(input.url, window.location.href);
  return new URL(String(input), window.location.href);
}

function isSameOrigin(input: RequestInfo | URL) {
  try {
    return requestUrl(input).origin === window.location.origin;
  } catch {
    return false;
  }
}

function isPublicAuthEndpoint(input: RequestInfo | URL) {
  try {
    return [
      "/api/auth/login",
      "/api/auth/register",
      "/api/auth/verify",
      "/api/auth/forgot",
      "/api/auth/forgot-password",
      "/api/auth/reset-password",
      "/api/auth/refresh",
      "/api/auth/logout",
    ].includes(requestUrl(input).pathname);
  } catch {
    return false;
  }
}

async function fetchOnce(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  if (accessToken && isSameOrigin(input))
    headers.set("authorization", `Bearer ${accessToken}`);
  return fetch(input, {
    ...init,
    credentials: init?.credentials || "same-origin",
    headers,
  });
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

async function readCredentialPayload(response: Response) {
  retireLegacyRefreshFallback();
  try {
    const payload = (await response.json()) as CredentialPayload;
    acceptCredentialPayload(payload);
  } catch (error) {
    if (isAbortError(error)) throw error;
    // Cookie-only refresh responses do not need to expose credentials to script.
    accessToken = null;
  }
}

async function performRefresh() {
  const cookieResponse = await fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (cookieResponse.ok) {
    await readCredentialPayload(cookieResponse);
    return true;
  }
  if (![400, 401, 403].includes(cookieResponse.status)) {
    if (cookieResponse.status === 423) clearAuthentication();
    else throw new Error("The authentication service is unavailable.");
    return false;
  }

  // Older lab sessions returned a refresh token to JavaScript. Use that value
  // once as a compatibility fallback; it is never written back to storage.
  if (logoutInProgress) return false;
  const fallbackToken = legacyRefreshFallbackAvailable
    ? legacyRefreshToken
    : null;
  if (!fallbackToken) return false;
  retireLegacyRefreshFallback();
  const fallbackResponse = await fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken: fallbackToken }),
  });
  if (!fallbackResponse.ok) {
    if ([400, 401, 403, 423].includes(fallbackResponse.status))
      clearAuthentication();
    else throw new Error("The authentication service is unavailable.");
    return false;
  }
  await readCredentialPayload(fallbackResponse);
  return true;
}

export function refreshAuthentication() {
  if (logoutInProgress) return Promise.resolve(false);
  if (!refreshRequest) {
    refreshRequest = performRefresh()
      .catch((error: unknown) => {
        if (isAbortError(error)) return false;
        throw error;
      })
      .finally(() => {
        refreshRequest = null;
      });
  }
  return refreshRequest;
}

export function redirectToLogin(reason = "session-expired") {
  const returnUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  clearAuthentication();
  window.location.replace(
    `/auth/login?reason=${encodeURIComponent(reason)}&returnUrl=${encodeURIComponent(returnUrl)}`,
  );
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  options: AuthFetchOptions = {},
) {
  const retryOnUnauthorized = options.retryOnUnauthorized !== false;
  let response = await fetchOnce(input, init);
  if (
    response.status === 401 &&
    retryOnUnauthorized &&
    !isPublicAuthEndpoint(input)
  ) {
    const refreshed = await refreshAuthentication();
    if (refreshed) response = await fetchOnce(input, init);
  }
  if (
    response.status === 401 &&
    !isPublicAuthEndpoint(input) &&
    !logoutInProgress &&
    options.redirectOnUnauthorized !== false
  )
    redirectToLogin();
  return response;
}

async function performSessionValidation() {
  const response = await authenticatedFetch(
    "/api/auth/session",
    { method: "GET" },
    { redirectOnUnauthorized: false },
  );
  if (response.ok) {
    const body = (await response.json()) as { user?: unknown };
    if (logoutInProgress) return null;
    return setSessionUser(body.user);
  }
  if ([401, 403].includes(response.status)) {
    clearAuthentication();
    return null;
  }
  throw new Error("The authentication service is unavailable.");
}

export function validateSession() {
  if (!sessionRequest) {
    sessionRequest = performSessionValidation().finally(() => {
      sessionRequest = null;
    });
  }
  return sessionRequest;
}

async function performLogout() {
  const activeRefresh = refreshRequest;
  // A fetch abort does not guarantee that the server ignored the request or
  // its Set-Cookie response. Wait for rotation to settle, then revoke using
  // the browser's newest cookie so logout cannot be undone by a late refresh.
  if (activeRefresh) await activeRefresh.catch(() => false);
  const fallbackToken = legacyRefreshFallbackAvailable
    ? legacyRefreshToken
    : null;
  try {
    let response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if ([400, 401, 403].includes(response.status) && fallbackToken) {
      response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ refreshToken: fallbackToken }),
      });
    }
    return response;
  } finally {
    clearAuthentication();
  }
}

export function logout() {
  if (!logoutRequest) {
    logoutInProgress = true;
    logoutRequest = performLogout();
  }
  return logoutRequest;
}

export function createAuthenticatedSocket(): Socket {
  const socket = io({
    withCredentials: true,
    auth: (callback) =>
      callback(accessToken ? { token: accessToken } : {}),
  });
  let handlingAuthenticationError = false;
  socket.on(
    "connect_error",
    (error: Error & { data?: { code?: unknown } }) => {
      const code =
        typeof error.data?.code === "string" ? error.data.code : "";
      if (
        handlingAuthenticationError ||
        !/auth|token|session|unauthor/i.test(`${code} ${error.message}`)
      )
        return;
      handlingAuthenticationError = true;
      void refreshAuthentication()
        .then((refreshed) => {
          if (refreshed) socket.connect();
          else if (!logoutInProgress) redirectToLogin();
        })
        .finally(() => {
          handlingAuthenticationError = false;
        });
    },
  );
  return socket;
}

export async function api<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await authenticatedFetch(url, {
    ...init,
    headers: {
      ...(init?.body instanceof FormData ? {} : { "content-type": "application/json" }),
      ...init?.headers,
    },
  });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
  return body as T;
}

