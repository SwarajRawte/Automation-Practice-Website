import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  Activity,
  Boxes,
  Braces,
  CheckCircle2,
  Menu,
  Search,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { getSessionUser, readCachedUser } from "./authClient";
import {
  catalogModules,
  type ModuleDifficulty,
  type ModuleGroup,
} from "./moduleRegistry";
import { moduleProgressStatus, useModuleProgress } from "./progress";

type StatusFilter =
  "All statuses" | "Not started" | "In progress" | "Completed";
type SortOrder = "Recommended" | "Name A-Z" | "Difficulty";

const difficultyOrder: Record<ModuleDifficulty, number> = {
  Beginner: 0,
  Intermediate: 1,
  Advanced: 2,
};

export default function Dashboard() {
  const user = getSessionUser() || readCachedUser();
  const { progress } = useModuleProgress(user?.id);
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<"All" | ModuleDifficulty>("All");
  const [category, setCategory] = useState<"All categories" | ModuleGroup>(
    "All categories",
  );
  const [status, setStatus] = useState<StatusFilter>("All statuses");
  const [sort, setSort] = useState<SortOrder>("Recommended");
  const [view, setView] = useState<"grid" | "list">("grid");

  const categories = useMemo(
    () => Array.from(new Set(catalogModules.map((module) => module.group))),
    [],
  );

  const shown = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const filtered = catalogModules.filter((module) => {
      const moduleStatus = moduleProgressStatus(progress[module.id]);
      const wantedStatus = status.toLowerCase().replaceAll(" ", "-");
      return (
        (difficulty === "All" || module.difficulty === difficulty) &&
        (category === "All categories" || module.group === category) &&
        (status === "All statuses" || moduleStatus === wantedStatus) &&
        `${module.name} ${module.description} ${module.tags.join(" ")}`
          .toLowerCase()
          .includes(normalizedSearch)
      );
    });
    if (sort === "Name A-Z")
      return [...filtered].sort((left, right) =>
        left.name.localeCompare(right.name),
      );
    if (sort === "Difficulty")
      return [...filtered].sort(
        (left, right) =>
          difficultyOrder[left.difficulty] - difficultyOrder[right.difficulty],
      );
    return filtered;
  }, [category, difficulty, progress, search, sort, status]);

  const completed = catalogModules.filter(
    (module) => moduleProgressStatus(progress[module.id]) === "completed",
  ).length;
  const inProgress = catalogModules.filter(
    (module) => moduleProgressStatus(progress[module.id]) === "in-progress",
  ).length;
  const advanced = catalogModules.filter(
    (module) => module.difficulty === "Advanced",
  ).length;
  const metrics: [number, string, LucideIcon][] = [
    [catalogModules.length, "Practice Modules", Boxes],
    [completed, "Completed", CheckCircle2],
    [inProgress, "In Progress", Activity],
    [advanced, "Advanced", Braces],
  ];

  const clearFilters = () => {
    setSearch("");
    setDifficulty("All");
    setCategory("All categories");
    setStatus("All statuses");
    setSort("Recommended");
  };

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
        {metrics.map(([value, label, Icon]) => (
          <article className="metric-card" key={String(label)}>
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
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              <Boxes size={16} />
            </button>
            <button
              aria-label="List view"
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
              onChange={(event) =>
                setDifficulty(event.target.value as "All" | ModuleDifficulty)
              }
            >
              <option>All</option>
              <option>Beginner</option>
              <option>Intermediate</option>
              <option>Advanced</option>
            </select>
          </label>
          <select
            aria-label="Category filter"
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as "All categories" | ModuleGroup)
            }
          >
            <option>All categories</option>
            {categories.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <select
            aria-label="Status filter"
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
          >
            <option>All statuses</option>
            <option>Not started</option>
            <option>In progress</option>
            <option>Completed</option>
          </select>
          <select
            aria-label="Sort modules"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortOrder)}
          >
            <option>Recommended</option>
            <option>Name A-Z</option>
            <option>Difficulty</option>
          </select>
        </div>

        {shown.length ? (
          <div className={`module-grid module-grid--${view}`}>
            {shown.map((module) => {
              const moduleProgress = progress[module.id];
              const moduleStatus = moduleProgressStatus(moduleProgress);
              const percent = moduleProgress?.percent ?? 0;
              return (
                <article className="module-card" key={module.id}>
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
                    <span>
                      {moduleStatus === "not-started"
                        ? "Not started"
                        : moduleStatus === "completed"
                          ? "Completed"
                          : "In progress"}
                    </span>
                    <span>{percent}%</span>
                    <progress
                      aria-label={`${module.name} progress`}
                      max="100"
                      value={percent}
                    />
                  </div>
                  <footer>
                    <span>{module.scenarios} scenarios</span>
                    <NavLink
                      className="btn btn--primary btn--sm"
                      to={module.path}
                    >
                      {moduleStatus === "not-started" ? "Open Lab" : "Continue"}
                    </NavLink>
                  </footer>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <Search size={28} />
            <h3>No modules found</h3>
            <p>No testing modules match your filters.</p>
            <button className="btn btn--outline" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
