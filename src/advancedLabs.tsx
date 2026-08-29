import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Braces,
  Database,
  ExternalLink,
  Globe2,
  Mail,
  Shapes,
} from "lucide-react";
import { authenticatedFetch } from "./authClient";
import { PageHeader } from "./components/layout/PageHeader";
import { TestInfoPanel } from "./components/testing/TestInfoPanel";

const EDITOR_INITIAL_TEXT =
  "Select words in this deterministic rich-text editor.";
const IDB_NAME = "e2e-test-lab-advanced";
const IDB_STORE = "fixtures";
const OFFLINE_CACHE = "e2e-test-lab-offline-v1";

function secondOrigin() {
  const configured =
    import.meta.env.VITE_SECOND_ORIGIN_URL || "http://localhost:3200";
  try {
    const parsed = new URL(configured);
    return /^https?:$/.test(parsed.protocol)
      ? parsed.origin
      : "http://localhost:3200";
  } catch {
    return "http://localhost:3200";
  }
}

const advancedRoutes = [
  ["/advanced/editor", "Rich editor"],
  ["/advanced/graphics", "SVG & canvas"],
  ["/advanced/browser-apis", "Browser APIs"],
  ["/advanced/offline", "Offline & worker"],
  ["/advanced/events", "SSE & OTP"],
  ["/advanced/cross-origin", "Separate origin"],
] as const;

async function responseJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("content-type", "application/json");
  const response = await authenticatedFetch(url, { ...init, headers });
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok)
    throw new Error(
      body?.error || `Request failed with HTTP ${response.status}`,
    );
  return body as T;
}

function openLabDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(IDB_STORE))
        request.result.createObjectStore(IDB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("IndexedDB failed"));
  });
}

