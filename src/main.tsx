import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  NavLink,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import { io } from "socket.io-client";
import "./styles.css";
const modules = [
  ["Dashboard", "/"],
  ["Authentication", "/auth/login"],
  ["Forms", "/forms/basic"],
  ["Interactions", "/interactions/buttons"],
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
const api = async (url: string, init?: RequestInit) => {
  const token = localStorage.getItem("token");
  const r = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const data = r.status === 204 ? null : await r.json();
  if (!r.ok) throw Error(data.error || `HTTP ${r.status}`);
  return data;
};
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
    <details className="info" open>
      <summary>Test Information</summary>
      <dl>
        <dt>Page</dt>
        <dd>{name}</dd>
        <dt>URL</dt>
        <dd>{location.pathname}</dd>
        <dt>Concepts</dt>
        <dd>{concepts}</dd>
        <dt>Recommended locators</dt>
        <dd>role, accessible name, id, data-testid</dd>
        <dt>Expected behavior</dt>
        <dd>Actions produce a visible, deterministic result.</dd>
        <dt>Suggested assertions</dt>
        <dd>Visible status, API response, persisted state</dd>
        <dt>Relevant APIs</dt>
        <dd>{apiEndpoints.join(", ") || "None"}</dd>
      </dl>
      <button onClick={() => location.reload()}>Reset module</button>
    </details>
  );
}
function Layout() {
  const [open, setOpen] = useState(false);
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
          <span data-testid="environment">TEST MODE</span>
          <button
            onClick={() => document.documentElement.classList.toggle("dark")}
          >
            ◐ Theme
          </button>
        </header>
        <main id="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/auth/*" element={<Auth />} />
            <Route path="/forms/*" element={<Forms />} />
            <Route path="/interactions/*" element={<Interactions />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/windows" element={<Windows />} />
            <Route path="/frames" element={<Windows />} />
            <Route path="/tables/*" element={<Tables />} />
            <Route path="/crud/products" element={<Products />} />
            <Route path="/shop/*" element={<Shop />} />
            <Route path="/files/*" element={<Files />} />
            <Route path="/dynamic-elements" element={<Dynamic />} />
            <Route path="/shadow-dom" element={<Shadow />} />
            <Route path="/storage" element={<Storage />} />
            <Route path="/api-playground" element={<ApiPlay />} />
            <Route path="/realtime" element={<Realtime />} />
            <Route path="/accessibility/*" element={<Accessibility />} />
            <Route path="/visual" element={<Visual />} />
            <Route path="/responsive" element={<Responsive />} />
            <Route path="/i18n" element={<I18n />} />
            <Route path="/errors" element={<Errors />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/test-control" element={<TestControl />} />
            <Route path="*" element={<Errors />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
function Dashboard() {
  return (
    <>
      <h2>Automation practice modules</h2>
      <p className="lead">
        A deterministic, full-stack playground for browser and API automation.
      </p>
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
    </>
  );
}
function Auth() {
  const nav = useNavigate(),
    [form, set] = useState({
      email: "admin@testlab.local",
      password: "Admin123!",
      remember: false,
    }),
    [msg, setMsg] = useState("");
  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const x = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(form),
      });
      localStorage.setItem("token", x.token);
      localStorage.setItem("user", JSON.stringify(x.user));
      setMsg(`Welcome ${x.user.name}`);
      setTimeout(() => nav("/"), 400);
    } catch (e: any) {
      setMsg(e.message);
    }
  };
  return (
    <>
      <h2>Authentication</h2>
      <form className="panel form" onSubmit={login}>
        <label>
          Email
          <input
            id="email"
            name="email"
            type="email"
            value={form.email}
            onChange={(e) => set({ ...form, email: e.target.value })}
            required
          />
        </label>
        <label>
          Password
          <input
            id="password"
            name="password"
            type="password"
            value={form.password}
            onChange={(e) => set({ ...form, password: e.target.value })}
            required
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={form.remember}
            onChange={(e) => set({ ...form, remember: e.target.checked })}
          />
          Remember me
        </label>
        <button data-testid="login-submit">Sign in</button>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            api("/api/auth/forgot", { method: "POST", body: "{}" }).then((x) =>
              setMsg(x.resetCode),
            )
          }
        >
          Forgot password
        </button>
        <output role="status">{msg}</output>
      </form>
      <Info
        name="Login"
        concepts="Positive/negative login, account lock, session persistence, RBAC"
        apiEndpoints={["POST /api/auth/login", "POST /api/auth/forgot"]}
      />
    </>
  );
}
function Forms() {
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
function Interactions() {
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
        <a target="_blank" href="/visual">
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
function Alerts() {
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
function Windows() {
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
function Tables() {
  const [rows, setRows] = useState<any[]>([]),
    [sort, setSort] = useState<"id" | "name">("id"),
    [q, setQ] = useState("");
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token)
      api("/api/users?size=100")
        .then((x) => setRows(x.data))
        .catch(() => {});
    else
      setRows(
        Array.from({ length: 100 }, (_, i) => ({
          id: i + 1,
          name: `QA User ${String(i + 1).padStart(3, "0")}`,
          email: `qa.user${String(i + 1).padStart(3, "0")}@testlab.local`,
          status: "ACTIVE",
        })),
      );
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
function Files() {
  const [msg, setMsg] = useState("");
  const send = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const r = await fetch("/api/files/upload", {
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
function Dynamic() {
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
function Shadow() {
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
function ApiPlay() {
  const [code, setCode] = useState(200),
    [out, setOut] = useState("");
  const go = () =>
    fetch(`/api/status/${code}`).then(async (r) =>
      setOut(`${r.status} ${await r.text()}`),
    );
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
      <a href="/api/docs" target="_blank">
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
function Realtime() {
  const [events, setEvents] = useState<string[]>([]),
    [message, setMessage] = useState("Hello automation");
  useEffect(() => {
    const s = io();
    s.on("status", (x) => setEvents((v) => [`Connected ${x.id}`, ...v]));
    s.on("chat", (x) => setEvents((v) => [x.text, ...v]));
    s.on("test-event", (x) => setEvents((v) => [JSON.stringify(x), ...v]));
    return () => {
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
      <button onClick={() => io().emit("chat", { text: message })}>
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
const translations: any = {
  en: ["Internationalization", "Hello"],
  es: ["Internacionalización", "Hola"],
  fr: ["Internationalisation", "Bonjour"],
  hi: ["अंतर्राष्ट्रीयकरण", "नमस्ते"],
  ar: ["التدويل", "مرحباً"],
};
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
              fetch(`/api/status/${c}`).then(async (r) =>
                setOut(await r.text()),
              )
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
function Admin() {
  const u = JSON.parse(localStorage.getItem("user") || "null");
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
  const [state, setState] = useState("Ready"),
    act = (name: string, body = {}) =>
      api(`/api/test/${name}`, { method: "POST", body: JSON.stringify(body) })
        .then((x) => setState(JSON.stringify(x)))
        .catch((e) => setState(e.message));
  return (
    <>
      <h2>Test Control Center</h2>
      <div className="panel actions">
        <button onClick={() => act("reset")}>Reset database</button>
        <button onClick={() => act("seed")}>Seed database</button>
        <button onClick={() => act("clock", { at: "2026-01-15T12:00:00Z" })}>
          Freeze clock
        </button>
        <button onClick={() => act("network", { delay: 1000, failureRate: 0 })}>
          Configure network
        </button>
        <button
          onClick={() =>
            act("events", { type: "notification", text: "Manual test event" })
          }
        >
          Trigger WebSocket
        </button>
        <button
          onClick={() => {
            localStorage.clear();
            sessionStorage.clear();
            setState("Browser storage cleared");
          }}
        >
          Clear browser state
        </button>
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
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Layout />
    </BrowserRouter>
  </React.StrictMode>,
);
