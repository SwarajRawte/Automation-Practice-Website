import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  AppWindow,
  Boxes,
  Braces,
  CheckCircle2,
  ChevronLeft,
  Command,
  Database,
  FileUp,
  FormInput,
  Globe2,
  Keyboard,
  LayoutDashboard,
  Menu,
  MonitorSmartphone,
  MousePointerClick,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sun,
  Table2,
  User,
  Wifi,
  X,
  Bell,
} from "lucide-react";
import { Brand } from "./components/layout/Brand";
import {
  Phase2Forms,
  Phase2Interactions,
  Phase2Dialogs,
  Phase2Contexts,
} from "./phase2";
import {
  Phase3Tables,
  Phase3Products,
  Phase3Files,
  Phase3Dynamic,
  Phase3ShadowDom,
} from "./phase3";
import {
  Phase4Admin,
  Phase4Network,
  Phase4Realtime,
  Phase4Shop,
} from "./phase4";
import {
  Phase5Accessibility,
  Phase5Errors,
  Phase5I18n,
  Phase5Responsive,
  Phase5Storage,
  Phase5Visual,
} from "./phase5";
import { TestInfoPanel } from "./components/testing/TestInfoPanel";
import {
  acceptLogin,
  authenticatedFetch,
  clearAuthentication,
  createAuthenticatedSocket,
  getSessionUser,
  hasAuthenticationHint,
  logout as logoutSession,
  readCachedUser,
  validateSession,
  type SessionUser,
} from "./authClient";
import "./styles.css";
const modules = [
  ["Dashboard", "/dashboard"],
  ["Authentication", "/auth/login"],
  ["Forms", "/forms/basic"],
  ["Interactions", "/interactions/buttons"],
  ["Mouse & Actions", "/interactions/actions"],
  ["Alerts & Modals", "/alerts"],
  ["Windows & Frames", "/windows"],
  ["Tables", "/tables/dynamic"],
  ["CRUD Products", "/crud/products"],
  ["E-commerce", "/shop/products"],
  ["Files", "/files/upload"],
  ["Dynamic Elements", "/dynamic-elements"],
  ["Shadow DOM", "/shadow-dom"],
  ["Browser Storage", "/storage"],
  ["API & Network", "/api-playground"],
  ["Real-time", "/realtime"],
  ["Accessibility", "/accessibility/good"],
  ["Visual Testing", "/visual"],
  ["Responsive", "/responsive"],
  ["Internationalization", "/i18n"],
  ["Errors", "/errors"],
  ["Admin", "/admin"],
  ["Test Control", "/test-control"],
];
const navGroups = [
  {
    label: "Getting Started",
    items: [
      ["Dashboard", "/dashboard", LayoutDashboard],
      ["Module Catalog", "/dashboard", Boxes],
    ],
  },
  {
    label: "Authentication",
    items: [
      ["Profile", "/profile", User],
      ["Security & Sessions", "/profile", ShieldCheck],
      ["Authorization", "/admin", Braces],
    ],
  },
  {
    label: "UI Automation",
    items: [
      ["Forms", "/forms/basic", FormInput],
      ["Buttons & Interactions", "/interactions/buttons", Activity],
      ["Mouse & Actions", "/interactions/actions", MousePointerClick],
      ["Keyboard", "/interactions/keyboard", Keyboard],
      ["Alerts & Modals", "/alerts", AlertTriangle],
      ["Windows & Frames", "/windows", AppWindow],
      ["Drag & Drop", "/interactions/buttons", Activity],
      ["Tables", "/tables/dynamic", Table2],
    ],
  },
  {
    label: "Application Flows",
    items: [
      ["CRUD Products", "/crud/products", Database],
      ["E-commerce", "/shop/products", ShoppingCart],
      ["File Operations", "/files/upload", FileUp],
    ],
  },
  {
    label: "Advanced",
    items: [
      ["Dynamic Elements", "/dynamic-elements", Activity],
      ["Shadow DOM", "/shadow-dom", Braces],
      ["Browser Storage", "/storage", Database],
      ["API & Network", "/api-playground", Network],
      ["WebSockets", "/realtime", Wifi],
      ["Time & Date", "/dynamic-elements?delay=1000", Activity],
    ],
  },
  {
    label: "Quality",
    items: [
      ["Accessibility", "/accessibility/good", ShieldCheck],
      ["Responsive Testing", "/responsive", MonitorSmartphone],
      ["Visual Testing", "/visual", AppWindow],
      ["Internationalization", "/i18n", Globe2],
      ["Error Handling", "/errors", AlertTriangle],
    ],
  },
  {
    label: "Administration",
    items: [
      ["Admin Dashboard", "/admin", ShieldCheck],
      ["Test Control Center", "/test-control", Settings],
    ],
  },
] as const;

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
  let data: any = null;
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
export function Layout() {
  const [open, setOpen] = useState(false);
  const user = readStoredUser();
  const logout = async () => {
    try {
      await logoutSession();
    } finally {
      window.location.replace("/auth/login");
    }
  };
  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside className={open ? "open" : ""}>
        <h1>E2E Test Lab</h1>
        <input aria-label="Search modules" placeholder="Search modules" />
        <nav>
          {modules.map(([n, p]) => (
            <NavLink key={p} to={p} onClick={() => setOpen(false)}>
              {n}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="shell">
        <header>
          <button
            className="hamb"
            aria-label="Toggle navigation"
            onClick={() => setOpen(!open)}
          >
            ☰
          </button>
          <span data-testid="environment">LOCAL LAB</span>
          <div data-testid="user-menu" className="user-menu">
            <strong>{user?.name}</strong>
            <small>{user?.role}</small>
          </div>
          <button
            onClick={() => document.documentElement.classList.toggle("dark")}
          >
            ◐ Theme
          </button>
          <button
            data-testid="logout-button"
            className="secondary"
            onClick={logout}
          >
            Logout
          </button>
        </header>
        <main id="main">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<NewDashboard />} />
            <Route path="/forms/*" element={<Phase2Forms />} />
            <Route path="/interactions/*" element={<Phase2Interactions />} />
            <Route path="/alerts" element={<Phase2Dialogs />} />
            <Route path="/modals" element={<Phase2Dialogs />} />
            <Route path="/windows" element={<Phase2Contexts />} />
            <Route path="/frames" element={<Phase2Contexts />} />
            <Route path="/tables/*" element={<Phase3Tables />} />
            <Route path="/crud/products" element={<Phase3Products />} />
            <Route path="/shop/*" element={<Phase4Shop />} />
            <Route path="/files/*" element={<Phase3Files />} />
            <Route path="/dynamic-elements" element={<Phase3Dynamic />} />
            <Route path="/shadow-dom" element={<Phase3ShadowDom />} />
            <Route path="/storage" element={<Phase5Storage />} />
            <Route path="/api-playground" element={<Phase4Network />} />
            <Route path="/realtime" element={<Phase4Realtime />} />
            <Route path="/accessibility/*" element={<Phase5Accessibility />} />
            <Route path="/visual" element={<Phase5Visual />} />
            <Route path="/responsive" element={<Phase5Responsive />} />
            <Route path="/i18n" element={<Phase5I18n />} />
            <Route path="/errors" element={<Phase5Errors />} />
            <Route
              path="/admin"
              element={
                <Protected role="ADMIN">
                  <Phase4Admin />
                </Protected>
              }
            />
            <Route
              path="/test-control"
              element={
                <Protected role="ADMIN">
                  <TestControl />
                </Protected>
              }
            />
            <Route path="*" element={<Phase5Errors />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
function AppLayout() {
  const loc = useLocation(),
    [open, setOpen] = useState(false),
    [collapsed, setCollapsed] = useState(false),
    [commandOpen, setCommandOpen] = useState(false),
    [query, setQuery] = useState(""),
    [theme, setTheme] = useState(localStorage.getItem("theme") || "system"),
    [testMode, setTestMode] = useState<boolean | null>(null),
    user = readStoredUser();
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
      .then((health) => setTestMode(health.testMode === true))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setTestMode(false);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    document.title = `E2E Test Lab — ${loc.pathname === "/dashboard" ? "Automation Practice" : loc.pathname.split("/").filter(Boolean).pop()?.replaceAll("-", " ") || "Dashboard"}`;
  }, [loc.pathname]);
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
          {navGroups.map((group) => {
            const visibleItems = group.items.filter(
              ([, path]) => path !== "/test-control" || testMode === true,
            );
            return (
              <section className="nav-group" key={group.label}>
                <h2>{group.label}</h2>
                {visibleItems.map(([name, path, Icon]) => (
                  <NavLink
                    key={`${name}-${path}`}
                    to={path}
                    title={collapsed ? name : undefined}
                    onClick={() => setOpen(false)}
                  >
                    <Icon size={17} />
                    <span>{name}</span>
                  </NavLink>
                ))}
              </section>
            );
          })}
        </nav>
        <div className="sidebar__footer">
          <span className="status-dot" />
          <span>API connected</span>
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
            <span>
              {loc.pathname
                .split("/")
                .filter(Boolean)
                .map((word) => word.replaceAll("-", " "))
                .join(" / ") || "Dashboard"}
            </span>
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
                <dd className="state-success">Connected</dd>
                <dt>Database</dt>
                <dd>SQLite</dd>
                <dt>Test mode</dt>
                <dd>
                  {testMode === null
                    ? "Checking"
                    : testMode
                      ? "Enabled"
                      : "Disabled"}
                </dd>
                <dt>Deterministic</dt>
                <dd>
                  {testMode === null
                    ? "Checking"
                    : testMode
                      ? "Enabled"
                      : "Seeded data only"}
                </dd>
              </dl>
            </div>
          </details>
          <button
            className="icon-btn notification-btn"
            aria-label="Notifications"
            title="Notifications"
          >
            <Bell size={18} />
            <span className="notification-dot" />
          </button>
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
              <NavLink to="/profile">
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
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<NewDashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/forms/*" element={<Phase2Forms />} />
            <Route path="/interactions/*" element={<Phase2Interactions />} />
            <Route path="/alerts" element={<Phase2Dialogs />} />
            <Route path="/modals" element={<Phase2Dialogs />} />
            <Route path="/windows" element={<Phase2Contexts />} />
            <Route path="/frames" element={<Phase2Contexts />} />
            <Route path="/tables/*" element={<Phase3Tables />} />
            <Route path="/crud/products" element={<Phase3Products />} />
            <Route path="/shop/*" element={<Phase4Shop />} />
            <Route path="/files/*" element={<Phase3Files />} />
            <Route path="/dynamic-elements" element={<Phase3Dynamic />} />
            <Route path="/shadow-dom" element={<Phase3ShadowDom />} />
            <Route path="/storage" element={<Phase5Storage />} />
            <Route path="/api-playground" element={<Phase4Network />} />
            <Route path="/realtime" element={<Phase4Realtime />} />
            <Route path="/accessibility/*" element={<Phase5Accessibility />} />
            <Route path="/visual" element={<Phase5Visual />} />
            <Route path="/responsive" element={<Phase5Responsive />} />
            <Route path="/i18n" element={<Phase5I18n />} />
            <Route path="/errors" element={<Phase5Errors />} />
            <Route
              path="/admin"
              element={
                <Protected role="ADMIN">
                  <Phase4Admin />
                </Protected>
              }
            />
            <Route
              path="/test-control"
              element={
                testMode === null ? (
                  <p role="status">Checking test-control availability…</p>
                ) : testMode ? (
                  <Protected role="ADMIN">
                    <TestControl />
                  </Protected>
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route path="*" element={<Phase5Errors />} />
          </Routes>
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
              {modules
                .filter(([, path]) => path !== "/test-control" || testMode)
                .filter(([name, path]) =>
                  `${name} ${path}`.toLowerCase().includes(query.toLowerCase()),
                )
                .map(([name, path]) => (
                  <NavLink
                    key={`${name}-${path}`}
                    to={path}
                    onClick={() => setCommandOpen(false)}
                  >
                    <Command size={16} />
                    <span>
                      <strong>{name}</strong>
                      <small>{path}</small>
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
const moduleMeta = [
  {
    name: "Authentication",
    path: "/auth/login",
    icon: ShieldCheck,
    description: "Login, sessions, protected routes and role authorization.",
    difficulty: "Intermediate",
    scenarios: 12,
    tags: ["Auth", "Security"],
  },
  {
    name: "Forms",
    path: "/forms/basic",
    icon: FormInput,
    description: "Validation, dynamic fields and complex form controls.",
    difficulty: "Intermediate",
    scenarios: 18,
    tags: ["Forms", "Validation"],
  },
  {
    name: "Interactions",
    path: "/interactions/buttons",
    icon: Activity,
    description: "Clicks, hover, keyboard, drag and pointer events.",
    difficulty: "Beginner",
    scenarios: 16,
    tags: ["Mouse", "Keyboard"],
  },
  {
    name: "Tables",
    path: "/tables/dynamic",
    icon: Table2,
    description: "Server grids, sorting, filtering and virtual scrolling.",
    difficulty: "Advanced",
    scenarios: 14,
    tags: ["Data Grid", "API"],
  },
  {
    name: "Product CRUD",
    path: "/crud/products",
    icon: Database,
    description: "Persistent create, edit, conflict, history and undo flows.",
    difficulty: "Advanced",
    scenarios: 13,
    tags: ["CRUD", "Database"],
  },
  {
    name: "File Operations",
    path: "/files/upload",
    icon: FileUp,
    description: "Uploads, validation, progress and deterministic downloads.",
    difficulty: "Intermediate",
    scenarios: 15,
    tags: ["Files", "Network"],
  },
  {
    name: "Dynamic Elements",
    path: "/dynamic-elements",
    icon: Activity,
    description: "Wait strategies, polling, remounts and synchronization.",
    difficulty: "Advanced",
    scenarios: 12,
    tags: ["Waits", "Async"],
  },
  {
    name: "Shadow DOM",
    path: "/shadow-dom",
    icon: Braces,
    description: "Open, nested, dynamic and closed web components.",
    difficulty: "Advanced",
    scenarios: 8,
    tags: ["DOM", "Components"],
  },
  {
    name: "API & Network",
    path: "/api-playground",
    icon: Network,
    description: "Status codes, delays, failures and response assertions.",
    difficulty: "Advanced",
    scenarios: 14,
    tags: ["REST", "Network"],
  },
  {
    name: "Accessibility",
    path: "/accessibility/good",
    icon: ShieldCheck,
    description: "Semantic, keyboard and intentionally problematic examples.",
    difficulty: "Intermediate",
    scenarios: 10,
    tags: ["A11y", "WCAG"],
  },
];
function NewDashboard() {
  const user = readStoredUser(),
    [search, setSearch] = useState(""),
    [difficulty, setDifficulty] = useState("All"),
    [view, setView] = useState<"grid" | "list">("grid");
  const shown = moduleMeta.filter(
    (module) =>
      (difficulty === "All" || module.difficulty === difficulty) &&
      `${module.name} ${module.description} ${module.tags.join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="dashboard" data-testid="dashboard-page">
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow">AUTOMATION PRACTICE</span>
          <h1>Welcome back, {user?.name?.split(" ")[0]}</h1>
          <p>
            Practice real-world end-to-end web automation scenarios in a
            deterministic lab.
          </p>
        </div>
        <span className="role-pill">
          <ShieldCheck size={15} />
          {user?.role}
        </span>
      </section>
      <section className="metrics" aria-label="Practice statistics">
        {[
          [102, "Practice Modules", Boxes],
          [24, "Completed", CheckCircle2],
          [8, "In Progress", Activity],
          [31, "Advanced", Braces],
        ].map(([value, label, Icon]: any) => (
          <article className="metric-card" key={label}>
            <span className="metric-card__icon">
              <Icon size={19} />
            </span>
            <div>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          </article>
        ))}
      </section>
      <section className="catalog">
        <header className="catalog__header">
          <div>
            <h2>Automation Practice</h2>
            <p>Choose a scenario and start testing.</p>
          </div>
          <div className="view-toggle" aria-label="View style">
            <button
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              <Boxes size={16} />
            </button>
            <button
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <Menu size={16} />
            </button>
          </div>
        </header>
        <div className="catalog__filters">
          <label className="search-field">
            <Search size={16} />
            <input
              aria-label="Search modules"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search modules and scenarios"
            />
          </label>
          <label>
            <span className="sr-only">Difficulty</span>
            <select
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value)}
            >
              <option>All</option>
              <option>Beginner</option>
              <option>Intermediate</option>
              <option>Advanced</option>
            </select>
          </label>
          <select aria-label="Category filter">
            <option>All categories</option>
            <option>UI Automation</option>
            <option>Application Flows</option>
            <option>Advanced</option>
          </select>
          <select aria-label="Status filter">
            <option>All statuses</option>
            <option>Not started</option>
            <option>In progress</option>
            <option>Completed</option>
          </select>
          <select aria-label="Sort modules">
            <option>Recommended</option>
            <option>Name A–Z</option>
            <option>Difficulty</option>
          </select>
        </div>
        {shown.length ? (
          <div className={`module-grid module-grid--${view}`}>
            {shown.map((module, index) => (
              <article className="module-card" key={module.name}>
                <div className="module-card__top">
                  <span className="module-card__icon">
                    <module.icon size={20} />
                  </span>
                  <span
                    className={`badge badge--${module.difficulty.toLowerCase()}`}
                  >
                    {module.difficulty}
                  </span>
                </div>
                <h3>{module.name}</h3>
                <p>{module.description}</p>
                <div className="tag-row">
                  {module.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <div className="module-card__progress">
                  <span>Progress</span>
                  <span>{index % 3 === 0 ? "65" : "0"}%</span>
                  <progress max="100" value={index % 3 === 0 ? 65 : 0} />
                </div>
                <footer>
                  <span>{module.scenarios} scenarios</span>
                  <NavLink
                    className="btn btn--primary btn--sm"
                    to={module.path}
                  >
                    Open Lab
                  </NavLink>
                </footer>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Search size={28} />
            <h3>No modules found</h3>
            <p>No testing modules match your filters.</p>
            <button
              className="btn btn--outline"
              onClick={() => {
                setSearch("");
                setDifficulty("All");
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
function Profile() {
  const user = readStoredUser(),
    [tab, setTab] = useState("Profile"),
    [saved, setSaved] = useState("");
  return (
    <div className="settings-page">
      <header className="settings-header">
        <span className="avatar avatar--lg">
          {user?.name
            ?.split(" ")
            .map((x: string) => x[0])
            .slice(0, 2)
            .join("")}
        </span>
        <div>
          <h1>{user?.name}</h1>
          <p>
            {user?.email} · {user?.role}
          </p>
        </div>
      </header>
      <nav className="settings-tabs" aria-label="Profile sections">
        {["Profile", "Security", "Preferences", "Notifications"].map(
          (value) => (
            <button
              aria-current={tab === value ? "page" : undefined}
              onClick={() => setTab(value)}
              key={value}
            >
              {value}
            </button>
          ),
        )}
      </nav>
      <section className="settings-panel">
        <h2>{tab}</h2>
        <p>
          Manage your {tab.toLowerCase()} settings for this local test
          environment.
        </p>
        {tab === "Profile" && (
          <div className="form grid">
            <label>
              Display name
              <input defaultValue={user?.name} />
            </label>
            <label>
              Email address
              <input type="email" defaultValue={user?.email} />
            </label>
            <label>
              Role
              <input value={user?.role} readOnly />
            </label>
          </div>
        )}
        {tab === "Security" && (
          <div className="form">
            <label>
              Current password
              <input type="password" />
            </label>
            <label>
              New password
              <input type="password" />
            </label>
          </div>
        )}
        {tab === "Preferences" && (
          <div className="form grid">
            <label>
              Language
              <select>
                <option>English</option>
                <option>French</option>
              </select>
            </label>
            <label>
              Timezone
              <select>
                <option>America/Toronto</option>
                <option>UTC</option>
              </select>
            </label>
          </div>
        )}
        {tab === "Notifications" && (
          <label className="check">
            <input type="checkbox" defaultChecked />
            Enable lab notifications
          </label>
        )}
        <div className="actions">
          <button
            className="btn btn--primary"
            onClick={() => setSaved("Settings saved successfully.")}
          >
            Save changes
          </button>
          <button className="btn btn--outline">Cancel</button>
        </div>
        <output role="status">{saved}</output>
      </section>
    </div>
  );
}
export function Dashboard() {
  const user = readStoredUser();
  return (
    <div data-testid="dashboard-page">
      <h2>Automation practice modules</h2>
      <p>
        Welcome, <strong>{user?.name}</strong>
      </p>
      <p>
        Your role: <strong>{user?.role}</strong>
      </p>
      <p className="lead">
        A deterministic, full-stack playground for browser and API automation.
      </p>
      <div className="dashboard-tools">
        <label>
          Search modules
          <input
            aria-label="Module search"
            placeholder="Search by module name"
          />
        </label>
        <label>
          Difficulty filter
          <select aria-label="Difficulty filter">
            <option>All difficulties</option>
            <option>Beginner</option>
            <option>Intermediate</option>
            <option>Advanced</option>
          </select>
        </label>
        <label>
          Progress
          <progress max="100" value="0">
            0%
          </progress>
        </label>
      </div>
      {[
        "Beginner",
        "Intermediate",
        "Advanced",
        "Real-world workflows",
        "Accessibility and visual testing",
        "API and network testing",
      ].map((g, gi) => (
        <section key={g}>
          <h3>{g}</h3>
          <div className="cards">
            {modules.slice(gi * 3, gi * 3 + 4).map(([n, p]) => (
              <NavLink className="card" to={p} key={p}>
                <b>{n}</b>
                <span>
                  Difficulty:{" "}
                  {gi < 2 ? "Beginner" : gi < 4 ? "Intermediate" : "Advanced"}
                </span>
                <small>Direct URL: {p}</small>
              </NavLink>
            ))}
          </div>
        </section>
      ))}
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
    } catch (error: any) {
      setMsg(error.message);
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
export function Forms() {
  const [msg, setMsg] = useState("");
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const x = await api("/api/forms", {
        method: "POST",
        body: JSON.stringify(data),
      });
      setMsg(JSON.stringify(x.data, null, 2));
    } catch (e: any) {
      setMsg(e.message);
    }
  };
  return (
    <>
      <h2>Comprehensive form</h2>
      <form className="panel form grid" onSubmit={submit}>
        <label>
          Full name
          <input name="name" minLength={2} maxLength={50} required />
        </label>
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" minLength={8} required />
        </label>
        <label>
          Phone
          <input name="phone" type="tel" pattern="[0-9+ -]{7,}" />
        </label>
        <label>
          Website
          <input name="website" type="url" />
        </label>
        <label>
          Age
          <input name="age" type="number" min="18" max="120" />
        </label>
        <label>
          Role
          <select name="role">
            <option>QA Engineer</option>
            <option>Developer</option>
          </select>
        </label>
        <label>
          Date
          <input name="date" type="date" />
        </label>
        <label>
          Color
          <input name="color" type="color" />
        </label>
        <label>
          Confidence
          <input name="confidence" type="range" />
        </label>
        <label className="wide">
          Notes
          <textarea name="notes" />
        </label>
        <label className="check">
          <input name="terms" type="checkbox" required />
          Accept terms
        </label>
        <input type="hidden" name="source" value="forms-basic" />
        <div className="wide">
          <button>Submit</button>{" "}
          <button type="reset" className="secondary">
            Reset
          </button>
        </div>
        <pre className="wide" role="status">
          {msg}
        </pre>
      </form>
      <Info
        name="Forms"
        concepts="HTML controls, validation, server errors, submission confirmation"
        apiEndpoints={["POST /api/forms"]}
      />
    </>
  );
}
export function Interactions() {
  const [log, setLog] = useState<string[]>([]),
    add = (x: string) => setLog((v) => [x, ...v]);
  return (
    <>
      <h2>Mouse & keyboard interactions</h2>
      <div className="panel actions">
        <button onClick={() => add("clicked")}>Normal click</button>
        <button onDoubleClick={() => add("double-clicked")}>
          Double click
        </button>
        <button
          onContextMenu={(e) => {
            e.preventDefault();
            add("right-clicked");
          }}
        >
          Right click
        </button>
        <button onMouseEnter={() => add("hovered")}>Hover me</button>
        <button disabled>Disabled</button>
        <button aria-label="Icon action" onClick={() => add("icon action")}>
          ★
        </button>
        <a href="#event-log">Scroll to log</a>
        <a target="_blank" rel="noreferrer noopener" href="/visual">
          New tab
        </a>
        <input
          aria-label="Keyboard capture"
          onKeyDown={(e) => add(`${e.key} code=${e.code} ctrl=${e.ctrlKey}`)}
        />
      </div>
      <h3 id="event-log">Event log</h3>
      <ol data-testid="event-log">
        {log.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ol>
      <Info
        name="Interactions"
        concepts="click, double click, context menu, hover, keyboard, tabs"
      />
    </>
  );
}
export function Alerts() {
  const [result, setResult] = useState("No response");
  const [modal, setModal] = useState(false);
  return (
    <>
      <h2>Alerts, modals & notifications</h2>
      <div className="actions">
        <button
          onClick={() => {
            alert("Deterministic alert");
            setResult("Alert accepted");
          }}
        >
          Alert
        </button>
        <button
          onClick={() =>
            setResult(confirm("Confirm action?") ? "Confirmed" : "Cancelled")
          }
        >
          Confirm
        </button>
        <button
          onClick={() =>
            setResult(prompt("Enter value", "test response") || "Cancelled")
          }
        >
          Prompt
        </button>
        <button onClick={() => setModal(true)}>Open custom modal</button>
      </div>
      <output role="status">{result}</output>
      {modal && (
        <div className="overlay" onClick={() => setModal(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="modal-title">Custom modal</h3>
            <input autoFocus aria-label="Modal value" />
            <button onClick={() => setModal(false)}>Close</button>
          </div>
        </div>
      )}
      <Info
        name="Alerts and modals"
        concepts="native dialogs, custom modal, focus, outside click"
      />
    </>
  );
}
export function Windows() {
  return (
    <>
      <h2>Windows, tabs & frames</h2>
      <div className="actions">
        <button
          onClick={() =>
            window.open(
              "/visual?window=child",
              "testlab-child",
              "width=600,height=500",
            )
          }
        >
          Open child window
        </button>
        <button
          onClick={() =>
            ["one", "two"].forEach((x) =>
              window.open(`/visual?tab=${x}`, "_blank"),
            )
          }
        >
          Open multiple tabs
        </button>
      </div>
      <iframe
        title="Basic test frame"
        srcDoc={
          '<h1 id="frame-title">Unique basic iframe</h1><button id="frame-button">Frame action</button>'
        }
      />
      <Info
        name="Windows and frames"
        concepts="window handles, new tabs, iframe context"
      />
    </>
  );
}
export function Tables() {
  const [rows, setRows] = useState<any[]>([]),
    [sort, setSort] = useState<"id" | "name">("id"),
    [q, setQ] = useState("");
  useEffect(() => {
    const fallbackRows = () =>
      Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        name: `QA User ${String(i + 1).padStart(3, "0")}`,
        email: `qa.user${String(i + 1).padStart(3, "0")}@testlab.local`,
        status: "ACTIVE",
      }));
    if (getSessionUser())
      api("/api/users?size=100")
        .then((x) => setRows(x.data))
        .catch(() => setRows(fallbackRows()));
    else setRows(fallbackRows());
  }, []);
  const shown = rows
    .filter((x) => x.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) =>
      String(a[sort]).localeCompare(String(b[sort]), undefined, {
        numeric: true,
      }),
    );
  return (
    <>
      <h2>User data grid</h2>
      <label>
        Global search
        <input value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <button onClick={() => setSort(sort === "id" ? "name" : "id")}>
        Sort by {sort === "id" ? "name" : "id"}
      </button>
      <div className="table-wrap">
        <table>
          <caption>Deterministic test users</caption>
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Email</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(0, 25).map((x) => (
              <tr key={x.id}>
                <td>{x.id}</td>
                <td>{x.name}</td>
                <td>{x.email}</td>
                <td>{x.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Info
        name="Tables"
        concepts="100 rows, sorting, filtering, responsive table"
        apiEndpoints={["GET /api/users"]}
      />
    </>
  );
}
function Products() {
  const [items, setItems] = useState<any[]>([]),
    [q, setQ] = useState("");
  const load = () =>
    api(`/api/products?size=30&q=${encodeURIComponent(q)}`).then((x) =>
      setItems(x.data),
    );
  useEffect(() => {
    void load();
  }, []);
  return (
    <>
      <h2>Product management</h2>
      <div className="actions">
        <input
          aria-label="Search products"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button onClick={load}>Search</button>
      </div>
      <div className="cards">
        {items.map((x) => (
          <article className="card" key={x.id}>
            <b>{x.name}</b>
            <span>{x.category}</span>
            <strong>${x.price.toFixed(2)}</strong>
            <small>
              Stock: {x.inventory} · {x.status}
            </small>
          </article>
        ))}
      </div>
      <Info
        name="CRUD products"
        concepts="real database data, search, inventory, status"
        apiEndpoints={["GET/POST /api/products", "DELETE /api/products/:id"]}
      />
    </>
  );
}
// Kept as a compact legacy fixture for backwards-compatible source examples.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Shop() {
  const [cart, setCart] = useState<any[]>(
      JSON.parse(localStorage.getItem("cart") || "[]"),
    ),
    [products, setProducts] = useState<any[]>([]);
  useEffect(() => {
    api("/api/products?size=12").then((x) => setProducts(x.data));
  }, []);
  const add = (p: any) => {
    const n = [...cart, p];
    setCart(n);
    localStorage.setItem("cart", JSON.stringify(n));
  };
  return (
    <>
      <h2>Mock shop</h2>
      <p>
        Cart items: <b data-testid="cart-count">{cart.length}</b> · Total: $
        {cart.reduce((s, x) => s + x.price, 0).toFixed(2)}
      </p>
      <div className="cards">
        {products.map((p) => (
          <article className="card" key={p.id}>
            <b>{p.name}</b>
            <strong>${p.price.toFixed(2)}</strong>
            <button disabled={!p.inventory} onClick={() => add(p)}>
              {p.inventory ? "Add to cart" : "Out of stock"}
            </button>
          </article>
        ))}
      </div>
      <Info
        name="E-commerce"
        concepts="catalog, cart persistence, totals, out-of-stock"
        apiEndpoints={["GET /api/products"]}
      />
    </>
  );
}
export function Files() {
  const [msg, setMsg] = useState("");
  const send = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const r = await authenticatedFetch("/api/files/upload", {
      method: "POST",
      body: new FormData(e.currentTarget),
    });
    setMsg(JSON.stringify(await r.json()));
  };
  return (
    <>
      <h2>File upload & download</h2>
      <form className="panel form" onSubmit={send}>
        <label>
          Choose up to five files
          <input name="files" type="file" multiple required />
        </label>
        <button>Upload</button>
        <output>{msg}</output>
      </form>
      <a className="button" href="/api/files/download" download>
        Download deterministic text file
      </a>
      <Info
        name="Files"
        concepts="multi-upload, limits, download attachment"
        apiEndpoints={["POST /api/files/upload", "GET /api/files/download"]}
      />
    </>
  );
}
export function Dynamic() {
  const p = new URLSearchParams(location.search),
    delay = Number(p.get("delay") || 1500),
    [state, setState] = useState("Loading…");
  useEffect(() => {
    const t = setTimeout(() => setState("Dynamic content ready"), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <>
      <h2>Dynamic elements</h2>
      <div
        className="skeleton"
        aria-busy={state !== "Dynamic content ready"}
        data-testid="dynamic-result"
      >
        {state}
      </div>
      <progress
        max={delay}
        value={state === "Dynamic content ready" ? delay : delay / 2}
      />
      <p>Configured deterministic delay: {delay} ms</p>
      <Info
        name="Dynamic elements"
        concepts="explicit waits, delayed render, progress, query configuration"
        apiEndpoints={["GET /api/delay/:ms"]}
      />
    </>
  );
}
class LabElement extends HTMLElement {
  connectedCallback() {
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML =
      '<style>button{padding:10px;background:#7257ff;color:white}</style><label>Shadow input <input id="shadow-input"></label><button id="shadow-button">Shadow action</button><output id="shadow-output"></output>';
    root
      .querySelector("button")!
      .addEventListener(
        "click",
        () =>
          (root.querySelector("output")!.textContent = "Shadow button clicked"),
      );
  }
}
customElements.get("lab-element") ||
  customElements.define("lab-element", LabElement);
export function Shadow() {
  return (
    <>
      <h2>Shadow DOM & web components</h2>
      {React.createElement("lab-element" as any, {
        "data-testid": "shadow-host",
      })}
      <p>
        Open roots are automation-accessible. Closed roots intentionally
        restrict direct access.
      </p>
      <Info
        name="Shadow DOM"
        concepts="open shadow root, shadow input, shadow button"
      />
    </>
  );
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Storage() {
  const [v, setV] = useState(
    () => localStorage.getItem("lab-preference") || "unset",
  );
  return (
    <>
      <h2>Cookies, storage & sessions</h2>
      <div className="actions">
        <button
          onClick={() => {
            document.cookie = "testlab=session; SameSite=Lax";
            setV("cookie set");
          }}
        >
          Set cookie
        </button>
        <button
          onClick={() => {
            localStorage.setItem("lab-preference", "dark");
            setV("dark");
          }}
        >
          Set local storage
        </button>
        <button
          onClick={() => {
            sessionStorage.setItem("lab-session", "active");
            setV("active");
          }}
        >
          Set session storage
        </button>
        <button
          onClick={() => {
            localStorage.clear();
            sessionStorage.clear();
            setV("cleared");
          }}
        >
          Clear storage
        </button>
      </div>
      <pre data-testid="storage-panel">
        Value: {v}
        {"\n"}Cookie: {document.cookie}
      </pre>
      <Info
        name="Storage"
        concepts="cookies, localStorage, sessionStorage, persistence"
      />
    </>
  );
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ApiPlay() {
  const [code, setCode] = useState(200),
    [out, setOut] = useState("");
  const go = () =>
    authenticatedFetch(`/api/status/${code}`, undefined, {
      retryOnUnauthorized: false,
      redirectOnUnauthorized: false,
    }).then(async (r) => setOut(`${r.status} ${await r.text()}`));
  return (
    <>
      <h2>API & network playground</h2>
      <label>
        Status code
        <select value={code} onChange={(e) => setCode(Number(e.target.value))}>
          {[
            200, 201, 204, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503,
          ].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <button onClick={go}>Send request</button>
      <pre role="status">{out}</pre>
      <a href="/api/docs" target="_blank" rel="noreferrer noopener">
        Open interactive API documentation
      </a>
      <Info
        name="API playground"
        concepts="HTTP status codes, headers, malformed/error handling"
        apiEndpoints={["ALL /api/status/:code", "GET /api/docs"]}
      />
    </>
  );
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Realtime() {
  const [events, setEvents] = useState<string[]>([]),
    [message, setMessage] = useState("Hello automation"),
    socket = React.useRef<ReturnType<typeof createAuthenticatedSocket> | null>(
      null,
    );
  useEffect(() => {
    const s = createAuthenticatedSocket();
    socket.current = s;
    s.on("status", (x) => setEvents((v) => [`Connected ${x.id}`, ...v]));
    s.on("chat", (x) => setEvents((v) => [x.text, ...v]));
    s.on("test-event", (x) => setEvents((v) => [JSON.stringify(x), ...v]));
    return () => {
      socket.current = null;
      s.close();
    };
  }, []);
  return (
    <>
      <h2>Real-time lab</h2>
      <input
        aria-label="Chat message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <button onClick={() => socket.current?.emit("chat", { text: message })}>
        Send chat
      </button>
      <ul>
        {events.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
      <Info
        name="Real-time"
        concepts="WebSocket connection, chat, server-triggered events"
        apiEndpoints={["WS /socket.io", "POST /api/test/events"]}
      />
    </>
  );
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Accessibility() {
  return (
    <>
      <h2>Accessibility practice</h2>
      <section className="panel">
        <h3>Accessible examples</h3>
        <label htmlFor="a11y-name">Name</label>
        <input id="a11y-name" aria-describedby="a11y-help" />
        <small id="a11y-help">Enter your full name.</small>
        <div role="status" aria-live="polite">
          Ready
        </div>
      </section>
      <section className="panel training">
        <h3>Intentionally problematic training examples</h3>
        <input placeholder="Missing label example" />
        <button aria-label=""> </button>
        <h5>Incorrect heading order</h5>
        <p className="low-contrast">Low contrast simulation</p>
      </section>
      <Info
        name="Accessibility"
        concepts="labels, semantics, announcements, deliberate WCAG failures"
      />
    </>
  );
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Visual() {
  const freeze = new URLSearchParams(location.search).get("freeze") === "true";
  return (
    <>
      <h2>Stable visual baseline</h2>
      <div className="visual">
        <div className="metric">
          <b>Build health</b>
          <strong>100%</strong>
        </div>
        <div className="metric">
          <b>Tests</b>
          <strong>42</strong>
        </div>
        <div className="metric">
          <b>Clock</b>
          <strong>
            {freeze ? "12:00:00" : new Date().toLocaleTimeString()}
          </strong>
        </div>
      </div>
      <Info
        name="Visual testing"
        concepts="stable screenshot, freeze query, themes, responsive layout"
      />
    </>
  );
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Responsive() {
  const [size, setSize] = useState([innerWidth, innerHeight]);
  useEffect(() => {
    const f = () => setSize([innerWidth, innerHeight]);
    addEventListener("resize", f);
    return () => removeEventListener("resize", f);
  }, []);
  return (
    <>
      <h2>Responsive testing</h2>
      <div className="viewport">
        {size[0]} × {size[1]} ·{" "}
        {size[0] < 640 ? "mobile" : size[0] < 1000 ? "tablet" : "desktop"}
      </div>
      <div className="mobile-only">Mobile-only element</div>
      <div className="desktop-only">Desktop-only element</div>
      <Info
        name="Responsive"
        concepts="breakpoints, viewport, mobile navigation, touch targets"
      />
    </>
  );
}
// Kept temporarily for compatibility with older saved bundles.
const translations: any = {
  en: ["Internationalization", "Hello"],
  es: ["Internacionalización", "Hola"],
  fr: ["Internationalisation", "Bonjour"],
  hi: ["अंतर्राष्ट्रीयकरण", "नमस्ते"],
  ar: ["التدويل", "مرحباً"],
};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function I18n() {
  const [lang, setLang] = useState(localStorage.getItem("lang") || "en");
  const change = (x: string) => {
    setLang(x);
    localStorage.setItem("lang", x);
  };
  return (
    <div dir={lang === "ar" ? "rtl" : "ltr"}>
      <h2>{translations[lang][0]}</h2>
      <select
        aria-label="Language"
        value={lang}
        onChange={(e) => change(e.target.value)}
      >
        {Object.keys(translations).map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
      <p className="lead">
        {translations[lang][1]} 👋 —{" "}
        {new Intl.DateTimeFormat(lang, { dateStyle: "full" }).format(
          new Date("2026-08-10"),
        )}{" "}
        —{" "}
        {new Intl.NumberFormat(lang, {
          style: "currency",
          currency: "CAD",
        }).format(1234.56)}
      </p>
      <Info
        name="Internationalization"
        concepts="five languages, RTL, localized date and currency, persistence"
      />
    </div>
  );
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Errors() {
  const [out, setOut] = useState("");
  return (
    <>
      <h2>Error handling lab</h2>
      <div className="actions">
        {[400, 401, 403, 404, 409, 422, 429, 500, 502, 503].map((c) => (
          <button
            key={c}
            onClick={() =>
              authenticatedFetch(`/api/status/${c}`, undefined, {
                retryOnUnauthorized: false,
                redirectOnUnauthorized: false,
              }).then(async (r) => setOut(await r.text()))
            }
          >
            {c}
          </button>
        ))}
      </div>
      <pre>{out}</pre>
      <button onClick={() => setOut("Recovered successfully")}>
        Retry and recover
      </button>
      <Info
        name="Errors"
        concepts="HTTP failures, request IDs, retry and recovery"
        apiEndpoints={["ALL /api/status/:code"]}
      />
    </>
  );
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function Admin() {
  const u = readStoredUser();
  if (u?.role !== "ADMIN")
    return (
      <>
        <h2>403 Forbidden</h2>
        <p>
          Admin role required. Direct URL access is protected in the UI and
          APIs.
        </p>
      </>
    );
  return (
    <>
      <h2>Admin dashboard</h2>
      <div className="visual">
        <div className="metric">
          <b>Users</b>
          <strong>104</strong>
        </div>
        <div className="metric">
          <b>Orders</b>
          <strong>12</strong>
        </div>
        <div className="metric">
          <b>Revenue</b>
          <strong>$8,420</strong>
        </div>
      </div>
      <Products />
      <Info
        name="Admin"
        concepts="role authorization, management, summary metrics"
        apiEndpoints={["GET /api/users", "POST /api/products"]}
      />
    </>
  );
}
function TestControl() {
  const testControlKey = import.meta.env.VITE_TEST_CONTROL_KEY?.trim();
  const [state, setState] = useState("Ready"),
    act = (name: string, body = {}) => {
      const headers = new Headers();
      if (testControlKey) headers.set("x-test-key", testControlKey);
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