async function writeIndexedFixture() {
  const database = await openLabDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(IDB_STORE, "readwrite");
    transaction
      .objectStore(IDB_STORE)
      .put(
        { id: "fixture-001", title: "Offline test fixture", revision: 1 },
        "current",
      );
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function readIndexedFixture() {
  const database = await openLabDatabase();
  const value = await new Promise<unknown>((resolve, reject) => {
    const request = database
      .transaction(IDB_STORE, "readonly")
      .objectStore(IDB_STORE)
      .get("current");
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return value;
}

function deleteLabDatabase() {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(IDB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Close other lab tabs and retry"));
  });
}

function AdvancedNavigation() {
  return (
    <nav
      className="module-tabs advanced-tabs"
      aria-label="Advanced browser labs"
    >
      {advancedRoutes.map(([path, label]) => (
        <NavLink key={path} to={path}>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

function RichEditorLab() {
  const editor = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Editor ready");
  const [plainText, setPlainText] = useState(EDITOR_INITIAL_TEXT);

  const reset = () => {
    if (editor.current) editor.current.textContent = EDITOR_INITIAL_TEXT;
    setPlainText(EDITOR_INITIAL_TEXT);
    setStatus("Editor reset");
  };
  const boldSelection = () => {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
    if (
      !selection ||
      !range ||
      range.collapsed ||
      !editor.current?.contains(range.commonAncestorContainer)
    ) {
      editor.current?.focus();
      setStatus("Select editor text before applying bold");
      return;
    }
    const strong = document.createElement("strong");
    strong.append(range.extractContents());
    range.insertNode(strong);
    selection.removeAllRanges();
    const after = document.createRange();
    after.selectNodeContents(strong);
    selection.addRange(after);
    setPlainText(editor.current.textContent || "");
    setStatus("Bold formatting applied");
  };

  return (
    <>
      <section className="panel advanced-lab" aria-labelledby="editor-heading">
        <h2 id="editor-heading">Rich contenteditable editor</h2>
        <p id="editor-instructions">
          Select text, apply bold, then continue typing. Toolbar controls follow
          the editor in the focus order.
        </p>
        <div
          ref={editor}
          className="rich-editor"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-describedby="editor-instructions editor-status"
          data-testid="rich-editor"
          onInput={(event) => {
            setPlainText(event.currentTarget.textContent || "");
            setStatus("Editor content changed");
          }}
        >
          {EDITOR_INITIAL_TEXT}
        </div>
        <div
          className="advanced-actions"
          role="toolbar"
          aria-label="Text formatting"
        >
          <button
            type="button"
            onClick={boldSelection}
            data-testid="editor-bold"
          >
            Bold selection
          </button>
          <button type="button" className="secondary" onClick={reset}>
            Clear formatting
          </button>
        </div>
        <div
          id="editor-status"
          className="lab-status"
          role="status"
          aria-live="polite"
        >
          {status}
        </div>
        <output className="advanced-output" data-testid="editor-plain-text">
          Plain text: {plainText}
        </output>
      </section>
      <TestInfoPanel
        name="Rich editor"
        concepts="contenteditable, Selection and Range APIs, toolbar focus order and status announcements"
        scenario="Format a selection, type rich content, and assert both DOM markup and plain text."
        selectors={[
          "[data-testid=rich-editor]",
          "[data-testid=editor-bold]",
          "#editor-status",
        ]}
        onReset={reset}
      />
    </>
  );
}

type Point = { x: number; y: number };

function GraphicsLab() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [point, setPoint] = useState<Point>({ x: 100, y: 70 });
  const [dragging, setDragging] = useState(false);
  const [shape, setShape] = useState("none");

  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, 320, 160);
    context.fillStyle = "#f3f7ff";
    context.fillRect(0, 0, 320, 160);
    context.strokeStyle = "#7891c5";
    context.setLineDash([4, 4]);
    context.strokeRect(10, 10, 300, 140);
    context.setLineDash([]);
    context.beginPath();
    context.arc(point.x, point.y, 14, 0, Math.PI * 2);
    context.fillStyle = "#2457d6";
    context.fill();
  }, [point]);

  const positionFromPointer = (event: PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.round(((event.clientX - bounds.left) / bounds.width) * 320);
    const y = Math.round(((event.clientY - bounds.top) / bounds.height) * 160);
    setPoint({
      x: Math.max(14, Math.min(306, x)),
      y: Math.max(14, Math.min(146, y)),
    });
  };
  const move = (dx: number, dy: number) =>
    setPoint((current) => ({
      x: Math.max(14, Math.min(306, current.x + dx)),
      y: Math.max(14, Math.min(146, current.y + dy)),
    }));
  const reset = () => {
    setPoint({ x: 100, y: 70 });
    setShape("none");
    setDragging(false);
  };
  const chooseShape = (next: string) => setShape(next);
  const onShapeKey = (event: KeyboardEvent<SVGElement>, next: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      chooseShape(next);
    }
  };

  return (
    <>
      <section
        className="panel advanced-lab"
        aria-labelledby="graphics-heading"
      >
        <h2 id="graphics-heading">SVG and canvas interactions</h2>
        <div className="graphics-grid">
          <div>
            <h3>Accessible SVG</h3>
            <svg
              viewBox="0 0 320 160"
              className="lab-svg"
              role="group"
              aria-labelledby="svg-title svg-description"
              data-testid="interactive-svg"
            >
              <title id="svg-title">Selectable test shapes</title>
              <desc id="svg-description">
                A circle, square and triangle that can be selected by keyboard.
              </desc>
              <circle
                cx="60"
                cy="80"
                r="24"
                role="button"
                tabIndex={0}
                aria-label="Select circle"
                data-testid="svg-circle"
                onClick={() => chooseShape("circle")}
                onKeyDown={(event) => onShapeKey(event, "circle")}
              />
              <rect
                x="135"
                y="56"
                width="48"
                height="48"
                role="button"
                tabIndex={0}
                aria-label="Select square"
                onClick={() => chooseShape("square")}
                onKeyDown={(event) => onShapeKey(event, "square")}
              />
              <polygon
                points="260,50 290,108 230,108"
                role="button"
                tabIndex={0}
                aria-label="Select triangle"
                onClick={() => chooseShape("triangle")}
                onKeyDown={(event) => onShapeKey(event, "triangle")}
              />
            </svg>
            <div
              className="advanced-actions"
              aria-label="Shape selection alternatives"
            >
              {["circle", "square", "triangle"].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => chooseShape(item)}
                >
                  Select {item}
                </button>
              ))}
            </div>
            <output
              className="lab-status"
              data-testid="selected-shape"
              aria-live="polite"
            >
              Selected shape: {shape}
            </output>
          </div>
          <div>
            <h3>Canvas pointer target</h3>
            <canvas
              ref={canvas}
              width="320"
              height="160"
              className="lab-canvas"
              role="img"
              aria-label={`Movable blue point at x ${point.x}, y ${point.y}`}
              data-testid="interactive-canvas"
              onPointerDown={(event) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                setDragging(true);
                positionFromPointer(event);
              }}
              onPointerMove={(event) => dragging && positionFromPointer(event)}
              onPointerUp={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
                setDragging(false);
              }}
            />
            <div
              className="direction-controls"
              aria-label="Move point without dragging"
            >
              <button type="button" onClick={() => move(0, -10)}>
                Up
              </button>
              <button type="button" onClick={() => move(-10, 0)}>
                Left
              </button>
              <button type="button" onClick={() => move(10, 0)}>
                Right
              </button>
              <button type="button" onClick={() => move(0, 10)}>
                Down
              </button>
            </div>
            <output
              className="lab-status"
              data-testid="canvas-position"
              aria-live="polite"
            >
              Position: {point.x}, {point.y}
            </output>
          </div>
        </div>
      </section>
      <TestInfoPanel
        name="SVG and canvas"
        concepts="SVG element targeting, canvas coordinates, pointer capture, WCAG 2.2 SC 2.5.7 dragging alternatives and SC 2.5.8 target size"
        scenario="Select SVG shapes and move the canvas point with either pointer drag or four direction buttons."
        selectors={[
          "[data-testid=interactive-svg]",
          "[data-testid=svg-circle]",
          "[data-testid=canvas-position]",
        ]}
        expected="Every pointer-only action has an equivalent named control with a target of at least 24 CSS pixels."
        onReset={reset}
      />
    </>
  );
}

