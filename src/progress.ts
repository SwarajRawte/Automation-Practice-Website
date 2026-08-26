import { useCallback, useEffect, useMemo, useState } from "react";

export type ProgressStatus = "not-started" | "in-progress" | "completed";

export type ModuleProgress = {
  percent: number;
  status: Exclude<ProgressStatus, "not-started">;
  updatedAt: string;
};

export type ProgressRecord = Record<string, ModuleProgress>;

const STORAGE_PREFIX = "e2e-test-lab:progress:v1:user:";
const CHANGE_EVENT = "e2e-test-lab:progress-change";

function storageKey(userId: string | number | null | undefined) {
  return `${STORAGE_PREFIX}${encodeURIComponent(String(userId ?? "anonymous"))}`;
}

function normalizeEntry(value: unknown): ModuleProgress | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ModuleProgress>;
  const percent = Number(candidate.percent);
  if (!Number.isFinite(percent)) return null;
  const bounded = Math.max(0, Math.min(100, Math.round(percent)));
  if (bounded === 0) return null;
  return {
    percent: bounded,
    status: bounded === 100 ? "completed" : "in-progress",
    updatedAt:
      typeof candidate.updatedAt === "string"
        ? candidate.updatedAt
        : new Date(0).toISOString(),
  };
}

function readProgress(key: string): ProgressRecord {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .map(([moduleId, value]) => [moduleId, normalizeEntry(value)] as const)
        .filter((entry): entry is readonly [string, ModuleProgress] =>
          Boolean(entry[1]),
        ),
    );
  } catch {
    return {};
  }
}

function writeProgress(key: string, progress: ProgressRecord) {
  try {
    localStorage.setItem(key, JSON.stringify(progress));
    queueMicrotask(() =>
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { key } })),
    );
  } catch {
    // A storage-disabled browser can still use the current in-memory state.
  }
}

export function moduleProgressStatus(
  entry: ModuleProgress | undefined,
): ProgressStatus {
  if (!entry) return "not-started";
  return entry.percent >= 100 ? "completed" : "in-progress";
}

export function useModuleProgress(userId: string | number | null | undefined) {
  const key = useMemo(() => storageKey(userId), [userId]);
  const [progress, setProgress] = useState<ProgressRecord>(() =>
    readProgress(key),
  );

  useEffect(() => {
    setProgress(readProgress(key));
    const sync = (event: Event) => {
      if (event instanceof StorageEvent && event.key !== key) return;
      if (
        event instanceof CustomEvent &&
        (event.detail as { key?: unknown } | undefined)?.key !== key
      )
        return;
      setProgress(readProgress(key));
    };
    window.addEventListener("storage", sync);
    window.addEventListener(CHANGE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(CHANGE_EVENT, sync);
    };
  }, [key]);

  const update = useCallback(
    (moduleId: string, next: ModuleProgress | null) => {
      setProgress((current) => {
        const changed = { ...current };
        if (next) changed[moduleId] = next;
        else delete changed[moduleId];
        writeProgress(key, changed);
        return changed;
      });
    },
    [key],
  );

  const markStarted = useCallback(
    (moduleId: string) => {
      setProgress((current) => {
        if (current[moduleId]) return current;
        const changed = {
          ...current,
          [moduleId]: {
            percent: 25,
            status: "in-progress" as const,
            updatedAt: new Date().toISOString(),
          },
        };
        writeProgress(key, changed);
        return changed;
      });
    },
    [key],
  );

  const markCompleted = useCallback(
    (moduleId: string) =>
      update(moduleId, {
        percent: 100,
        status: "completed",
        updatedAt: new Date().toISOString(),
      }),
    [update],
  );

  const reset = useCallback(
    (moduleId: string) => update(moduleId, null),
    [update],
  );

  return { progress, markStarted, markCompleted, reset };
}
