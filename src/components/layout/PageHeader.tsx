import type { LucideIcon } from "lucide-react";
import { RotateCcw } from "lucide-react";
export function PageHeader({
  icon: Icon,
  title,
  description,
  difficulty = "Intermediate",
  onReset,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  difficulty?: string;
  onReset?: () => void;
}) {
  return (
    <header className="page-header">
      <span className="page-header__icon">
        <Icon size={22} />
      </span>
      <div>
        <div className="page-header__title-row">
          <h1>{title}</h1>
          <span className={`badge badge--${difficulty.toLowerCase()}`}>
            {difficulty}
          </span>
        </div>
        <p>{description}</p>
      </div>
      {onReset && (
        <button className="btn btn--outline" onClick={onReset}>
          <RotateCcw size={15} />
          Reset Lab
        </button>
      )}
    </header>
  );
}
