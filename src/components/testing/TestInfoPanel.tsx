import { useState } from "react";
import {
  BookOpen,
  Braces,
  CheckCheck,
  Database,
  Network,
  RotateCcw,
} from "lucide-react";
type Props = {
  name: string;
  concepts: string;
  endpoints?: string | string[];
  scenario?: string;
  expected?: string;
  selectors?: string[];
  assertions?: string[];
  testData?: unknown;
};
const tabs = [
  ["overview", "Overview", BookOpen],
  ["data", "Test Data", Database],
  ["selectors", "Selectors", Braces],
  ["assertions", "Assertions", CheckCheck],
  ["api", "API", Network],
] as const;
export function TestInfoPanel({
  name,
  concepts,
  endpoints = "None",
  scenario,
  expected = "Actions produce deterministic, visible results.",
  selectors = ["role + accessible name", "data-testid", "id / name"],
  assertions = [
    "Verify the visible status or state change",
    "Assert deterministic values",
    "Reset state after the scenario",
  ],
  testData,
}: Props) {
  const [tab, setTab] = useState<(typeof tabs)[number][0]>("overview"),
    apis = Array.isArray(endpoints) ? endpoints.join("\n") : endpoints;
  return (
    <aside className="test-info" aria-label="Test information">
      <div className="test-info__header">
        <div>
          <span className="eyebrow">TEST INFORMATION</span>
          <h2>{name}</h2>
        </div>
        <button
          className="icon-btn"
          aria-label="Reset module"
          title="Reset module"
          onClick={() => location.reload()}
        >
          <RotateCcw size={15} />
        </button>
      </div>
      <div
        className="test-info__tabs"
        role="tablist"
        aria-label="Test information sections"
      >
        {tabs.map(([id, label, Icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="test-info__body" role="tabpanel">
        {tab === "overview" && (
          <>
            <InfoBlock label="Scenario">{scenario || concepts}</InfoBlock>
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
      </div>
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