function BrowserApisLab() {
  const [databaseResult, setDatabaseResult] = useState("IndexedDB ready");
  const [clipboardResult, setClipboardResult] = useState("Clipboard not used");
  const [permissionResult, setPermissionResult] = useState(
    "Permissions not queried",
  );
  const [locationResult, setLocationResult] = useState(
    "Location not requested",
  );

  const run = async (
    task: () => Promise<void>,
    failure: (message: string) => void,
  ) => {
    try {
      await task();
    } catch (error) {
      failure(error instanceof Error ? error.message : "Browser API failed");
    }
  };
  const reset = () =>
    run(async () => {
      await deleteLabDatabase();
      setDatabaseResult("IndexedDB cleared");
      setClipboardResult("Clipboard not used");
      setPermissionResult("Permissions not queried");
      setLocationResult("Location not requested");
    }, setDatabaseResult);

  return (
    <>
      <section className="panel advanced-lab" aria-labelledby="apis-heading">
        <h2 id="apis-heading">
          IndexedDB, clipboard, geolocation and permissions
        </h2>
        <div className="browser-api-grid">
          <article>
            <h3>IndexedDB fixture</h3>
            <div className="advanced-actions">
              <button
                type="button"
                onClick={() =>
                  run(async () => {
                    await writeIndexedFixture();
                    setDatabaseResult("Fixture written");
                  }, setDatabaseResult)
                }
              >
                Write fixture
              </button>
              <button
                type="button"
                onClick={() =>
                  run(async () => {
                    const value = await readIndexedFixture();
                    setDatabaseResult(JSON.stringify(value));
                  }, setDatabaseResult)
                }
              >
                Read fixture
              </button>
              <button type="button" className="secondary" onClick={reset}>
                Delete database
              </button>
            </div>
            <output
              className="lab-status"
              data-testid="indexeddb-status"
              aria-live="polite"
            >
              {databaseResult}
            </output>
          </article>
          <article>
            <h3>Clipboard</h3>
            <label htmlFor="clipboard-value">Text to copy</label>
            <input
              id="clipboard-value"
              defaultValue="Deterministic clipboard fixture"
            />
            <div className="advanced-actions">
              <button
                type="button"
                onClick={() =>
                  run(async () => {
                    if (!navigator.clipboard)
                      throw new Error(
                        "Clipboard API is unavailable in this context",
                      );
                    const value = (
                      document.querySelector(
                        "#clipboard-value",
                      ) as HTMLInputElement
                    ).value;
                    await navigator.clipboard.writeText(value);
                    setClipboardResult(`Copied ${value.length} characters`);
                  }, setClipboardResult)
                }
              >
                Copy text
              </button>
              <button
                type="button"
                onClick={() =>
                  run(async () => {
                    if (!navigator.clipboard)
                      throw new Error(
                        "Clipboard API is unavailable in this context",
                      );
                    setClipboardResult(
                      `Read: ${await navigator.clipboard.readText()}`,
                    );
                  }, setClipboardResult)
                }
              >
                Read clipboard
              </button>
            </div>
            <output
              className="lab-status"
              data-testid="clipboard-status"
              aria-live="polite"
            >
              {clipboardResult}
            </output>
          </article>
          <article>
            <h3>Permissions</h3>
            <button
              type="button"
              onClick={() =>
                run(async () => {
                  if (!navigator.permissions)
                    throw new Error("Permissions API is unavailable");
                  const geolocation = await navigator.permissions.query({
                    name: "geolocation",
                  });
                  const notifications = await navigator.permissions.query({
                    name: "notifications",
                  });
                  setPermissionResult(
                    `geolocation=${geolocation.state}; notifications=${notifications.state}`,
                  );
                }, setPermissionResult)
              }
            >
              Query permission states
            </button>
            <output
              className="lab-status"
              data-testid="permission-status"
              aria-live="polite"
            >
              {permissionResult}
            </output>
          </article>
          <article>
            <h3>Geolocation</h3>
            <div className="advanced-actions">
              <button
                type="button"
                onClick={() => {
                  if (!navigator.geolocation) {
                    setLocationResult("Geolocation API is unavailable");
                    return;
                  }
                  setLocationResult("Waiting for browser permission");
                  navigator.geolocation.getCurrentPosition(
                    (position) =>
                      setLocationResult(
                        `Browser position: ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`,
                      ),
                    (error) =>
                      setLocationResult(
                        `Geolocation ${error.code}: ${error.message}`,
                      ),
                    {
                      enableHighAccuracy: false,
                      timeout: 5_000,
                      maximumAge: 0,
                    },
                  );
                }}
              >
                Request browser position
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setLocationResult("Mock position: 43.6532, -79.3832")
                }
              >
                Use deterministic mock
              </button>
            </div>
            <output
              className="lab-status"
              data-testid="geolocation-status"
              aria-live="polite"
            >
              {locationResult}
            </output>
          </article>
        </div>
      </section>
      <TestInfoPanel
        name="Browser APIs"
        concepts="IndexedDB transactions, Clipboard, Permissions and Geolocation APIs with deterministic fallbacks"
        scenario="Exercise persistent storage and browser permissions without assuming a permission prompt outcome."
        selectors={[
          "[data-testid=indexeddb-status]",
          "[data-testid=clipboard-status]",
          "[data-testid=geolocation-status]",
        ]}
        expected="Every API reports success, denial, or unavailability through an announced status; mocked location remains deterministic."
        onReset={reset}
      />
    </>
  );
}

