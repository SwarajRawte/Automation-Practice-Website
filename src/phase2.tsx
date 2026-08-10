import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
const jsonApi = async (url: string, init?: RequestInit) => {
  const r = await fetch(url, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${localStorage.getItem("token") || ""}`,
        ...init?.headers,
      },
    }),
    body = await r.json();
  if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
  return body;
};
function TestInfo({
  name,
  concepts,
  endpoints = "None",
}: {
  name: string;
  concepts: string;
  endpoints?: string;
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
        <dd>Accessible role/name, id, name, data-testid</dd>
        <dt>Expected behavior</dt>
        <dd>Every action produces deterministic visible output.</dd>
        <dt>Suggested assertions</dt>
        <dd>
          Status text, event log, validation summary, persisted confirmation
        </dd>
        <dt>Relevant APIs</dt>
        <dd>{endpoints}</dd>
      </dl>
      <button onClick={() => location.reload()}>Reset module</button>
    </details>
  );
}
export function Phase2Forms() {
  const loc = useLocation(),
    nav = useNavigate(),
    [dynamic, setDynamic] = useState([""]),
    [country, setCountry] = useState("Canada"),
    [errors, setErrors] = useState<string[]>([]),
    [status, setStatus] = useState("");
  if (loc.pathname.endsWith("/confirmation")) {
    const data = JSON.parse(
      sessionStorage.getItem("last-form-submission") || "{}",
    );
    return (
      <>
        <h2>Form submission confirmation</h2>
        <p role="status">Form submitted successfully</p>
        <table>
          <caption>Submitted data</caption>
          <tbody>
            {Object.entries(data).map(([k, v]) => (
              <tr key={k}>
                <th>{k}</th>
                <td>{String(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={() => nav("/forms/basic")}>Submit another</button>
        <TestInfo
          name="Form confirmation"
          concepts="navigation, persisted confirmation data, table assertions"
          endpoints="GET /api/forms/:id"
        />
      </>
    );
  }
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget,
      data = Object.fromEntries(new FormData(form)),
      issues: string[] = [];
    if (String(data.password) !== String(data.confirmPassword))
      issues.push("Passwords must match");
    if (data.employment === "Employed" && !data.company)
      issues.push("Company is required when employed");
    if (new Date(String(data.startDate)) > new Date(String(data.endDate)))
      issues.push("Start date must be before end date");
    setErrors(issues);
    if (issues.length) return;
    try {
      const result = await jsonApi("/api/forms", {
        method: "POST",
        body: JSON.stringify(data),
      });
      sessionStorage.setItem(
        "last-form-submission",
        JSON.stringify(result.data),
      );
      setStatus(result.message);
      nav("/forms/confirmation");
    } catch (error: any) {
      setErrors([error.message]);
    }
  };
  return (
    <>
      <h2>Comprehensive automation form</h2>
      <form
        className="panel form grid phase2-form"
        onSubmit={submit}
        noValidate={loc.pathname.endsWith("/validation")}
      >
        <label>
          Text input
          <input
            id="full-name"
            name="name"
            minLength={2}
            maxLength={50}
            required
            aria-describedby="name-help"
          />
          <small id="name-help">2–50 characters</small>
        </label>
        <label>
          Email
          <input id="form-email" name="email" type="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" minLength={8} required />
        </label>
        <label>
          Confirm password
          <input name="confirmPassword" type="password" required />
        </label>
        <label>
          Number
          <input
            name="quantity"
            type="number"
            min="1"
            max="10"
            defaultValue="1"
          />
        </label>
        <label>
          Telephone
          <input name="phone" type="tel" pattern="[0-9+ -]{7,}" />
        </label>
        <label>
          URL
          <input name="website" type="url" />
        </label>
        <label>
          Search
          <input name="search" type="search" />
        </label>
        <label className="wide">
          Textarea
          <textarea name="notes" minLength={5} maxLength={250} />
        </label>
        <fieldset>
          <legend>Priority</legend>
          {["Low", "Medium", "High"].map((x) => (
            <label className="check" key={x}>
              <input
                type="radio"
                name="priority"
                value={x}
                defaultChecked={x === "Medium"}
              />
              {x}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Skills</legend>
          {["Playwright", "Cypress", "Selenium"].map((x) => (
            <label className="check" key={x}>
              <input type="checkbox" name="skills" value={x} />
              {x}
            </label>
          ))}
        </fieldset>
        <label>
          Single select
          <select name="role">
            <option>QA Engineer</option>
            <option>Developer</option>
            <option>Product Manager</option>
          </select>
        </label>
        <label>
          Multi-select
          <select name="browsers" multiple size={3}>
            <option>Chrome</option>
            <option>Firefox</option>
            <option>Edge</option>
          </select>
        </label>
        <label>
          Searchable dropdown
          <input name="framework" list="frameworks" />
          <datalist id="frameworks">
            <option value="Playwright" />
            <option value="Cypress" />
            <option value="Selenium" />
          </datalist>
        </label>
        <label>
          Autocomplete city
          <input name="city" autoComplete="address-level2" list="cities" />
          <datalist id="cities">
            <option>Toronto</option>
            <option>Madrid</option>
            <option>Paris</option>
          </datalist>
        </label>
        <label>
          Date
          <input name="date" type="date" min="2024-01-01" max="2030-12-31" />
        </label>
        <label>
          Date-time
          <input name="dateTime" type="datetime-local" />
        </label>
        <label>
          Time
          <input name="time" type="time" />
        </label>
        <label>
          Range start
          <input name="startDate" type="date" />
        </label>
        <label>
          Range end
          <input name="endDate" type="date" />
        </label>
        <label>
          Color
          <input name="color" type="color" defaultValue="#6552e8" />
        </label>
        <label>
          Range slider
          <input
            name="confidence"
            type="range"
            min="0"
            max="100"
            defaultValue="50"
          />
        </label>
        <label className="check">
          <input name="notifications" type="checkbox" role="switch" />
          Enable notifications
        </label>
        <label>
          Single file
          <input name="attachment" type="file" />
        </label>
        <label>
          Multiple files
          <input name="attachments" type="file" multiple />
        </label>
        <label>
          Country
          <select
            name="country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option>Canada</option>
            <option>United States</option>
          </select>
        </label>
        <label>
          Province/State
          <select name="region">
            {(country === "Canada"
              ? ["Ontario", "Quebec"]
              : ["California", "New York"]
            ).map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Employment
          <select name="employment">
            <option>Student</option>
            <option>Employed</option>
          </select>
        </label>
        <label>
          Company (conditionally required)
          <input name="company" />
        </label>
        <label>
          Read only
          <input name="readonly" readOnly value="AUTOMATION-LAB" />
        </label>
        <label>
          Disabled
          <input disabled value="Cannot edit" />
        </label>
        <input type="hidden" name="source" value="phase-2-form" />
        {dynamic.map((value, i) => (
          <label className="wide" key={i}>
            Dynamic field {i + 1}
            <span className="inline">
              <input
                name={`dynamic-${i + 1}`}
                value={value}
                onChange={(e) =>
                  setDynamic(
                    dynamic.map((x, j) => (j === i ? e.target.value : x)),
                  )
                }
              />
              <button
                type="button"
                className="danger"
                onClick={() => setDynamic(dynamic.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </span>
          </label>
        ))}
        <button
          type="button"
          className="secondary"
          onClick={() => setDynamic([...dynamic, ""])}
        >
          Add dynamic field
        </button>
        <div className="wide actions">
          <button type="submit" data-testid="form-submit">
            Submit
          </button>
          <button type="reset" className="secondary">
            Reset
          </button>
          <button type="button" className="secondary" onClick={() => nav("/")}>
            Cancel
          </button>
        </div>
        {errors.length > 0 && (
          <div className="validation-summary wide" role="alert">
            <h3>Validation summary</h3>
            <ul>
              {errors.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}
        <output className="wide" role="status">
          {status}
        </output>
      </form>
      <TestInfo
        name="Comprehensive forms"
        concepts="all native controls, dependent/dynamic fields, client and server validation, confirmation navigation"
        endpoints="POST /api/forms, GET /api/forms/:id"
      />
    </>
  );
}

export function Phase2Interactions() {
  const loc = useLocation(),
    keyboard = loc.pathname.endsWith("/keyboard"),
    [log, setLog] = useState<string[]>([]),
    [enabled, setEnabled] = useState(false),
    [delayed, setDelayed] = useState(false),
    [moving, setMoving] = useState(false),
    hold = useRef<number | undefined>(undefined);
  const add = (event: string) =>
    setLog((v) => [`${String(v.length + 1).padStart(2, "0")}: ${event}`, ...v]);
  useEffect(() => {
    const timer = setTimeout(() => setDelayed(true), 1200);
    return () => clearTimeout(timer);
  }, []);
  if (keyboard) return <KeyboardLab />;
  return (
    <>
      <h2>Buttons, links & mouse interactions</h2>
      <div className="panel interaction-stage">
        <button id="normal-click" onClick={() => add("normal click")}>
          Normal click
        </button>
        <button onDoubleClick={() => add("double click")}>Double-click</button>
        <button
          onContextMenu={(e) => {
            e.preventDefault();
            add("right click");
          }}
        >
          Right-click
        </button>
        <button
          onPointerDown={() => {
            hold.current = window.setTimeout(
              () => add("click and hold completed"),
              800,
            );
          }}
          onPointerUp={() => clearTimeout(hold.current)}
        >
          Click and hold
        </button>
        <button
          onMouseEnter={() => add("mouse enter")}
          onMouseLeave={() => add("mouse leave")}
        >
          Hover / leave
        </button>
        <button disabled>Disabled button</button>
        <label className="check">
          <input
            type="checkbox"
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enable next button
        </label>
        <button
          disabled={!enabled}
          onClick={() => add("condition button clicked")}
        >
          Condition button
        </button>
        {delayed ? (
          <button
            data-testid="delayed-button"
            onClick={() => add("delayed button clicked")}
          >
            Delayed button
          </button>
        ) : (
          <span aria-live="polite">Waiting for delayed button…</span>
        )}
        <button
          className={moving ? "moved" : ""}
          onMouseEnter={() => setMoving(!moving)}
          onClick={() => add("moving button caught")}
        >
          Moving target
        </button>
        <button
          aria-label="Star action"
          onClick={() => add("icon-only button")}
        >
          ★
        </button>
        <a href="/forms/basic" onClick={() => add("same-tab link")}>
          Same-tab link
        </a>
        <a href="/visual?tab=new" target="_blank" rel="noreferrer">
          New-tab link
        </a>
        <a href="https://example.com" target="_blank" rel="noreferrer">
          External link
        </a>
        <a href="/api/status/404">Broken-link simulation</a>
        <a href="/api/files/download" download>
          Download link
        </a>
        <button
          onClick={() => {
            const a = document.createElement("a");
            a.href = "/forms/basic";
            a.click();
          }}
        >
          JavaScript link
        </button>
        <button
          onClick={() =>
            document.querySelector("#interaction-log")?.scrollIntoView()
          }
        >
          Scroll to event log
        </button>
        <div className="covered">
          <button onClick={() => add("covered button clicked")}>
            Covered element
          </button>
          <span
            onClick={(e) => {
              (e.currentTarget as HTMLElement).remove();
              add("cover removed");
            }}
          >
            Click cover to remove
          </span>
        </div>
        <button
          className="fab"
          aria-label="Floating action"
          onClick={() => add("floating action")}
        >
          +
        </button>
        <div
          draggable
          onDragStart={(e) => e.dataTransfer.setData("text/plain", "drag-item")}
          className="drag-item"
        >
          Drag me
        </div>
        <div
          className="drop-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => add(`dropped ${e.dataTransfer.getData("text/plain")}`)}
        >
          Drop zone
        </div>
      </div>
      <h3 id="interaction-log">Visible event log</h3>
      <ol data-testid="event-log">
        {log.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ol>
      <TestInfo
        name="Mouse interactions"
        concepts="click variants, hover, hold, delayed/enabled/moving/covered elements, links, drag-drop"
      />
    </>
  );
}
function KeyboardLab() {
  const [last, setLast] = useState<any>(null),
    [items, setItems] = useState(["Alpha", "Bravo", "Charlie"]),
    [active, setActive] = useState(0),
    [modal, setModal] = useState(false);
  const key = (e: React.KeyboardEvent) => {
    setLast({
      key: e.key,
      code: e.code,
      ctrl: e.ctrlKey,
      shift: e.shiftKey,
      alt: e.altKey,
      repeat: e.repeat,
    });
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((x) => Math.min(items.length - 1, x + 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((x) => Math.max(0, x - 1));
    }
    if (e.key === "Enter" && e.ctrlKey) setItems([...items, "Shortcut item"]);
    if (e.key === "Escape") setModal(false);
  };
  return (
    <>
      <h2>Keyboard automation</h2>
      <div className="panel" onKeyDown={key}>
        <label>
          Keyboard capture
          <input
            autoFocus
            aria-label="Keyboard event capture"
            placeholder="Try keys and shortcuts"
          />
        </label>
        <p>Custom shortcut: Control/Command + Enter adds an item.</p>
        <div role="listbox" aria-label="Keyboard listbox" tabIndex={0}>
          {items.map((x, i) => (
            <div
              role="option"
              aria-selected={i === active}
              className={i === active ? "selected" : ""}
              key={x}
            >
              {x}
            </div>
          ))}
        </div>
        <button onClick={() => setModal(true)}>Open keyboard modal</button>
        {modal && (
          <div className="overlay">
            <div
              role="dialog"
              aria-modal="true"
              className="modal"
              onKeyDown={key}
            >
              <h3>Press Escape to close</h3>
              <button autoFocus onClick={() => setModal(false)}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
      <h3>Last keyboard event</h3>
      <pre data-testid="keyboard-details">
        {last ? JSON.stringify(last, null, 2) : "No key pressed"}
      </pre>
      <TestInfo
        name="Keyboard automation"
        concepts="Enter, Escape, Tab, Shift+Tab, arrows, Space, editing/navigation keys, modifiers, keyboard listbox/modal"
      />
    </>
  );
}

type ModalKind = "custom" | "nested" | "form" | "locked" | null;
export function Phase2Dialogs() {
  const [response, setResponse] = useState("No interaction yet"),
    [modal, setModal] = useState<ModalKind>(null),
    [nested, setNested] = useState(false),
    [notice, setNotice] = useState("");
  const toast = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(""), 1800);
  };
  useEffect(() => {
    const t = setTimeout(
      () => setResponse("Delayed modal is ready to trigger"),
      1500,
    );
    return () => clearTimeout(t);
  }, []);
  return (
    <>
      <h2>Alerts, modals, popups & notifications</h2>
      <div className="panel actions">
        <button
          onClick={() => {
            alert("Deterministic JavaScript alert");
            setResponse("Alert accepted");
          }}
        >
          JavaScript alert
        </button>
        <button
          onClick={() =>
            setResponse(
              confirm("Confirm deterministic action?")
                ? "Confirmation accepted"
                : "Confirmation dismissed",
            )
          }
        >
          Confirmation
        </button>
        <button
          onClick={() =>
            setResponse(
              `Prompt response: ${prompt("Enter test value", "automation") ?? "cancelled"}`,
            )
          }
        >
          Prompt
        </button>
        <button onClick={() => setModal("custom")}>Custom modal</button>
        <button onClick={() => setModal("nested")}>Nested modal</button>
        <button onClick={() => setModal("form")}>Modal form</button>
        <button onClick={() => setModal("locked")}>
          Non-dismissible modal
        </button>
        <button onClick={() => toast("Success notification")}>
          Success toast
        </button>
        <button onClick={() => toast("Error notification")}>Error toast</button>
        <button onClick={() => toast("Warning snackbar")}>
          Warning snackbar
        </button>
        <button onClick={() => setResponse("Browser popup simulated")}>
          Browser-style popup
        </button>
      </div>
      <output role="status" data-testid="dialog-response">
        {response}
      </output>
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      {modal && (
        <div
          className="overlay"
          onMouseDown={() => modal !== "locked" && setModal(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            className="modal"
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) =>
              e.key === "Escape" && modal !== "locked" && setModal(null)
            }
          >
            <h3 id="dialog-title">{modal} modal</h3>
            {modal === "form" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const value = new FormData(e.currentTarget).get("modalName");
                  if (!value) {
                    setResponse("Modal validation: name required");
                    return;
                  }
                  setResponse(`Modal submitted: ${value}`);
                  setModal(null);
                }}
              >
                <label>
                  Name
                  <input name="modalName" autoFocus required />
                </label>
                <button>Submit modal</button>
              </form>
            )}
            {modal === "nested" && (
              <>
                <button onClick={() => setNested(true)}>
                  Open nested modal
                </button>
                {nested && (
                  <div
                    role="dialog"
                    aria-label="Nested modal"
                    className="nested-modal"
                  >
                    <p>Nested modal content</p>
                    <button onClick={() => setNested(false)}>
                      Close nested
                    </button>
                  </div>
                )}
              </>
            )}
            {modal === "locked" ? (
              <button onClick={() => setModal(null)}>
                Complete required action
              </button>
            ) : (
              <button
                autoFocus={modal !== "form"}
                onClick={() => setModal(null)}
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}
      <TestInfo
        name="Dialogs and notifications"
        concepts="native alert/confirm/prompt, modal focus and validation, nested/non-dismissible modal, outside/Escape close, transient notifications"
      />
    </>
  );
}

export function Phase2Contexts() {
  const loc = useLocation(),
    frames = loc.pathname.startsWith("/frames"),
    [messages, setMessages] = useState<string[]>([]);
  useEffect(() => {
    const fn = (e: MessageEvent) =>
      setMessages((v) => [`Received: ${String(e.data)}`, ...v]);
    addEventListener("message", fn);
    return () => removeEventListener("message", fn);
  }, []);
  if (frames) return <Frames />;
  const child = new URLSearchParams(loc.search).get("context");
  if (child)
    return (
      <>
        <h2>Unique {child} context</h2>
        <p data-testid="context-id">Context identifier: {child}</p>
        <button
          onClick={() => window.opener?.postMessage(`hello from ${child}`, "*")}
        >
          Message parent
        </button>
        <button onClick={() => window.close()}>Close this context</button>
      </>
    );
  return (
    <>
      <h2>Windows and tabs</h2>
      <div className="panel actions">
        <button
          onClick={() => window.open("/windows?context=tab-one", "_blank")}
        >
          Open new tab
        </button>
        <button
          onClick={() =>
            ["tab-a", "tab-b", "tab-c"].forEach((x) =>
              window.open(`/windows?context=${x}`, "_blank"),
            )
          }
        >
          Open multiple tabs
        </button>
        <button
          onClick={() =>
            window.open(
              "/windows?context=child-window",
              "testlab-child",
              "width=600,height=500",
            )
          }
        >
          Open child window
        </button>
        <button
          onClick={() =>
            window.open(
              "/windows?context=communication-child",
              "communication-child",
              "width=600,height=500",
            )
          }
        >
          Communication child
        </button>
      </div>
      <ul aria-label="Window message log">
        {messages.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <TestInfo
        name="Windows and tabs"
        concepts="new/multiple tabs, named child windows, close, parent-child postMessage, unique context assertions"
      />
    </>
  );
}
function Frames() {
  const nested =
    '<h2 id="outer-text">Outer frame</h2><iframe title="Nested inner frame" srcdoc="<h3 id=inner-text>Unique nested inner frame</h3><button id=inner-button>Inner action</button>"></iframe>';
  return (
    <>
      <h2>Iframe contexts</h2>
      <div className="frame-grid">
        <iframe
          title="Basic frame"
          srcDoc={
            '<h2 id="basic-text">Unique basic iframe</h2><button id="basic-button">Basic frame button</button>'
          }
        />
        <iframe
          title="Form frame"
          srcDoc={
            '<h2>Iframe form</h2><form><label>Email <input id="frame-email" type="email"></label><button id="frame-submit">Submit frame form</button></form>'
          }
        />
        <iframe title="Nested frame" srcDoc={nested} />
        <iframe
          title="Dynamic frame"
          key="dynamic-frame"
          srcDoc={'<h2 id="dynamic-frame">Dynamic iframe content</h2>'}
        />
      </div>
      <p>
        Cross-origin simulation: automation should treat a real remote origin as
        restricted; this local lab remains offline and safe.
      </p>
      <TestInfo
        name="Iframe contexts"
        concepts="basic, multiple, form, button, nested and dynamic iframes; context switching"
      />
    </>
  );
}
