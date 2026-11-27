import { lazy, Suspense, useCallback, useId, useMemo, useState } from "react";
import { Link } from "react-router";
import { Banner } from "@/ui/Banner";
import { PageHeader, Badge, ScrollRegion } from "@/ui/primitives";
import { StateEmpty, StateError, StateLoading, useAsync } from "@/ui/states";
import { BOARD_STATUSES, type JobStatus } from "./domain";
import { PINCODE_CENTRES, jitter, type MapMarker } from "./geo";
import { PincodeChips, StatusBadge } from "./components";
import { useInstant } from "./hooks";
import { RecordDrawer, useRecordParam } from "@/ui/RecordDrawer";
import { PresenceStack } from "@/work/F1Kit";
import { JobView } from "./JobDetailPage";
import { Button } from "@/ui/primitives";

const LiveMap = lazy(() => import("./LiveMap"));

/** The state lanes of the board (design system 4, pattern 5). Counts are of the jobs the server returned, after the filters. */
const LANES: { label: string; statuses: readonly JobStatus[] }[] = [
  { label: "Waiting for partner", statuses: ["requested", "validated", "ready_for_dispatch"] },
  { label: "Offered", statuses: ["offered"] },
  { label: "Assigned", statuses: ["assigned", "accepted"] },
  { label: "En route", statuses: ["en_route"] },
  { label: "In progress", statuses: ["arrived", "scope_confirmed", "in_progress", "checklist_completed", "evidence_submitted", "customer_confirmation", "quality_review", "re_clean_required"] },
];