function OfflineLab() {
  const [online, setOnline] = useState(navigator.onLine);
  const [worker, setWorker] = useState("Not registered");
  const [cache, setCache] = useState("Cache not checked");

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    addEventListener("online", update);
    addEventListener("offline", update);
    navigator.serviceWorker
      ?.getRegistration("/")
      .then((registration) =>
        setWorker(
          registration?.active?.scriptURL.endsWith("/lab-service-worker.js")
            ? "Registered and active"
            : "Not registered",
        ),
      );
    return () => {
      removeEventListener("online", update);
      removeEventListener("offline", update);
    };
  }, []);

  const reset = async () => {
    const registrations = await navigator.serviceWorker?.getRegistrations();
    await Promise.all(
      (registrations || [])
        .filter((registration) =>
          [
            registration.active,
            registration.installing,
            registration.waiting,
          ].some((entry) =>
            entry?.scriptURL.endsWith("/lab-service-worker.js"),
          ),
        )
        .map((registration) => registration.unregister()),
    );
    await caches.delete(OFFLINE_CACHE);
    setWorker("Not registered");
    setCache("Cache cleared");
  };
  const report = (error: unknown) =>
    setWorker(
      error instanceof Error
        ? error.message
        : "Service worker operation failed",
    );

  return (
    <>
      <section className="panel advanced-lab" aria-labelledby="offline-heading">
        <h2 id="offline-heading">Service worker and offline state</h2>
        <div className="connection-state" data-online={online}>
          <strong>Navigator state</strong>
          <span data-testid="online-state">
            {online ? "online" : "offline"}
          </span>
        </div>
        <div className="advanced-actions">
          <button
            type="button"
            onClick={() => {
              if (!navigator.serviceWorker) {
                setWorker("Service workers are unavailable");
                return;
              }
              navigator.serviceWorker
                .register("/lab-service-worker.js", { scope: "/" })
                .then(async (registration) => {
                  await navigator.serviceWorker.ready;
                  setWorker(`Registered: ${registration.scope}`);
                })
                .catch(report);
            }}
          >
            Register worker
          </button>
          <button
            type="button"
            onClick={() => {
              caches
                .open(OFFLINE_CACHE)
                .then((storage) => storage.match("/offline-lab.json"))
                .then(async (response) =>
                  setCache(
                    response
                      ? `Cached: ${(await response.json()).message}`
                      : "Offline fixture not cached",
                  ),
                )
                .catch((error: unknown) =>
                  setCache(
                    error instanceof Error
                      ? error.message
                      : "Cache check failed",
                  ),
                );
            }}
          >
            Check offline fixture
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => void reset()}
          >
            Unregister and clear
          </button>
        </div>
        <div className="status-stack" role="status" aria-live="polite">
          <span data-testid="worker-status">{worker}</span>
          <span data-testid="cache-status">{cache}</span>
        </div>
        <p className="lab-note">
          Browser automation can toggle its network context, reload this route,
          and assert that the cached fixture remains available.
        </p>
      </section>
      <TestInfoPanel
        name="Offline and service worker"
        concepts="service-worker lifecycle, CacheStorage, navigator.onLine and offline reloads"
        scenario="Register the worker online, verify its precache, then reload while the browser context is offline."
        selectors={[
          "[data-testid=online-state]",
          "[data-testid=worker-status]",
          "[data-testid=cache-status]",
        ]}
        onReset={() => void reset()}
      />
    </>
  );
}

