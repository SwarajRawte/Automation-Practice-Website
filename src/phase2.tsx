import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { TestInfoPanel } from "./components/testing/TestInfoPanel";
import { PageHeader } from "./components/layout/PageHeader";
import {
  AppWindow,
  FormInput,
  Keyboard,
  MousePointerClick,
  PanelTopOpen,
} from "lucide-react";
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
  if (!r.ok) {
    const error = new Error(body.error || `HTTP ${r.status}`) as Error & {
      issues?: string[];
    };
    const fieldErrors =
      body.errors && typeof body.errors === "object"
        ? Object.values(body.errors).filter(
            (value): value is string => typeof value === "string",
          )
        : [];
    error.issues = fieldErrors.length ? fieldErrors : [error.message];
    throw error;
  }
  return body;
};
const readLastSubmission = (): Record<string, unknown> | null => {
  try {
    const stored = sessionStorage.getItem("last-form-submission");
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
};
const serializeForm = (form: HTMLFormElement) => {
  const formData = new FormData(form),
    data: Record<string, string | string[]> = {};
  for (const key of new Set(formData.keys())) {
    const values = formData
      .getAll(key)
      .map((value) => (value instanceof File ? value.name : value));
    data[key] = values.length === 1 ? values[0] : values;
  }
  return data;
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
    <TestInfoPanel name={name} concepts={concepts} endpoints={endpoints} />
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
    const data = readLastSubmission();
    return (
      <>
        <h2>Form submission confirmation</h2>
        {data ? (
          <>
            <p role="status">Form submitted successfully</p>
            <table>
              <caption>Submitted data</caption>
              <tbody>
                {Object.entries(data).map(([k, v]) => (
                  <tr key={k}>
                    <th scope="row">{k}</th>
                    <td>{Array.isArray(v) ? v.join(", ") : String(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p role="status">No form submission is available.</p>
        )}
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
      data = serializeForm(form),
      issues: string[] = [];
    setStatus("");
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
    } catch (error) {
      const failure = error as Error & { issues?: string[] };
      setErrors(
        failure.issues || [failure.message || "Form submission failed"],
      );
    }
  };
  return (
    <>
      <PageHeader
        icon={FormInput}
        title="Forms"
        description="Practice form filling, validation, dynamic fields and complex controls."
        onReset={() => location.reload()}
      />
      <form
        className="panel form grid phase2-form"
        onSubmit={submit}
        onReset={() => {
          setDynamic([""]);
          setCountry("Canada");
          setErrors([]);
          setStatus("");
        }}
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
                  setDynamic((current) =>
                    current.map((x, j) => (j === i ? e.target.value : x)),
                  )
                }
              />
              <button
                type="button"
                className="danger"
                onClick={() =>
                  setDynamic((current) => current.filter((_, j) => j !== i))
                }
              >
                Remove
              </button>
            </span>
          </label>
        ))}
        <button
          type="button"
          className="secondary"
          onClick={() => setDynamic((current) => [...current, ""])}
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
    actions = loc.pathname.endsWith("/actions"),
    [log, setLog] = useState<string[]>([]),
    [enabled, setEnabled] = useState(false),
    [delayed, setDelayed] = useState(false),
    [moving, setMoving] = useState(false),
    hold = useRef<number | undefined>(undefined);
  const add = (event: string) =>
    setLog((v) => [`${String(v.length + 1).padStart(2, "0")}: ${event}`, ...v]);
  const clearHold = () => {
    clearTimeout(hold.current);
    hold.current = undefined;
  };
  useEffect(() => {
    const timer = setTimeout(() => setDelayed(true), 1200);
    return () => {
      clearTimeout(timer);
      clearTimeout(hold.current);
    };
  }, []);
  if (keyboard) return <KeyboardLab />;
  if (actions) return <ActionsLab />;
  return (
    <>
      <PageHeader
        icon={MousePointerClick}
        title="Buttons & Interactions"
        description="Practice pointer events, state changes, links and drag interactions."
        onReset={() => location.reload()}
      />
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
            clearHold();
            hold.current = window.setTimeout(() => {
              hold.current = undefined;
              add("click and hold completed");
            }, 800);
          }}
          onPointerUp={clearHold}
          onPointerCancel={clearHold}
          onPointerLeave={clearHold}
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
          onMouseEnter={() => setMoving((value) => !value)}
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
          onDrop={(e) => {
            e.preventDefault();
            add(`dropped ${e.dataTransfer.getData("text/plain")}`);
          }}
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
function ActionsLab() {
  const [events, setEvents] = useState<string[]>([]),
    [hovered, setHovered] = useState(false),
    [held, setHeld] = useState(false),
    [dragging, setDragging] = useState(false),
    [dropped, setDropped] = useState(false),
    [selected, setSelected] = useState<string[]>([]),
    holdTimer = useRef<number | undefined>(undefined);
  const record = (event: string) =>
    setEvents((current) => [event, ...current].slice(0, 12));
  const toggleSelection = (name: string, additive: boolean) => {
    setSelected((current) =>
      additive
        ? current.includes(name)
          ? current.filter((item) => item !== name)
          : [...current, name]
        : [name],
    );
    record(`${additive ? "Modifier" : "Normal"} click: ${name}`);
  };
  useEffect(() => {
    const release = () => setDragging(false);
    window.addEventListener("mouseup", release);
    return () => {
      window.removeEventListener("mouseup", release);
      clearTimeout(holdTimer.current);
    };
  }, []);
  return (
    <>
      <PageHeader
        icon={MousePointerClick}
        title="Mouse & Selenium Actions"
        description="Practice the complete Java Actions workflow with deterministic pointer and keyboard targets."
        onReset={() => location.reload()}
      />
      <div className="actions-lab">
        <section className="panel action-card">
          <h3>Move and hover</h3>
          <p>
            Use <code>moveToElement</code> to reveal the hidden menu.
          </p>
          <div
            className="hover-target"
            data-testid="actions-hover-target"
            onMouseEnter={() => {
              setHovered(true);
              record("Hover entered");
            }}
            onMouseLeave={() => setHovered(false)}
          >
            Hover over me
            {hovered && (
              <button
                data-testid="hover-menu-item"
                onClick={() => record("Hidden hover action clicked")}
              >
                Hidden action
              </button>
            )}
          </div>
        </section>

        <section className="panel action-card">
          <h3>Click variations</h3>
          <p>Practice click, double-click, and context-click.</p>
          <div className="actions">
            <button
              data-testid="actions-click"
              onClick={() => record("Single click")}
            >
              Single click
            </button>
            <button
              data-testid="actions-double-click"
              onDoubleClick={() => record("Double click")}
            >
              Double-click
            </button>
            <button
              data-testid="actions-context-click"
              onContextMenu={(event) => {
                event.preventDefault();
                record("Context click");
              }}
            >
              Right-click
            </button>
          </div>
        </section>

        <section className="panel action-card">
          <h3>Click and hold</h3>
          <p>Hold for 800 ms, then release.</p>
          <button
            className={held ? "hold-target complete" : "hold-target"}
            data-testid="actions-hold-target"
            onMouseDown={() => {
              record("Hold started");
              holdTimer.current = window.setTimeout(() => {
                setHeld(true);
                record("Hold completed");
              }, 800);
            }}
            onMouseUp={() => {
              clearTimeout(holdTimer.current);
              record("Mouse released");
            }}
            onMouseLeave={() => clearTimeout(holdTimer.current)}
          >
            {held ? "Hold successful" : "Click and hold"}
          </button>
        </section>

        <section className="panel action-card">
          <h3>Drag and drop</h3>
          <p>
            Use <code>dragAndDrop</code> or click-and-hold, move, release.
          </p>
          <div className="action-drag-row">
            <div
              className="action-drag-source"
              data-testid="actions-drag-source"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData("text/plain", "Selenium item");
                setDragging(true);
                record("Drag started");
              }}
              onDragEnd={() => setDragging(false)}
              onMouseDown={() => setDragging(true)}
            >
              {dropped ? "Moved" : "Drag item"}
            </div>
            <div
              className={
                dropped ? "action-drop-target complete" : "action-drop-target"
              }
              data-testid="actions-drop-target"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                setDropped(true);
                setDragging(false);
                record(`Dropped: ${event.dataTransfer.getData("text/plain")}`);
              }}
              onMouseUp={() => {
                if (dragging) {
                  setDropped(true);
                  setDragging(false);
                  record("Dropped with click-and-hold");
                }
              }}
            >
              {dropped ? "Drop successful" : "Drop here"}
            </div>
          </div>
        </section>

        <section className="panel action-card">
          <h3>Modifier keys</h3>
          <p>Hold Control/Command while clicking to select multiple items.</p>
          <div className="modifier-list" data-testid="modifier-list">
            {["Alpha", "Bravo", "Charlie"].map((item) => (
              <button
                key={item}
                className={selected.includes(item) ? "selected" : ""}
                aria-pressed={selected.includes(item)}
                data-testid={`modifier-${item.toLowerCase()}`}
                onClick={(event) =>
                  toggleSelection(item, event.ctrlKey || event.metaKey)
                }
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        <section className="panel action-card">
          <h3>Offsets and scrolling</h3>
          <p>Move by offset inside the pad or scroll to the final target.</p>
          <div
            className="offset-pad"
            data-testid="actions-offset-pad"
            onClick={(event) =>
              record(
                `Offset click: ${event.nativeEvent.offsetX}, ${event.nativeEvent.offsetY}`,
              )
            }
          >
            Click at an offset
          </div>
          <button
            data-testid="actions-scroll-target"
            onClick={() => record("Scrolled target clicked")}
          >
            Final scroll target
          </button>
        </section>
      </div>

      <section className="panel actions-reference">
        <h3>Java Actions class reference</h3>
        <pre data-testid="java-actions-example">{`Actions actions = new Actions(driver);

actions.moveToElement(hoverTarget).perform();
actions.click(clickTarget).perform();
actions.doubleClick(doubleClickTarget).perform();
actions.contextClick(rightClickTarget).perform();
actions.clickAndHold(holdTarget).pause(Duration.ofMillis(900)).release().perform();
actions.dragAndDrop(source, target).perform();
actions.clickAndHold(source).moveToElement(target).release().perform();
actions.moveToElement(offsetPad, 40, 20).click().perform();
actions.keyDown(Keys.CONTROL).click(alpha).click(bravo).keyUp(Keys.CONTROL).perform();
actions.scrollToElement(scrollTarget).click().perform();`}</pre>
      </section>
      <section className="panel">
        <h3>Action event log</h3>
        <ol data-testid="actions-event-log">
          {events.length ? (
            events.map((event, index) => (
              <li key={`${event}-${index}`}>{event}</li>
            ))
          ) : (
            <li>No actions recorded</li>
          )}
        </ol>
      </section>
      <TestInfo
        name="Selenium Java Actions class"
        concepts="moveToElement, click, doubleClick, contextClick, clickAndHold, release, dragAndDrop, moveByOffset, keyDown, keyUp, pause, scrollToElement, perform"
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
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey))
      setItems((current) =>
        current.includes("Shortcut item")
          ? current
          : [...current, "Shortcut item"],
      );
    if (e.key === "Escape") setModal(false);
  };
  return (
    <>
      <PageHeader
        icon={Keyboard}
        title="Keyboard Automation"
        description="Inspect key events, shortcuts, focus and accessible keyboard widgets."
        onReset={() => location.reload()}
      />
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
        <div
          role="listbox"
          aria-label="Keyboard listbox"
          aria-activedescendant={`keyboard-option-${active}`}
          tabIndex={0}
        >
          {items.map((x, i) => (
            <div
              id={`keyboard-option-${i}`}
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
    [notice, setNotice] = useState(""),
    [delayedReady, setDelayedReady] = useState(false),
    noticeTimer = useRef<number | undefined>(undefined);
  const toast = (text: string) => {
    clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 1800);
  };
  useEffect(() => {
    const delayedTimer = setTimeout(() => setDelayedReady(true), 1500);
    return () => {
      clearTimeout(delayedTimer);
      clearTimeout(noticeTimer.current);
    };
  }, []);
  useEffect(() => {
    if (modal !== "nested") setNested(false);
  }, [modal]);
  return (
    <>
      <PageHeader
        icon={PanelTopOpen}
        title="Alerts & Modals"
        description="Handle browser dialogs, nested modals, validation and notifications."
        onReset={() => location.reload()}
      />
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
        <button
          data-testid="delayed-modal-button"
          disabled={!delayedReady}
          onClick={() => setModal("custom")}
        >
          Delayed modal
        </button>
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
                noValidate
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
    const fn = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      setMessages((v) => [`Received: ${String(e.data)}`, ...v]);
    };
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
          onClick={() =>
            window.opener?.postMessage(
              `hello from ${child}`,
              window.location.origin,
            )
          }
        >
          Message parent
        </button>
        <button onClick={() => window.close()}>Close this context</button>
      </>
    );
  return (
    <>
      <PageHeader
        icon={AppWindow}
        title="Windows & Tabs"
        description="Practice context switching, child windows and cross-window messaging."
        onReset={() => location.reload()}
      />
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
        {messages.map((x, index) => (
          <li key={`${x}-${index}`}>{x}</li>
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
  const [dynamicGeneration, setDynamicGeneration] = useState(1);
  const nested =
    '<h2 id="outer-text">Outer frame</h2><iframe title="Nested inner frame" srcdoc="<h3 id=inner-text>Unique nested inner frame</h3><button id=inner-button onclick=&quot;document.getElementById(\'inner-result\').textContent=\'Inner action completed\'&quot;>Inner action</button><output id=inner-result></output>"></iframe>';
  return (
    <>
      <PageHeader
        icon={AppWindow}
        title="Iframe Contexts"
        description="Switch between basic, nested, form and dynamic frame contexts."
        onReset={() => location.reload()}
      />
      <div className="frame-grid">
        <iframe
          title="Basic frame"
          srcDoc={
            '<h2 id="basic-text">Unique basic iframe</h2><button id="basic-button" onclick="document.getElementById(\'basic-result\').textContent=\'Basic action completed\'">Basic frame button</button><output id="basic-result"></output>'
          }
        />
        <iframe
          title="Form frame"
          srcDoc={
            '<h2>Iframe form</h2><form onsubmit="event.preventDefault();document.getElementById(\'frame-result\').textContent=\'Frame form submitted: \'+document.getElementById(\'frame-email\').value"><label>Email <input id="frame-email" type="email" required></label><button id="frame-submit">Submit frame form</button><output id="frame-result"></output></form>'
          }
        />
        <iframe title="Nested frame" srcDoc={nested} />
        <iframe
          title="Dynamic frame"
          key={dynamicGeneration}
          srcDoc={`<h2 id="dynamic-frame">Dynamic iframe generation ${dynamicGeneration}</h2>`}
        />
      </div>
      <button
        className="secondary"
        onClick={() => setDynamicGeneration((value) => value + 1)}
      >
        Replace dynamic frame
      </button>
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
