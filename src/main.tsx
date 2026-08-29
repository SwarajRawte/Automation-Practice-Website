import React, { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Bell,
  CheckCircle2,
  ChevronLeft,
  Command,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  Sun,
  User,
  X,
} from "lucide-react";
import { Brand } from "./components/layout/Brand";
import { TestInfoPanel } from "./components/testing/TestInfoPanel";
import {
  acceptLogin,
  authenticatedFetch,
  clearAuthentication,
  getSessionUser,
  hasAuthenticationHint,
  logout as logoutSession,
  readCachedUser,
  validateSession,
  type SessionUser,
} from "./authClient";
import {
  authenticatedRoutes,
  findModuleByPath,
  moduleSearchText,
  navigationGroups,
  searchableModules,
  type RouteComponentKey,
} from "./moduleRegistry";
import "./styles.css";

const DashboardRoute = lazy(() => import("./Dashboard"));
const ProfileRoute = lazy(() => import("./Profile"));
const Phase2Forms = lazy(() =>
  import("./phase2").then((module) => ({ default: module.Phase2Forms })),
);
const Phase2Interactions = lazy(() =>
  import("./phase2").then((module) => ({ default: module.Phase2Interactions })),
);
const Phase2Dialogs = lazy(() =>
  import("./phase2").then((module) => ({ default: module.Phase2Dialogs })),
);
const Phase2Contexts = lazy(() =>
  import("./phase2").then((module) => ({ default: module.Phase2Contexts })),
);
const Phase3Tables = lazy(() =>
  import("./phase3").then((module) => ({ default: module.Phase3Tables })),
);
const Phase3Products = lazy(() =>
  import("./phase3").then((module) => ({ default: module.Phase3Products })),
);
const Phase3Files = lazy(() =>
  import("./phase3").then((module) => ({ default: module.Phase3Files })),
);
const Phase3Dynamic = lazy(() =>
  import("./phase3").then((module) => ({ default: module.Phase3Dynamic })),
);
const Phase3ShadowDom = lazy(() =>
  import("./phase3").then((module) => ({ default: module.Phase3ShadowDom })),
);
const Phase4Shop = lazy(() =>
  import("./phase4").then((module) => ({ default: module.Phase4Shop })),
);
const Phase4Network = lazy(() =>
  import("./phase4").then((module) => ({ default: module.Phase4Network })),
);
const Phase4Realtime = lazy(() =>
  import("./phase4").then((module) => ({ default: module.Phase4Realtime })),
);
const Phase4Admin = lazy(() =>
  import("./phase4").then((module) => ({ default: module.Phase4Admin })),
);
const Phase5Storage = lazy(() =>
  import("./phase5").then((module) => ({ default: module.Phase5Storage })),
);
const Phase5Accessibility = lazy(() =>
  import("./phase5").then((module) => ({
    default: module.Phase5Accessibility,
  })),
);
const Phase5Visual = lazy(() =>
  import("./phase5").then((module) => ({ default: module.Phase5Visual })),
);
const Phase5Responsive = lazy(() =>
  import("./phase5").then((module) => ({ default: module.Phase5Responsive })),
);
const Phase5I18n = lazy(() =>
  import("./phase5").then((module) => ({ default: module.Phase5I18n })),
);
const Phase5Errors = lazy(() =>
  import("./phase5").then((module) => ({ default: module.Phase5Errors })),
);
const AdvancedBrowserLabs = lazy(() =>
  import("./advancedLabs").then((module) => ({
    default: module.AdvancedBrowserLabs,
  })),
);

const routeComponents = {
  dashboard: DashboardRoute,
  profile: ProfileRoute,
  phase2Forms: Phase2Forms,
  phase2Interactions: Phase2Interactions,
  phase2Dialogs: Phase2Dialogs,
  phase2Contexts: Phase2Contexts,
  phase3Tables: Phase3Tables,
  phase3Products: Phase3Products,
  phase3Files: Phase3Files,
  phase3Dynamic: Phase3Dynamic,
  phase3ShadowDom: Phase3ShadowDom,
  phase4Shop: Phase4Shop,
  phase4Network: Phase4Network,
  phase4Realtime: Phase4Realtime,
  phase4Admin: Phase4Admin,
  phase5Storage: Phase5Storage,
  phase5Accessibility: Phase5Accessibility,
  phase5Visual: Phase5Visual,
  phase5Responsive: Phase5Responsive,
  phase5I18n: Phase5I18n,
  phase5Errors: Phase5Errors,
  advancedBrowser: AdvancedBrowserLabs,
  testControl: TestControl,
} satisfies Record<RouteComponentKey, React.ComponentType>;