type MailMessage = {
  id: number;
  code: string;
  expiresAt: string;
  used: boolean;
  createdAt: string;
};

function EventsAndOtpLab() {
  const eventSource = useRef<EventSource | null>(null);
  const [events, setEvents] = useState<
    Array<{ sequence: number; kind: string }>
  >([]);
  const [streamStatus, setStreamStatus] = useState("Stream not connected");
  const [mail, setMail] = useState<MailMessage[]>([]);
  const [otp, setOtp] = useState("");
  const [otpStatus, setOtpStatus] = useState("No code requested");

  const refreshMail = async () => {
    const mailbox = await responseJson<{ data: MailMessage[] }>(
      "/api/advanced/mailbox",
    );
    setMail(mailbox.data);
  };
  const reset = () => {
    eventSource.current?.close();
    setEvents([]);
    setStreamStatus("Stream reset");
    setOtp("");
    responseJson("/api/advanced/mailbox", { method: "DELETE" })
      .then(() => {
        setMail([]);
        setOtpStatus("Mailbox cleared");
      })
      .catch((error: unknown) =>
        setOtpStatus(error instanceof Error ? error.message : "Reset failed"),
      );
  };
  useEffect(() => () => eventSource.current?.close(), []);

  return (
    <>
      <section className="panel advanced-lab" aria-labelledby="events-heading">
        <h2 id="events-heading">Server-sent events and accessible OTP</h2>
        <div className="events-mail-grid">
          <article>
            <h3>Finite SSE stream</h3>
            <div className="advanced-actions">
              <button
                type="button"
                onClick={() => {
                  eventSource.current?.close();
                  setEvents([]);
                  setStreamStatus("Connecting");
                  const source = new EventSource(
                    "/api/advanced/events?limit=4",
                    { withCredentials: true },
                  );
                  eventSource.current = source;
                  source.addEventListener("connected", () =>
                    setStreamStatus("Connected"),
                  );
                  source.addEventListener("lab-message", (event) => {
                    const value = JSON.parse(
                      (event as MessageEvent<string>).data,
                    ) as { sequence: number; kind: string };
                    setEvents((current) => {
                      const next = [...current, value];
                      if (next.length === 4) {
                        source.close();
                        setStreamStatus("Completed 4 events");
                      }
                      return next;
                    });
                  });
                  source.onerror = () => {
                    if (source.readyState !== EventSource.CLOSED)
                      setStreamStatus("Stream interrupted; retry pending");
                  };
                }}
              >
                Start event stream
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  eventSource.current?.close();
                  setStreamStatus("Stream closed by user");
                }}
              >
                Close stream
              </button>
            </div>
            <div
              className="lab-status"
              role="status"
              aria-live="polite"
              data-testid="sse-status"
            >
              {streamStatus}
            </div>
            <ol className="event-log" data-testid="sse-events">
              {events.map((event) => (
                <li key={event.sequence}>
                  #{event.sequence}: {event.kind}
                </li>
              ))}
            </ol>
          </article>
          <article>
            <h3>Mock mailbox and one-time code</h3>
            <p id="otp-help">
              Codes support paste, autofill, and a direct fill mechanism so the
              task never depends on memorization or transcription.
            </p>
            <div className="advanced-actions">
              <button
                type="button"
                onClick={() => {
                  responseJson<{ message: string }>(
                    "/api/advanced/mailbox/code",
                    { method: "POST", body: "{}" },
                  )
                    .then(async (result) => {
                      setOtpStatus(result.message);
                      await refreshMail();
                    })
                    .catch((error: unknown) =>
                      setOtpStatus(
                        error instanceof Error
                          ? error.message
                          : "Code request failed",
                      ),
                    );
                }}
              >
                Send sign-in code
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  refreshMail().catch((error: unknown) =>
                    setOtpStatus(
                      error instanceof Error ? error.message : "Mailbox failed",
                    ),
                  )
                }
              >
                Refresh mailbox
              </button>
            </div>
            <div className="mock-mailbox" data-testid="mock-mailbox">
              {mail.length ? (
                mail.map((message) => (
                  <article key={message.id} className="mail-message">
                    <strong>Test Lab sign-in code</strong>
                    <code data-testid="otp-code">{message.code}</code>
                    <span>{message.used ? "Used" : "Available"}</span>
                  </article>
                ))
              ) : (
                <p>Mailbox is empty.</p>
              )}
            </div>
            <label htmlFor="otp-code-input">Six-digit code</label>
            <input
              id="otp-code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              aria-describedby="otp-help"
              value={otp}
              onChange={(event) =>
                setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
            />
            <div className="advanced-actions">
              <button
                type="button"
                disabled={!mail[0] || mail[0].used}
                onClick={() => {
                  setOtp(mail[0]?.code || "");
                  setOtpStatus("Latest code filled without transcription");
                }}
              >
                Fill latest code
              </button>
              <button
                type="button"
                disabled={otp.length !== 6}
                onClick={() => {
                  responseJson<{ message: string }>(
                    "/api/advanced/mailbox/verify",
                    { method: "POST", body: JSON.stringify({ code: otp }) },
                  )
                    .then(async (result) => {
                      setOtpStatus(result.message);
                      await refreshMail();
                    })
                    .catch((error: unknown) =>
                      setOtpStatus(
                        error instanceof Error
                          ? error.message
                          : "Verification failed",
                      ),
                    );
                }}
              >
                Verify code
              </button>
            </div>
            <div
              className="lab-status"
              role="status"
              aria-live="polite"
              data-testid="otp-status"
            >
              {otpStatus}
            </div>
          </article>
        </div>
      </section>
      <TestInfoPanel
        name="SSE and mock mailbox"
        concepts="EventSource framing and cleanup, mock email, single-use OTP, autofill and WCAG 2.2 SC 3.3.8 accessible authentication"
        endpoints={[
          "GET /api/advanced/events",
          "POST /api/advanced/mailbox/code",
          "GET /api/advanced/mailbox",
          "POST /api/advanced/mailbox/verify",
        ]}
        selectors={[
          "[data-testid=sse-events]",
          "[data-testid=mock-mailbox]",
          "[autocomplete=one-time-code]",
          "[data-testid=otp-status]",
        ]}
        expected="The stream produces exactly four ordered events; an OTP can be filled without memory or transcription and succeeds only once."
        onReset={reset}
      />
    </>
  );
}

