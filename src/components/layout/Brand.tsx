import { CheckCircle2, MonitorCog } from "lucide-react";
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? "brand--compact" : ""}`}>
      <span className="brand__mark" aria-hidden="true">
        <MonitorCog size={22} />
        <CheckCircle2 size={12} />
      </span>
      {!compact && (
        <span className="brand__copy">
          <strong>E2E Test Lab</strong>
          <small>Web Automation Practice Platform</small>
        </span>
      )}
    </div>
  );
}