/** AS-27: live dispatch board. Map and list of active Instant jobs; customer data masked; partner position only while travelling. */
export function BoardPage() {
  const { user, instant } = useInstant();
  const [state, retry] = useAsync(async () => ({ jobs: await instant.listJobs(user), pins: await instant.pincodes(user).catch(() => []) }));
  const [zone, setZone] = useState("");
  const [pincode, setPincode] = useState("");
  const [mapDown, setMapDown] = useState(false);
  const zoneId = useId();
  const pinId = useId();
  const onUnavailable = useCallback(() => setMapDown(true), []);
  const rec = useRecordParam();

  const data = state.status === "ready" ? state.data : null;
  const active = useMemo(
    () =>
      (data?.jobs ?? []).filter(
        (j) => BOARD_STATUSES.includes(j.status) && (!zone || j.zone === zone) && (!pincode || j.pincode === pincode),
      ),
    [data, zone, pincode],
  );
  const markers = useMemo<MapMarker[]>(() => {
    const out: MapMarker[] = [];
    for (const j of active) {
      const c = PINCODE_CENTRES[j.pincode];
      if (c) {
        const [dx, dy] = jitter(j.id);
        out.push({ id: `job-${j.id}`, kind: "job", label: `Job ${j.id}, ${j.area}`, lngLat: [c[0] + dx, c[1] + dy] });
      }
      if (j.position) out.push({ id: `partner-${j.id}`, kind: "partner", label: `Partner travelling to ${j.id}`, lngLat: [j.position.lng, j.position.lat] });
    }
    return out;
  }, [active]);
  const zones = [...new Set((data?.pins ?? []).map((p) => p.zone))];
  const pins = (data?.pins ?? []).filter((p) => !zone || p.zone === zone);

  return (
    <div className="space-y-4">
      <PageHeader title="Live dispatch board" subtitle="Active Instant jobs. Partner positions show only while they are travelling; customer details are masked." />
      {state.status === "loading" ? <StateLoading slow={state.slow} onRetry={retry} /> : null}
      {state.status === "error" ? <StateError {...state} onRetry={retry} /> : null}
      {data ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor={zoneId} className="block text-[13px] font-medium">Zone</label>
              <select id={zoneId} value={zone} onChange={(e) => { setZone(e.target.value); setPincode(""); }} className="h-8 rounded-sm border border-line-strong bg-surface px-2 text-sm">
                <option value="">All zones</option>
                {zones.map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={pinId} className="block text-[13px] font-medium">Pincode</label>
              <select id={pinId} value={pincode} onChange={(e) => setPincode(e.target.value)} className="h-8 rounded-sm border border-line-strong bg-surface px-2 text-sm">
                <option value="">All pincodes</option>
                {pins.map((p) => <option key={p.pincode} value={p.pincode}>{p.pincode} {p.area}</option>)}
              </select>
            </div>
            <Link to="/instant/stuck" className="ml-auto text-sm font-medium text-primary underline underline-offset-2">Stuck-job queue</Link>
            <Link to="/instant/sos" className="text-sm font-medium text-primary underline underline-offset-2">SOS panel</Link>
          </div>

          {mapDown ? (
            <Banner tone="info">The map is unavailable here, so the board is showing the list only. Everything below still works.</Banner>
          ) : (
            <Suspense fallback={<StateLoading slow="none" />}>
              <LiveMap markers={markers} onUnavailable={onUnavailable} />
            </Suspense>
          )}

          <ul aria-label="Jobs by state" className="flex flex-wrap gap-2">
            {LANES.map((l) => {
              const n = active.filter((j) => l.statuses.includes(j.status)).length;
              return <li key={l.label}><Badge tone={n > 0 ? "info" : "neutral"}>{l.label}: {n}</Badge></li>;
            })}
          </ul>

          {active.length === 0 ? (
            <StateEmpty title="No active Instant jobs"
              action={zone || pincode ? <Button variant="secondary" onClick={() => { setZone(""); setPincode(""); }}>Clear filters</Button> : undefined}>
              Jobs appear here once they are released to dispatch and until they finish.{zone || pincode ? " The zone or pincode filter may be hiding some." : ""}
            </StateEmpty>
          ) : (
            <ScrollRegion label="Active Instant jobs (scrollable)" className="rounded-md border border-line bg-surface">
              <table className="w-full text-left">
                <caption className="sr-only">Active Instant jobs</caption>
                <thead>
                  <tr><th scope="col">Job</th><th scope="col">Status</th><th scope="col">Service</th><th scope="col">Area</th><th scope="col">Customer</th><th scope="col">Partner</th><th scope="col"><span className="sr-only">Preview</span></th></tr>
                </thead>
                <tbody>
                  {active.map((j) => (
                    <tr key={j.id} data-record-row tabIndex={-1} onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button,input,select")) rec.open(j.id); }} className={rec.record === j.id ? "cursor-pointer border-t border-line align-top bg-brand-50" : "cursor-pointer border-t border-line align-top hover:bg-n-50"}>
                      <th scope="row" className="font-medium"><Link className="text-primary underline" to={`/instant/jobs/${j.id}`}>{j.id}</Link>{j.activeSosId ? <span className="ml-2"><Badge tone="critical">SOS</Badge></span> : null}</th>
                      <td><StatusBadge status={j.status} /></td>
                      <td>{j.serviceName}</td>
                      <td><PincodeChips pincode={j.pincode} statuses={data.pins} /></td>
                      <td>{j.customerLabel}</td>
                      <td>{j.partnerLabel ?? "Not assigned"}</td>
                      <td><Button variant="ghost" size="sm" data-row-open aria-label={`Preview ${j.id}`} onClick={() => rec.open(j.id)}>Preview</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          )}
          <RecordDrawer open={!!rec.record} onClose={rec.close} title={rec.record ? `Instant job ${rec.record}` : ""} subtitle="Live dispatch board" fullPageHref={`/instant/jobs/${rec.record ?? ""}`} presence={<PresenceStack resource={`job:${rec.record ?? ""}`} />}>
            {rec.record ? <JobView id={rec.record} /> : null}
          </RecordDrawer>
        </>
      ) : null}
    </div>
  );
}