type StoredUser = SessionUser;

function readStoredUser(): StoredUser | null {
  return getSessionUser() || readCachedUser();
}

function safeReturnUrl(value: string | null, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//"))
    return fallback;
  try {
    const target = new URL(value, window.location.origin);
    if (target.origin !== window.location.origin) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}

const api = async (url: string, init?: RequestInit) => {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData))
    headers.set("content-type", "application/json");
  const r = await authenticatedFetch(url, { ...init, headers });
  const contentType = r.headers.get("content-type") || "";
  let data: Record<string, unknown> | string | null = null;
  if (r.status !== 204) {
    if (contentType.includes("application/json")) {
      data = await r.json();
    } else {
      // A missing API server or an incorrect proxy can return the SPA HTML here.
      // Keep that infrastructure problem out of the form's user-facing errors.
      await r.text();
      data = {
        error:
          "The API returned an unexpected response. Make sure the application server is running and try again.",
      };
    }
  }
  if (!r.ok) {
    throw Error(data?.error || `HTTP ${r.status}`);
  }
  if (!contentType.includes("application/json") && r.status !== 204)
    throw Error(data.error);
  return data;
};
function AuthenticationLoading() {
  return (
    <main className="auth-loading" role="status" aria-live="polite">
      <div className="spinner" />
      Checking your session…
    </main>
  );
}
function AuthenticationError({ message }: { message: string }) {
  return (
    <main className="auth-loading" role="alert">
      <div>
        <strong>Unable to verify your session</strong>
        <p>{message}</p>
        <button onClick={() => window.location.reload()}>Retry</button>
      </div>
    </main>
  );
}
function AuthGate({ children }: { children: React.ReactNode }) {
  const loc = useLocation(),
    nav = useNavigate(),
    [state, setState] = useState<"loading" | "allowed" | "denied" | "error">(
      "loading",
    ),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const hadSession = hasAuthenticationHint();
    validateSession()
      .then((user) => {
        if (!active) return;
        if (user) setState("allowed");
        else {
          setState("denied");
          const reason = hadSession ? "&reason=session-expired" : "";
          nav(
            `/auth/login?returnUrl=${encodeURIComponent(loc.pathname + loc.search)}${reason}`,
            { replace: true },
          );
        }
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "The authentication service is unavailable.",
        );
        setState("error");
      });
    return () => {
      active = false;
    };
  }, []);
  if (state === "loading") return <AuthenticationLoading />;
  if (state === "error") return <AuthenticationError message={error} />;
  return state === "allowed" ? <>{children}</> : null;
}
function PublicGate({ children }: { children: React.ReactNode }) {
  const nav = useNavigate(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    validateSession()
      .then((user) => {
        if (!active) return;
        if (user) nav("/dashboard", { replace: true });
        else setLoading(false);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "The authentication service is unavailable.",
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  if (error) return <AuthenticationError message={error} />;
  return loading ? <AuthenticationLoading /> : <>{children}</>;
}
function Info({
  name,
  concepts,
  apiEndpoints = [],
}: {
  name: string;
  concepts: string;
  apiEndpoints?: string[];
}) {
  return (
    <TestInfoPanel name={name} concepts={concepts} endpoints={apiEndpoints} />
  );
}
function AppLayout() {
  const loc = useLocation(),
    [open, setOpen] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [commandOpen, setCommandOpen] = useState(false),
    [query, setQuery] = useState(""),
    [theme, setTheme] = useState(localStorage.getItem("theme") || "system"),
    [health, setHealth] = useState<{
      status: "checking" | "connected" | "disconnected";
      testMode: boolean;
    }>({ status: "checking", testMode: false }),
    [notificationsOpen, setNotificationsOpen] = useState(false),
    [notificationsRead, setNotificationsRead] = useState(false),
    user = readStoredUser();
  const testMode = health.status === "connected" && health.testMode;
  const currentModule = findModuleByPath(loc.pathname);
  const navGroups = navigationGroups(testMode);
  const moduleNavigationItems = navGroups
    .flatMap((group) => group.items)
    .filter((item) => item.moduleId === currentModule?.id);
  const currentDestination = `${loc.pathname}${loc.search}`;
  const exactNavigationItems = moduleNavigationItems.filter(
    (item) => item.path === currentDestination,
  );
  const activeNavigationItem =
    exactNavigationItems.find((item) => item.label === currentModule?.name) ??
    exactNavigationItems[0] ??
    moduleNavigationItems.find((item) => item.label === currentModule?.name) ??
    moduleNavigationItems[0];
  const activeNavigationKey = activeNavigationItem
    ? `${activeNavigationItem.moduleId}-${activeNavigationItem.label}-${activeNavigationItem.path}`
    : null;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/health", {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Health check failed");
        return (await response.json()) as { testMode?: unknown };
      })
      .then((result) =>
        setHealth({
          status: "connected",
          testMode: result.testMode === true,
        }),
      )
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setHealth({ status: "disconnected", testMode: false });
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    document.title = `E2E Test Lab — ${currentModule?.name ?? "Automation Practice"}`;
  }, [currentModule]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "Escape") setCommandOpen(false);
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  const logout = async () => {
    try {
      await logoutSession();
    } finally {
      window.location.replace("/auth/login");
    }
  };
  return (
    <div className={`app ${collapsed ? "app--collapsed" : ""}`}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar__brand">
          <Brand compact={collapsed} />
          <button
            className="icon-btn sidebar__collapse"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? (
              <PanelLeftOpen size={17} />
            ) : (
              <PanelLeftClose size={17} />
            )}
          </button>
        </div>
        <nav className="sidebar__nav" aria-label="Primary navigation">
          {navGroups.map((group) => (
            <section className="nav-group" key={group.label}>
              <h2>{group.label}</h2>
              {group.items.map(({ label, path, icon: Icon, moduleId }) => {
                const key = `${moduleId}-${label}-${path}`;
                const active = key === activeNavigationKey;
                return (
                  <Link
                    aria-current={active ? "page" : undefined}
                    className={active ? "active" : undefined}
                    key={key}
                    to={path}
                    title={collapsed ? label : undefined}
                    onClick={() => setOpen(false)}
                  >
                    <Icon size={17} />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </section>
          ))}
        </nav>
        <div className="sidebar__footer">
          <span
            className={`status-dot ${health.status === "disconnected" ? "status-dot--error" : ""}`}
          />
          <span>
            {health.status === "checking"
              ? "Checking API"
              : health.status === "connected"
                ? "API connected"
                : "API unavailable"}
          </span>
          <small>v1.0.0</small>
        </div>
      </aside>
      <div className="shell">
        <header className="topbar">
          <button
            className="icon-btn hamb"
            aria-label="Toggle navigation"
            onClick={() => setOpen(!open)}
          >
            <Menu size={20} />
          </button>
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <NavLink to="/dashboard">Automation</NavLink>
            <span>/</span>
            <span>{currentModule?.name ?? "Not found"}</span>
          </nav>
          <button
            className="global-search"
            onClick={() => setCommandOpen(true)}
          >
            <Search size={16} />
            <span>Search modules, pages and APIs</span>
            <kbd>Ctrl K</kbd>
          </button>
          <details className="environment-menu">
            <summary data-testid="environment">
              <span className="status-dot" />
              LOCAL
            </summary>
            <div className="popover">
              <strong>Lab environment</strong>
              <dl>
                <dt>Environment</dt>
                <dd>Local</dd>
                <dt>API</dt>
                <dd
                  className={
                    health.status === "connected"
                      ? "state-success"
                      : "state-error"
                  }
                >
                  {health.status === "checking"
                    ? "Checking"
                    : health.status === "connected"
                      ? "Connected"
                      : "Unavailable"}
                </dd>
                <dt>Database</dt>
                <dd>SQLite</dd>
                <dt>Test mode</dt>
                <dd>
                  {health.status === "checking"
                    ? "Checking"
                    : health.status === "disconnected"
                      ? "Unknown"
                      : testMode
                        ? "Enabled"
                        : "Disabled"}
                </dd>
                <dt>Deterministic</dt>
                <dd>
                  {health.status === "checking"
                    ? "Checking"
                    : health.status === "disconnected"
                      ? "Unknown"
                      : testMode
                        ? "Enabled"
                        : "Seeded data only"}
                </dd>
              </dl>
            </div>
          </details>
          <div className="notification-menu">
            <button
              className="icon-btn notification-btn"
              aria-label="Notifications"
              aria-expanded={notificationsOpen}
              aria-controls="notification-popover"
              title="Notifications"
              onClick={() => setNotificationsOpen((value) => !value)}
            >
              <Bell size={18} />
              {!notificationsRead && <span className="notification-dot" />}
            </button>
            {notificationsOpen && (
              <div
                id="notification-popover"
                className="popover notification-popover"
                role="region"
                aria-label="Notifications"
              >
                <strong>Lab notifications</strong>
                <p>Your practice progress is stored for this account.</p>
                <div className="actions">
                  <NavLink
                    className="btn btn--primary btn--sm"
                    to="/dashboard"
                    onClick={() => setNotificationsOpen(false)}
                  >
                    View progress
                  </NavLink>
                  <button
                    className="btn btn--outline btn--sm"
                    onClick={() => {
                      setNotificationsRead(true);
                      setNotificationsOpen(false);
                    }}
                  >
                    Mark read
                  </button>
                </div>
              </div>
            )}
          </div>
          <label className="theme-select" aria-label="Theme">
            <Sun size={16} />
            <select
              value={theme}
              onChange={(event) => setTheme(event.target.value)}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </label>
          <details className="user-menu" data-testid="user-menu">
            <summary>
              <span className="avatar">
                {user?.name
                  ?.split(" ")
                  .map((part: string) => part[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span className="user-menu__copy">
                <strong>{user?.name}</strong>
                <small>{user?.role}</small>
              </span>
            </summary>
            <div className="popover user-popover">
              <div>
                <strong>{user?.name}</strong>
                <small>{user?.email}</small>
                <span className="badge">{user?.role}</span>
              </div>
              <NavLink to="/profile">
                <User size={15} />
                Profile
              </NavLink>
              <NavLink to="/profile?tab=preferences">
                <Settings size={15} />
                Preferences
              </NavLink>
              <button data-testid="logout-button" onClick={logout}>
                <ChevronLeft size={15} />
                Logout
              </button>
            </div>
          </details>
        </header>
        <main id="main">
          <Suspense fallback={<p role="status">Loading practice module…</p>}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              {authenticatedRoutes.map(({ path, module, component }) => {
                if (!component) return null;
                const Component = routeComponents[component];
                let element: React.ReactNode = <Component />;
                if (module.adminOnly)
                  element = <Protected role="ADMIN">{element}</Protected>;
                if (module.testModeOnly) {
                  element =
                    health.status === "checking" ? (
                      <p role="status">Checking test-control availability…</p>
                    ) : testMode ? (
                      element
                    ) : (
                      <Navigate to="/dashboard" replace />
                    );
                }
                return (
                  <Route
                    key={`${module.id}-${path}`}
                    path={path}
                    element={element}
                  />
                );
              })}
              <Route path="*" element={<Phase5Errors />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      {commandOpen && (
        <div
          className="command-backdrop"
          onMouseDown={() => setCommandOpen(false)}
        >
          <section
            className="command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Global search"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="command-input">
              <Search size={18} />
              <input
                autoFocus
                aria-label="Search modules, pages, scenarios and APIs"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search modules, pages, scenarios and APIs…"
              />
              <button
                className="icon-btn"
                aria-label="Close search"
                onClick={() => setCommandOpen(false)}
              >
                <X size={17} />
              </button>
            </div>
            <div className="command-results">
              {searchableModules(testMode)
                .filter((module) =>
                  moduleSearchText(module).includes(query.trim().toLowerCase()),
                )
                .map((module) => (
                  <NavLink
                    key={module.id}
                    to={module.path}
                    onClick={() => setCommandOpen(false)}
                  >
                    <Command size={16} />
                    <span>
                      <strong>{module.name}</strong>
                      <small>{module.path}</small>
                    </span>
                    <kbd>↵</kbd>
                  </NavLink>
                ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
function Protected({
  children,
  role,
}: {
  children: React.ReactNode;
  role?: string;
}) {
  const nav = useNavigate(),
    loc = useLocation(),
    user = getSessionUser();
  useEffect(() => {
    if (!user)
      nav(
        `/auth/login?returnUrl=${encodeURIComponent(loc.pathname + loc.search)}`,
        {
          replace: true,
        },
      );
  }, []);
  if (!user) return <p role="status">Redirecting to login…</p>;
  if (role && user.role !== role)
    return (
      <>
        <h2>403 Forbidden</h2>
        <p>Your role cannot access this page.</p>
      </>
    );
  return <>{children}</>;
}
function Auth() {
  const loc = useLocation(),
    mode = loc.pathname.split("/").pop() || "login",
    [show, setShow] = useState(false),
    [msg, setMsg] = useState(""),
    [submitting, setSubmitting] = useState(false),
    [form, set] = useState({
      name: "Automation Tester",
      email: "admin@testlab.local",
      password: "",
      currentPassword: "",
      confirmPassword: "",
      token: "",
      remember: false,
    });
  const update = (key: string, value: string | boolean) =>
    set({ ...form, [key]: value });
  const demoAccounts = [
    {
      role: "Administrator",
      email: "admin@testlab.local",
      password: "Admin123!",
    },
    {
      role: "Standard user",
      email: "user@testlab.local",
      password: "User123!",
    },
    {
      role: "Read-only viewer",
      email: "viewer@testlab.local",
      password: "Viewer123!",
    },
  ];
  const fillDemoAccount = (email: string, password: string) => {
    set({ ...form, email, password });
    setMsg("");
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    setSubmitting(true);
    try {
      if (mode === "login") {
        const x = await api("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ ...form, rememberMe: form.remember }),
        });
        acceptLogin(x);
        setMsg(`Welcome ${x.user.name}`);
        const redirect = safeReturnUrl(
          new URLSearchParams(loc.search).get("returnUrl"),
        );
        window.location.replace(redirect);
      } else if (mode === "register") {
        const x = await api("/api/auth/register", {
          method: "POST",
          body: JSON.stringify(form),
        });
        const verificationToken =
          typeof x.verificationToken === "string"
            ? x.verificationToken.trim()
            : "";
        setMsg(
          `${x.message}${verificationToken ? `. Test token: ${verificationToken}` : ""}`,
        );
      } else if (mode === "forgot" || mode === "forgot-password") {
        const x = await api("/api/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email: form.email }),
        });
        setMsg(
          `${x.message}${x.resetToken ? ` Test token: ${x.resetToken}` : ""}`,
        );
      } else if (mode === "reset-password") {
        if (form.password !== form.confirmPassword)
          throw Error("Passwords do not match");
        const x = await api("/api/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ token: form.token, password: form.password }),
        });
        setMsg(x.message);
      } else if (mode === "verify") {
        const x = await api("/api/auth/verify", {
          method: "POST",
          body: JSON.stringify({ token: form.token }),
        });
        setMsg(x.message);
      } else if (mode === "change-password") {
        if (form.password !== form.confirmPassword)
          throw Error("Passwords do not match");
        await api("/api/auth/change-password", {
          method: "POST",
          body: JSON.stringify({
            currentPassword: form.currentPassword,
            newPassword: form.password,
          }),
        });
        clearAuthentication();
        window.location.replace("/auth/login?reason=password-changed");
      }
    } catch (error: unknown) {
      setMsg(error instanceof Error ? error.message : "An error occurred");
      if (mode === "login") set({ ...form, password: "" });
    } finally {
      setSubmitting(false);
    }
  };
  const title: { [key: string]: string } = {
    login: "Sign in",
    register: "Register",
    forgot: "Forgot password",
    "forgot-password": "Forgot password",
    "reset-password": "Reset password",
    verify: "Verify email",
    "change-password": "Change password",
  };
  return (
    <main
      className="login-shell"
      data-testid={mode === "login" ? "login-page" : `auth-${mode}-page`}
    >
      {mode === "login" && (
        <section className="login-intro">
          <Brand />
          <div className="login-intro__copy">
            <span className="eyebrow">BUILT FOR QA ENGINEERS</span>
            <h1>Practice modern web automation with confidence.</h1>
            <p>
              A deterministic environment for mastering real-world browser
              workflows, APIs, synchronization and accessibility.
            </p>
          </div>
          <ul>
            <li>
              <CheckCircle2 size={17} />
              Production-style testing scenarios
            </li>
            <li>
              <CheckCircle2 size={17} />
              Predictable data and reset controls
            </li>
            <li>
              <CheckCircle2 size={17} />
              Designed for every automation framework
            </li>
          </ul>
          <div className="environment-card">
            <span className="status-dot" />
            <div>
              <strong>Test Environment</strong>
              <span>Environment: Local · Mode: Test</span>
            </div>
          </div>
        </section>
      )}
      <section className="login-card">
        <div className="login-brand">
          <Brand />
        </div>
        {new URLSearchParams(loc.search).get("reason") ===
          "session-expired" && (
          <div role="alert" className="session-message">
            Your session has expired. Please log in again.
          </div>
        )}
        {new URLSearchParams(loc.search).get("reason") ===
          "password-changed" && (
          <div role="status" className="session-message">
            Password changed successfully. Sign in with your new password.
          </div>
        )}
        <span className="eyebrow">SECURE ACCESS</span>
        <h2>{mode === "login" ? "Welcome back" : title[mode] || mode}</h2>
        {mode === "login" && (
          <p className="login-card__subtitle">
            Sign in to continue to your automation workspace.
          </p>
        )}
        {mode !== "login" && (
          <div className="actions">
            <NavLink className="button" to="/auth/login">
              Login
            </NavLink>
            <NavLink className="button secondary" to="/auth/register">
              Register
            </NavLink>
            <NavLink className="button secondary" to="/auth/forgot-password">
              Forgot password
            </NavLink>
          </div>
        )}
        <form className="panel form" onSubmit={submit}>
          {mode === "register" && (
            <label>
              Name
              <input
                id="name"
                name="name"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                required
              />
            </label>
          )}
          {["login", "register", "forgot", "forgot-password"].includes(
            mode,
          ) && (
            <label>
              Email
              <input
                id="email"
                name="email"
                type="email"
                data-testid={mode === "login" ? "login-email" : undefined}
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                required
              />
            </label>
          )}
          {mode === "change-password" && (
            <label>
              Current password
              <input
                name="currentPassword"
                type={show ? "text" : "password"}
                value={form.currentPassword}
                onChange={(e) => update("currentPassword", e.target.value)}
                required
              />
            </label>
          )}
          {["login", "register", "reset-password", "change-password"].includes(
            mode,
          ) && (
            <label>
              {mode === "change-password" ? "New password" : "Password"}
              <input
                id="password"
                name="password"
                type={show ? "text" : "password"}
                data-testid={mode === "login" ? "login-password" : undefined}
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                minLength={8}
                required
              />
            </label>
          )}
          {["reset-password", "change-password"].includes(mode) && (
            <label>
              Confirm password
              <input
                name="confirmPassword"
                type={show ? "text" : "password"}
                value={form.confirmPassword}
                onChange={(e) => update("confirmPassword", e.target.value)}
                required
              />
            </label>
          )}
          {["verify", "reset-password"].includes(mode) && (
            <label>
              Test token
              <input
                name="token"
                value={form.token}
                onChange={(e) => update("token", e.target.value)}
                required
              />
            </label>
          )}
          {["login", "register", "reset-password", "change-password"].includes(
            mode,
          ) && (
            <button
              type="button"
              className="secondary"
              data-testid="toggle-password"
              aria-pressed={show}
              onClick={() => setShow(!show)}
            >
              {show ? "Hide password" : "Show password"}
            </button>
          )}
          {mode === "login" && (
            <label className="check">
              <input
                type="checkbox"
                data-testid="remember-me"
                checked={form.remember}
                onChange={(e) => update("remember", e.target.checked)}
              />
              Remember me
            </label>
          )}
          <button
            data-testid={mode === "login" ? "login-submit" : "auth-submit"}
            disabled={submitting}
          >
            {submitting
              ? mode === "login"
                ? "Signing in…"
                : "Submitting…"
              : title[mode] || "Submit"}
          </button>
          <output
            role="alert"
            data-testid={mode === "login" ? "login-error" : undefined}
          >
            {msg}
          </output>
        </form>
        {mode === "login" && (
          <section
            className="demo-accounts"
            aria-labelledby="demo-logins-title"
          >
            <div className="demo-accounts__heading">
              <strong id="demo-logins-title">Demo logins</strong>
              <span>Click an account to fill the form</span>
            </div>
            <div className="demo-accounts__list">
              {demoAccounts.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  className="demo-account"
                  data-testid={`demo-${account.email.split("@")[0]}`}
                  onClick={() =>
                    fillDemoAccount(account.email, account.password)
                  }
                >
                  <span>
                    <strong>{account.role}</strong>
                    <small>{account.email}</small>
                  </span>
                  <code>{account.password}</code>
                </button>
              ))}
            </div>
          </section>
        )}
        {mode === "login" && (
          <div className="login-links">
            <NavLink
              data-testid="forgot-password-link"
              to="/auth/forgot-password"
            >
              Forgot password?
            </NavLink>
            <NavLink data-testid="register-link" to="/auth/register">
              Create an account
            </NavLink>
          </div>
        )}
        <Info
          name={`Authentication: ${title[mode] || mode}`}
          concepts="Registration, verification, lockout, password reset/change, refresh tokens, logout, redirect, RBAC"
          apiEndpoints={[
            "POST /api/auth/login",
            "POST /api/auth/refresh",
            "POST /api/auth/logout",
            "POST /api/auth/register",
            "POST /api/auth/verify",
            "POST /api/auth/forgot",
            "POST /api/auth/reset-password",
            "POST /api/auth/change-password",
          ]}
        />
      </section>
    </main>
  );
}
function TestControl() {
  const [testControlKey, setTestControlKey] = useState("");
  const [state, setState] = useState("Ready"),
    act = (name: string, body = {}) => {
      const headers = new Headers();
      if (testControlKey.trim())
        headers.set("x-test-key", testControlKey.trim());
      return api(`/api/test/${name}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      })
        .then((x) => setState(JSON.stringify(x)))
        .catch((e) => setState(e.message));
    };
  const clearBrowserState = () => {
    localStorage.clear();
    sessionStorage.clear();
    setState("Browser storage cleared; cookie authentication preserved");
  };
  return (
    <>
      <h1>Test Control Center</h1>
      <div className="panel form">
        <label>
          Test control key
          <input
            type="password"
            autoComplete="off"
            data-testid="test-control-key"
            value={testControlKey}
            onChange={(event) => setTestControlKey(event.target.value)}
            placeholder="Enter the server-side test key"
          />
        </label>
        <p className="field-help">
          The key stays in component memory and is never bundled into the
          application.
        </p>
      </div>
      <div className="panel actions">
        <button onClick={() => act("reset")}>Reset database</button>
        <button onClick={() => act("seed")}>Seed database</button>
        <button onClick={() => act("clock", { at: "2026-01-15T12:00:00Z" })}>
          Freeze clock
        </button>
        <button
          onClick={() =>
            act("network", {
              delay: 1000,
              failureRate: 0,
              offline: false,
              statusCode: null,
              rateLimit: 10,
            })
          }
        >
          Configure network
        </button>
        <button
          onClick={() =>
            act("events", { type: "notification", text: "Manual test event" })
          }
        >
          Trigger WebSocket
        </button>
        <button onClick={clearBrowserState}>Clear browser state</button>
      </div>
      <pre role="status">{state}</pre>
      <Info
        name="Test Control Center"
        concepts="reset, seed, frozen clock, network simulation, realtime triggers"
        apiEndpoints={["POST /api/test/*"]}
      />
    </>
  );
}
function ApplicationRoutes() {
  return (
    <Routes>
      <Route
        path="/auth/change-password"
        element={
          <AuthGate>
            <Auth />
          </AuthGate>
        }
      />
      {["login", "register", "forgot-password", "reset-password", "verify"].map(
        (route) => (
          <Route
            key={route}
            path={`/auth/${route}`}
            element={
              <PublicGate>
                <Auth />
              </PublicGate>
            }
          />
        ),
      )}
      <Route path="/auth/*" element={<Navigate to="/auth/login" replace />} />
      <Route
        path="/*"
        element={
          <AuthGate>
            <AppLayout />
          </AuthGate>
        }
      />
    </Routes>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ApplicationRoutes />
    </BrowserRouter>
  </React.StrictMode>,
);