function CrossOriginLab() {
  const frame = useRef<HTMLIFrameElement>(null);
  const expectedOrigin = secondOrigin();
  const nonce = useRef(crypto.randomUUID());
  const [status, setStatus] = useState("Waiting for the secondary origin");

  const ping = () => {
    const nextNonce = crypto.randomUUID();
    nonce.current = nextNonce;
    frame.current?.contentWindow?.postMessage(
      { type: "test-lab:ping", nonce: nextNonce },
      expectedOrigin,
    );
    setStatus("Ping sent");
  };
  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (
        event.origin !== expectedOrigin ||
        event.source !== frame.current?.contentWindow
      )
        return;
      if (!event.data || typeof event.data !== "object") return;
      const message = event.data as {
        type?: string;
        nonce?: string;
        message?: string;
      };
      if (message.type === "test-lab:pong" && message.nonce === nonce.current)
        setStatus("Verified pong received from the secondary origin");
      if (
        message.type === "test-lab:manual" &&
        typeof message.message === "string"
      )
        setStatus(message.message);
    };
    addEventListener("message", receive);
    return () => removeEventListener("message", receive);
  }, [expectedOrigin]);

  return (
    <>
      <section className="panel advanced-lab" aria-labelledby="origin-heading">
        <h2 id="origin-heading">Genuine separate-origin iframe</h2>
        <p>
          Parent: <code>{location.origin}</code>
          <br />
          Frame: <code>{expectedOrigin}</code>
        </p>
        <div className="advanced-actions">
          <button type="button" onClick={ping}>
            Send origin-checked ping
          </button>
          <a
            className="button secondary"
            href={`${expectedOrigin}/health`}
            target="_blank"
            rel="noreferrer"
          >
            Open origin health <ExternalLink size={15} aria-hidden="true" />
          </a>
        </div>
        <iframe
          ref={frame}
          src={`${expectedOrigin}/lab-frame`}
          title="Separate-origin automation fixture"
          sandbox="allow-scripts allow-same-origin"
          className="cross-origin-frame"
          data-testid="cross-origin-frame"
          onLoad={ping}
        />
        <div
          className="lab-status"
          role="status"
          aria-live="polite"
          data-testid="cross-origin-status"
        >
          {status}
        </div>
        <p className="lab-note">
          Start the optional secondary service with{" "}
          <code>npm run dev:origin</code>. Messages are accepted only when both{" "}
          <code>origin</code> and
          <code>source</code> match the configured frame.
        </p>
      </section>
      <TestInfoPanel
        name="Separate-origin context"
        concepts="cross-origin iframe isolation, exact-target postMessage, source validation, CSP frame-ancestors and new windows"
        scenario="Start the secondary service, send a nonce-bound ping, switch into the iframe, then return to the parent context."
        selectors={[
          "[data-testid=cross-origin-frame]",
          "[data-testid=cross-origin-status]",
          "iframe[title='Separate-origin automation fixture']",
        ]}
        expected="Only a message from the configured frame window and exact secondary origin updates the announced status."
      />
    </>
  );
}

export function AdvancedBrowserLabs() {
  const { pathname } = useLocation();
  let lab = <RichEditorLab />;
  if (pathname.endsWith("/graphics")) lab = <GraphicsLab />;
  if (pathname.endsWith("/browser-apis")) lab = <BrowserApisLab />;
  if (pathname.endsWith("/offline")) lab = <OfflineLab />;
  if (pathname.endsWith("/events")) lab = <EventsAndOtpLab />;
  if (pathname.endsWith("/cross-origin")) lab = <CrossOriginLab />;
  return (
    <>
      <PageHeader
        icon={
          pathname.endsWith("/graphics")
            ? Shapes
            : pathname.endsWith("/browser-apis")
              ? Database
              : pathname.endsWith("/offline")
                ? Globe2
                : pathname.endsWith("/events")
                  ? Mail
                  : pathname.endsWith("/cross-origin")
                    ? ExternalLink
                    : Braces
        }
        title="Advanced Browser Labs"
        description="Automate modern browser capabilities with deterministic fixtures, stable selectors, and accessible alternatives."
      />
      <AdvancedNavigation />
      {lab}
    </>
  );
}
