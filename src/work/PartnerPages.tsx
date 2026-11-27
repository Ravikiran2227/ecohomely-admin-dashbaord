import type { PartnerApplication } from "@/api/work";
import { Badge } from "@/ui/primitives";

/** The seven gates (WRK-GAT-001) with who decided gates 3, 5 and 6: three different people for one partner. */
export function GateStrip({ app }: { app: PartnerApplication }) {
  return (
    <div className="space-y-2">
      <ol aria-label={`Gates for ${app.partnerId}`} className="flex flex-wrap gap-1.5">
        {app.gates.map((g) => (
          <li key={g.gate}>
            <Badge tone={g.state === "passed" ? "ok" : g.state === "failed" ? "warn" : "neutral"}>{g.gate} {g.name}: {g.state}</Badge>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted">
        Verified by {app.verifiedByName ?? "nobody yet"} · trained by {app.trainedByName ?? "nobody yet"} · activated by {app.activatedByName ?? "nobody yet"}.
        Gates 3, 5 and 6 must be decided by three different people.
      </p>
    </div>
  );
}
