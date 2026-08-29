import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  Accessibility as AccessibilityIcon,
  AlertTriangle,
  Database,
  Globe2,
  Image,
  MonitorSmartphone,
} from "lucide-react";
import { PageHeader } from "./components/layout/PageHeader";
import { TestInfoPanel } from "./components/testing/TestInfoPanel";
import { authenticatedFetch } from "./authClient";

const LAB_LOCAL_KEY = "phase5-preference";
const LAB_SESSION_KEY = "phase5-session";

function hasCookie(name: string, expectedValue: string) {
  return document.cookie.split(";").some((entry) => {
    const [key, ...value] = entry.trim().split("=");
    return key === name && value.join("=") === expectedValue;
  });
}

export function Phase5Storage() {
  const [revision, setRevision] = useState(0);
  const snapshot = useMemo(
    () => ({
      cookie: hasCookie("phase5-cookie", "active") ? "active" : "unset",
      local: localStorage.getItem(LAB_LOCAL_KEY) || "unset",
      session: sessionStorage.getItem(LAB_SESSION_KEY) || "unset",
    }),
    [revision],
  );
  const refresh = () => setRevision((value) => value + 1);
  const reset = () => {
    localStorage.removeItem(LAB_LOCAL_KEY);
    sessionStorage.removeItem(LAB_SESSION_KEY);
    document.cookie = "phase5-cookie=; Max-Age=0; Path=/; SameSite=Lax";
    refresh();
  };
  return (
    <>
      <PageHeader
        icon={Database}
        title="Browser State Lab"
        description="Exercise cookies and browser storage without modifying the authenticated test session."
        onReset={reset}
      />
      <section
        className="panel phase5-grid"
        aria-label="Browser state controls"
      >
        <button
          onClick={() => {
            document.cookie = "phase5-cookie=active; Path=/; SameSite=Lax";
            refresh();
          }}
        >
          Set cookie
        </button>
        <button
          onClick={() => {
            localStorage.setItem(LAB_LOCAL_KEY, "dark");
            refresh();
          }}
        >
          Set local storage
        </button>
        <button
          onClick={() => {
            sessionStorage.setItem(LAB_SESSION_KEY, "active");
            refresh();
          }}
        >
          Set session storage
        </button>
        <button className="secondary" onClick={reset}>
          Clear lab state
        </button>
      </section>
      <section
        className="panel state-cards"
        data-testid="storage-panel"
        aria-live="polite"
      >
        {Object.entries(snapshot).map(([key, value]) => (
          <div key={key}>
            <span>{key}</span>
            <strong data-testid={`storage-${key}`}>{value}</strong>
          </div>
        ))}
      </section>
      <TestInfoPanel
        name="Browser state"
        concepts="cookies, localStorage, sessionStorage, persistence and isolation"
        selectors={[
          "[data-testid=storage-panel]",
          "[data-testid=storage-local]",
          "button:has-text('Clear lab state')",
        ]}
      />
    </>
  );
}

export function Phase5Accessibility() {
  const { pathname } = useLocation();
  const problematic = pathname.endsWith("/problematic");
  const [message, setMessage] = useState("Ready for input");
  return (
    <>
      <PageHeader
        icon={AccessibilityIcon}
        title="Accessibility Lab"
        description="Compare an accessible workflow with deliberately broken training examples."
      />
      <nav className="module-tabs" aria-label="Accessibility examples">
        <NavLink to="/accessibility/good">Accessible</NavLink>
        <NavLink to="/accessibility/problematic">Problematic</NavLink>
      </nav>
      {!problematic ? (
        <section className="panel form" data-testid="accessible-example">
          <h2>Accessible registration</h2>
          <label htmlFor="a11y-name">Full name</label>
          <input id="a11y-name" aria-describedby="a11y-help" />
          <small id="a11y-help">Enter first and last name.</small>
          <label htmlFor="a11y-role">Role</label>
          <select id="a11y-role">
            <option>Tester</option>
            <option>Developer</option>
          </select>
          <button onClick={() => setMessage("Registration saved")}>
            Save registration
          </button>
          <div role="status" aria-live="polite" data-testid="a11y-status">
            {message}
          </div>
        </section>
      ) : (
        <section className="panel training" data-testid="problematic-example">
          <h2>Known violations</h2>
          <input placeholder="Missing label" />
          <button aria-label=""> </button>
          <h5>Skipped heading level</h5>
          <p className="low-contrast">
            Low contrast text intended for automated detection.
          </p>
          <div onClick={() => setMessage("Mouse-only control used")}>
            Mouse-only action
          </div>
        </section>
      )}
      <TestInfoPanel
        name="Accessibility"
        concepts="accessible names, semantic structure, keyboard operation, live regions and deliberate WCAG failures"
        expected={
          problematic
            ? "Automated scans report the documented violations."
            : "The form is keyboard operable and announces completion."
        }
      />
    </>
  );
}

