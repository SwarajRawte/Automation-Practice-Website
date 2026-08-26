import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useLocation } from "react-router-dom";
import {
  BookOpen,
  Braces,
  CheckCheck,
  Database,
  Network,
  RotateCcw,
} from "lucide-react";
import { getSessionUser, readCachedUser } from "../../authClient";
import { findModuleByPath } from "../../moduleRegistry";
import { moduleProgressStatus, useModuleProgress } from "../../progress";

type Props = {
  name: string;
  concepts: string;
  endpoints?: string | string[];
  scenario?: string;
  expected?: string;
  selectors?: string[];
  assertions?: string[];
  testData?: unknown;
  onReset?: () => void;
};

const tabs = [
  ["overview", "Overview", BookOpen],
  ["data", "Test Data", Database],
  ["selectors", "Selectors", Braces],
  ["assertions", "Assertions", CheckCheck],
  ["api", "API", Network],
] as const;

type TabId = (typeof tabs)[number][0];
type LearningMode = "guided" | "challenge";

export function TestInfoPanel({
  name,
  concepts,
  endpoints,
  scenario,
  expected = "Actions produce deterministic, visible results.",
  selectors = ["role + accessible name", "data-testid", "id / name"],
  assertions = [
    "Verify the visible status or state change",
    "Assert deterministic values",
    "Reset state after the scenario",
  ],
  testData,
  onReset,
}: Props) {
  const location = useLocation();
  const module = findModuleByPath(location.pathname);
  const user = getSessionUser() || readCachedUser();
  const { progress, markStarted, markCompleted, reset } = useModuleProgress(
    user?.id,
  );
  const [tab, setTab] = useState<TabId>("overview");
  const [mode, setMode] = useState<LearningMode>("guided");
  const [hintsRevealed, setHintsRevealed] = useState(false);
  const panelId = useId();
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement>>>({});
  const moduleProgress = module ? progress[module.id] : undefined;
  const status = moduleProgressStatus(moduleProgress);
  const apis = Array.isArray(endpoints)
    ? endpoints.join("\n")
    : (endpoints ?? module?.endpoints?.join("\n") ?? "None");

  useEffect(() => {
    if (module?.catalog) markStarted(module.id);
  }, [markStarted, module]);

  const switchTab = (next: TabId) => {
    setTab(next);
    setHintsRevealed(false);
    tabRefs.current[next]?.focus();
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex(([id]) => id === tab);
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft")
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    switchTab(tabs[nextIndex][0]);
  };

  const resetPanel = () => {
    onReset?.();
    if (module) reset(module.id);
    setTab("overview");
    setMode("guided");
    setHintsRevealed(false);
  };

  const challengeHint =
    mode === "challenge" && tab !== "overview" && !hintsRevealed;

  return (
    <aside className="test-info" aria-label="Test information">
      <div className="test-info__header">
        <div>
          <span className="eyebrow">TEST INFORMATION</span>
          <h2>{name}</h2>
          {module && (
            <span className="test-info__meta">
              {module.group} · {module.difficulty} · {module.scenarios}{" "}
              scenarios
            </span>
          )}
        </div>
        <button
          className="icon-btn"
          aria-label="Reset module progress"
          title="Reset module progress"
          onClick={resetPanel}
        >
          <RotateCcw size={15} />
        </button>
      </div>

      <div className="test-info__mode" aria-label="Learning mode">
        <button
          aria-pressed={mode === "guided"}
          onClick={() => {
            setMode("guided");
            setHintsRevealed(false);
          }}
        >
          Guided
        </button>
        <button
          aria-pressed={mode === "challenge"}
          onClick={() => {
            setMode("challenge");
            setHintsRevealed(false);
          }}
        >
          Challenge
        </button>
      </div>

      <div
        className="test-info__tabs"
        role="tablist"
        aria-label="Test information sections"
        onKeyDown={onTabKeyDown}
      >
        {tabs.map(([id, label, Icon]) => (
          <button
            key={id}
            ref={(element) => {
              tabRefs.current[id] = element ?? undefined;
            }}
            id={`${panelId}-${id}-tab`}
            role="tab"
            tabIndex={tab === id ? 0 : -1}
            aria-selected={tab === id}
            aria-controls={`${panelId}-${id}-panel`}
            onClick={() => {
              setTab(id);
              setHintsRevealed(false);
            }}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div
        className="test-info__body"
        id={`${panelId}-${tab}-panel`}
        role="tabpanel"
        tabIndex={0}
        aria-labelledby={`${panelId}-${tab}-tab`}
      >
        {challengeHint ? (
          <div className="test-info__challenge">
            <strong>Hints are hidden in challenge mode.</strong>
            <p>Try the scenario first, then reveal this section if needed.</p>
            <button
              className="btn btn--outline btn--sm"
              onClick={() => setHintsRevealed(true)}
            >
              Reveal hints
            </button>
          </div>
        ) : (
          <>
            {tab === "overview" && (
              <>
                <InfoBlock label="Scenario">
                  {scenario || concepts || module?.description}
                </InfoBlock>
                <InfoBlock label="Expected result">{expected}</InfoBlock>
                <InfoBlock label="Current page">
                  <code>{location.pathname}</code>
                </InfoBlock>
              </>
            )}
            {tab === "data" && (
              <pre>
                {JSON.stringify(
                  testData || { mode: "deterministic", reset: "available" },
                  null,
                  2,
                )}
              </pre>
            )}
            {tab === "selectors" && (
              <ul className="code-list">
                {selectors.map((value) => (
                  <li key={value}>
                    <code>{value}</code>
                  </li>
                ))}
              </ul>
            )}
            {tab === "assertions" && (
              <ul>
                {assertions.map((value) => (
                  <li key={value}>{value}</li>
                ))}
              </ul>
            )}
            {tab === "api" && <pre>{apis}</pre>}
          </>
        )}
      </div>

      {module?.catalog && (
        <div className="test-info__progress">
          <span>
            {status === "completed"
              ? "Module completed"
              : status === "in-progress"
                ? "Module in progress"
                : "Module not started"}
          </span>
          <button
            className="btn btn--primary btn--sm"
            disabled={status === "completed"}
            onClick={() => markCompleted(module.id)}
          >
            {status === "completed" ? "Completed" : "Mark complete"}
          </button>
        </div>
      )}
    </aside>
  );
}

function InfoBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="test-info__block">
      <h3>{label}</h3>
      <div>{children}</div>
    </section>
  );
}
