/**
 * KPI "not calculated yet" notice with the Super Admin "Calculate now" action (project head fix list, 19 Nov 2026).
 * The server calculates KPIs once a day (`kpi_snapshot` task); a figure without today's snapshot is never estimated.
 * "Calculate now" appears only when the API offers it (`kpis.calculateNow`): the mock does; the local 05 has no route yet
 * (CR-B-C1-6 to Session T), so a Super Admin is told why instead of being shown a button that cannot work.
 */
import { useState } from "react";
import { kpisNotCalculated, type KpiValue } from "@/api/reports";
import { useSession } from "@/auth/session";
import { errMsg } from "@/instant/hooks";
import { Button } from "@/ui/primitives";

export function KpiCalcNotice({ values, onDone }: { values: readonly KpiValue[]; onDone: () => void }) {
  const { user, api } = useSession();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!user || (!kpisNotCalculated(values) && !msg)) return null;
  const isSa = user.roles.includes("SA");
  const calc = api.kpis.calculateNow;
  async function run() {
    if (!user || !calc) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await calc.call(api.kpis, user);
      setMsg({ ok: true, text: `KPIs calculated: ${r.rows} figures for the period ending ${new Date(r.periodEnd).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}. The run is logged.` });
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="KPI calculation" className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-n-25 px-4 py-3 text-[13px]">
      <p className="min-w-0 flex-1">
        {msg ? <span role={msg.ok ? "status" : "alert"} className={msg.ok ? "text-ok-fg" : "text-breach-fg"}>{msg.text}</span> : (
          <>
            <strong>Not calculated yet.</strong> The server calculates these figures once a day; until then no number is shown (never an estimate).
            {isSa && !calc ? " Calculate now needs a server route that is not built yet (asked of Session T)." : ""}
          </>
        )}
      </p>
      {isSa && calc && !msg?.ok ? <Button size="sm" disabled={busy} onClick={() => void run()}>{busy ? "Calculating…" : "Calculate now"}</Button> : null}
    </section>
  );
}