export function Phase5Visual() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const frozen = params.get("freeze") === "true";
  const variant = params.get("variant") === "changed" ? "changed" : "baseline";
  const [showMask, setShowMask] = useState(false);
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString());
  useEffect(() => {
    if (frozen) return;
    const timer = window.setInterval(
      () => setClock(new Date().toLocaleTimeString()),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [frozen]);
  return (
    <>
      <PageHeader
        icon={Image}
        title="Visual Regression Lab"
        description="Capture a stable baseline, a controlled difference, and a masked dynamic region."
      />
      <nav className="module-tabs" aria-label="Visual variants">
        <Link
          to="/visual?freeze=true"
          className={variant === "baseline" ? "active" : undefined}
          aria-current={variant === "baseline" ? "page" : undefined}
        >
          Stable baseline
        </Link>
        <Link
          to="/visual?freeze=true&variant=changed"
          className={variant === "changed" ? "active" : undefined}
          aria-current={variant === "changed" ? "page" : undefined}
        >
          Changed variant
        </Link>
      </nav>
      <section
        className={`visual-fixture visual-fixture--${variant}`}
        data-testid="visual-fixture"
      >
        <div className="visual-hero">
          <span className="eyebrow">RELEASE HEALTH</span>
          <h2>Automation overview</h2>
          <p>Deterministic content for pixel comparison.</p>
        </div>
        <div className="visual">
          <div className="metric">
            <b>Build health</b>
            <strong>{variant === "changed" ? "96%" : "100%"}</strong>
          </div>
          <div className="metric">
            <b>Tests</b>
            <strong>42</strong>
          </div>
          <div className={`metric ${showMask ? "visual-mask" : ""}`}>
            <b>Clock</b>
            <strong>{frozen ? "12:00:00" : clock}</strong>
          </div>
        </div>
      </section>
      <label className="check">
        <input
          type="checkbox"
          checked={showMask}
          onChange={(event) => setShowMask(event.target.checked)}
        />{" "}
        Mask dynamic clock region
      </label>
      <TestInfoPanel
        name="Visual regression"
        concepts="baseline screenshots, deterministic time, intentional diffs, masking and themes"
        testData={{
          freeze: true,
          variants: ["baseline", "changed"],
          recommendedViewport: "1280x720",
        }}
      />
    </>
  );
}

function breakpoint(width: number) {
  if (width < 620) return "mobile";
  if (width < 900) return "tablet";
  return "desktop";
}

export function Phase5Responsive() {
  const [size, setSize] = useState(() => [innerWidth, innerHeight]);
  useEffect(() => {
    const update = () => setSize([innerWidth, innerHeight]);
    addEventListener("resize", update);
    return () => removeEventListener("resize", update);
  }, []);
  const mode = breakpoint(size[0]);
  return (
    <>
      <PageHeader
        icon={MonitorSmartphone}
        title="Responsive Layout Lab"
        description="Assert deterministic breakpoints, reflow, visibility, orientation, and touch targets."
      />
      <output className="viewport" data-testid="viewport-readout">
        {size[0]} × {size[1]} · {mode} ·{" "}
        {size[0] >= size[1] ? "landscape" : "portrait"}
      </output>
      <section className="responsive-fixture" data-testid="responsive-fixture">
        <article>
          <span>01</span>
          <h3>Discover</h3>
          <p>Cards reflow from three columns to one.</p>
        </article>
        <article>
          <span>02</span>
          <h3>Automate</h3>
          <p>Content order remains stable at every size.</p>
        </article>
        <article>
          <span>03</span>
          <h3>Verify</h3>
          <p>Controls retain accessible touch dimensions.</p>
        </article>
      </section>
      <div className="mobile-only" data-testid="mobile-only">
        Mobile-only navigation aid
      </div>
      <div className="desktop-only" data-testid="desktop-only">
        Desktop-only supporting content
      </div>
      <TestInfoPanel
        name="Responsive behavior"
        concepts="620px and 900px breakpoints, viewport, orientation, reflow and touch targets"
        testData={{ mobile: 375, tablet: 768, desktop: 1280 }}
      />
    </>
  );
}

const locales = {
  en: {
    label: "English",
    title: "Internationalization",
    hello: "Hello",
    locale: "en-CA",
    dir: "ltr",
  },
  es: {
    label: "Español",
    title: "Internacionalización",
    hello: "Hola",
    locale: "es-ES",
    dir: "ltr",
  },
  fr: {
    label: "Français",
    title: "Internationalisation",
    hello: "Bonjour",
    locale: "fr-CA",
    dir: "ltr",
  },
  hi: {
    label: "हिन्दी",
    title: "अंतर्राष्ट्रीयकरण",
    hello: "नमस्ते",
    locale: "hi-IN",
    dir: "ltr",
  },
  ar: {
    label: "العربية",
    title: "التدويل",
    hello: "مرحبًا",
    locale: "ar",
    dir: "rtl",
  },
} as const;
type Language = keyof typeof locales;

export function Phase5I18n() {
  const initial = localStorage.getItem("phase5-language");
  const [language, setLanguage] = useState<Language>(
    initial && initial in locales ? (initial as Language) : "en",
  );
  const value = locales[language];
  const change = (next: Language) => {
    setLanguage(next);
    localStorage.setItem("phase5-language", next);
  };
  return (
    <div dir={value.dir} lang={value.locale}>
      <PageHeader
        icon={Globe2}
        title={value.title}
        description="Validate translated content, bidirectional layout, Unicode input, and locale-aware formatting."
      />
      <section className="panel form i18n-fixture">
        <label htmlFor="language">Language</label>
        <select
          id="language"
          value={language}
          onChange={(event) => change(event.target.value as Language)}
        >
          {Object.entries(locales).map(([key, item]) => (
            <option key={key} value={key}>
              {item.label}
            </option>
          ))}
        </select>
        <p className="i18n-greeting" data-testid="translated-greeting">
          {value.hello} 👋
        </p>
        <dl>
          <dt>Date</dt>
          <dd data-testid="localized-date">
            {new Intl.DateTimeFormat(value.locale, {
              dateStyle: "full",
              timeZone: "UTC",
            }).format(new Date("2026-08-10T12:00:00Z"))}
          </dd>
          <dt>Currency</dt>
          <dd data-testid="localized-currency">
            {new Intl.NumberFormat(value.locale, {
              style: "currency",
              currency: "CAD",
            }).format(1234.56)}
          </dd>
        </dl>
        <label htmlFor="unicode-input">Unicode input</label>
        <input id="unicode-input" defaultValue="QA – 東京 – café" />
      </section>
      <TestInfoPanel
        name="Internationalization"
        concepts="five locales, RTL, Unicode, localized dates and currency, persisted preference"
      />
    </div>
  );
}

export function Phase5Errors() {
  const { pathname } = useLocation();
  const notFound = pathname !== "/errors";
  const [code, setCode] = useState(500);
  const [state, setState] = useState<"idle" | "loading" | "error" | "success">(
    "idle",
  );
  const [result, setResult] = useState<unknown>(null);
  const [attemptedCode, setAttemptedCode] = useState<number | null>(null);
  const [responseCode, setResponseCode] = useState<number | null>(null);
  const request = async (requestedCode = code) => {
    setState("loading");
    setResult(null);
    setAttemptedCode(requestedCode);
    setResponseCode(null);
    try {
      const response = await authenticatedFetch(
        `/api/status/${requestedCode}`,
        undefined,
        {
          retryOnUnauthorized: false,
          redirectOnUnauthorized: false,
        },
      );
      setResponseCode(response.status);
      const text = response.status === 204 ? "" : await response.text();
      let body: unknown = { status: response.status };
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = { status: response.status, message: text };
        }
      }
      setResult(body);
      setState(response.ok ? "success" : "error");
    } catch (error) {
      setResult({
        message:
          error instanceof Error ? error.message : "Network request failed",
      });
      setState("error");
    }
  };
  if (notFound)
    return (
      <>
        <PageHeader
          icon={AlertTriangle}
          title="Page not found"
          description="The requested automation lab route does not exist."
        />
        <section className="panel" data-testid="not-found-page">
          <strong>404</strong>
          <p>No page is registered at {pathname}.</p>
          <Link className="button" to="/dashboard">
            Return to dashboard
          </Link>
        </section>
      </>
    );
  return (
    <>
      <PageHeader
        icon={AlertTriangle}
        title="Error & Recovery Lab"
        description="Trigger predictable HTTP failures, inspect structured details, and verify recovery."
        onReset={() => {
          setState("idle");
          setResult(null);
          setAttemptedCode(null);
          setResponseCode(null);
        }}
      />
      <section className="panel form">
        <label htmlFor="error-code">Response scenario</label>
        <select
          id="error-code"
          value={code}
          onChange={(event) => {
            setCode(Number(event.target.value));
            setState("idle");
            setResult(null);
            setAttemptedCode(null);
            setResponseCode(null);
          }}
        >
          {[400, 401, 403, 404, 409, 422, 429, 500, 502, 503].map((value) => (
            <option key={value} value={value}>
              HTTP {value}
            </option>
          ))}
        </select>
        <div className="actions">
          <button disabled={state === "loading"} onClick={() => request()}>
            {state === "loading" ? "Sending…" : "Send request"}
          </button>
          <button
            className="secondary"
            disabled={state !== "error"}
            onClick={() => request(200)}
          >
            Retry successful request
          </button>
        </div>
      </section>
      <section
        className={`error-result error-result--${state}`}
        role="status"
        aria-live="polite"
        data-testid="error-result"
      >
        <strong>
          {state === "idle"
            ? "No request sent"
            : state === "loading"
              ? `Loading HTTP ${attemptedCode}`
              : state === "success"
                ? "Recovered successfully"
                : responseCode === null
                  ? "Request failed before receiving a response"
                  : `Request failed with HTTP ${responseCode}`}
        </strong>
        {result !== null && <pre>{JSON.stringify(result, null, 2)}</pre>}
      </section>
      <TestInfoPanel
        name="Errors and recovery"
        concepts="HTTP failures, loading states, request IDs, retry and recovery"
        endpoints="ALL /api/status/:code"
        expected="A failed response exposes its status and request ID; retry transitions to success."
      />
    </>
  );
}
