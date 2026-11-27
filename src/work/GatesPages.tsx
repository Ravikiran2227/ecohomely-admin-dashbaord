import { useState } from "react";
import { usePolled } from "@/instant/hooks";
import { ReasonForm } from "@/instant/components";
import { Badge, Button, Card, Input, PageHeader } from "@/ui/primitives";
import { ApprovalList, Field, Load, selectClass, useAction, useApi } from "./common";
import { GateStrip } from "./PartnerPages";

/** AS-55: training and assessment (gate 5). */
export function TrainingPage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.gates.applications(user), null);
  const act = useAction(p.reload);
  const [open, setOpen] = useState<string | null>(null);
  const [result, setResult] = useState<"pass" | "fail">("pass");
  const [score, setScore] = useState("");
  return (
    <div className="space-y-4">
      <PageHeader title="Training and assessment" subtitle="Assign training, then record the assessment (gate 5). It cannot be you who verified this partner. The pass score is an owner input and is not set yet." />
      {act.banner}
      <Load p={p}>
        {(apps) => {
          const list = apps.filter((a) => a.status === "approved");
          return list.length === 0 ? <Card className="text-sm text-muted">No verified partners are waiting for training.</Card> : (
            <ul className="space-y-3">
              {list.map((a) => (
                <li key={a.id}>
                  <Card className="space-y-3" aria-label={`Training for ${a.id}`}>
                    <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{a.label}</h2><Badge>Training: {a.training.status.replace("_", " ")}{a.training.score !== null ? `, score ${a.training.score}` : ""}</Badge><Badge>Trial: {a.trial}</Badge></div>
                    <GateStrip app={a} />
                    {a.training.status === "not_assigned" ? <Button variant="secondary" onClick={() => void act.run(() => api.gates.assignTraining(user, a.id), "Training assigned.")}>Assign training</Button> : null}
                    {a.training.status === "assigned" ? <Button onClick={() => setOpen(open === a.id ? null : a.id)}>Record assessment</Button> : null}
                    {open === a.id ? (
                      <div role="group" aria-label={`Assessment for ${a.id}`} className="space-y-2 rounded-md border border-line bg-canvas p-3">
                        <Field label="Result">{(id) => <select id={id} className={selectClass} value={result} onChange={(e) => setResult(e.target.value as "pass" | "fail")}><option value="pass">Pass</option><option value="fail">Fail</option></select>}</Field>
                        <Field label="Score (0 to 100)">{(id) => <Input id={id} inputMode="numeric" value={score} onChange={(e) => setScore(e.target.value)} />}</Field>
                        <ReasonForm kind="assessment" confirmLabel="Record assessment" busy={act.busy} onCancel={() => setOpen(null)}
                          onConfirm={(code) => { void act.run(() => api.gates.recordAssessment(user, a.id, result, Number(score), code), "Assessment recorded.").then((ok) => ok && setOpen(null)); }} />
                      </div>
                    ) : null}
                  </Card>
                </li>
              ))}
            </ul>
          );
        }}
      </Load>
    </div>
  );
}

/** AS-33: Instant activation queue (gate 6). */
export function ActivationPage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.gates.applications(user), null);
  const act = useAction(p.reload);
  const [open, setOpen] = useState<{ id: string; action: "activate" | "deactivate" } | null>(null);
  return (
    <div className="space-y-4">
      <PageHeader title="Instant activation" subtitle="Final activation (gate 6). It cannot be the person who verified or trained this partner, and every earlier gate must be complete." />
      {act.banner}
      <Load p={p}>
        {(apps) => {
          const list = apps.filter((a) => a.status === "approved");
          return list.length === 0 ? <Card className="text-sm text-muted">No verified partners yet.</Card> : (
            <ul className="space-y-3">
              {list.map((a) => (
                <li key={a.id}>
                  <Card className="space-y-3" aria-label={`Activation for ${a.id}`}>
                    <div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{a.label}</h2><Badge tone={a.instantActive ? "ok" : "neutral"}>{a.instantActive ? "Active for Instant" : "Not active"}</Badge></div>
                    <GateStrip app={a} />
                    {a.gates.some((g) => g.gate <= 5 && g.state !== "passed") && !a.instantActive ? (
                      <p className="text-sm text-muted">Earlier gate incomplete: {a.gates.filter((g) => g.gate <= 5 && g.state !== "passed").map((g) => `${g.gate} ${g.name}`).join(", ")}.</p>
                    ) : null}
                    <div className="flex gap-2">
                      {!a.instantActive ? <Button onClick={() => setOpen({ id: a.id, action: "activate" })}>Activate</Button> : <Button variant="secondary" onClick={() => setOpen({ id: a.id, action: "deactivate" })}>Deactivate</Button>}
                    </div>
                    {open?.id === a.id ? (
                      <div role="group" aria-label={`${open.action} ${a.id}`} className="rounded-md border border-line bg-canvas p-3">
                        <ReasonForm kind="activation" confirmLabel={open.action === "activate" ? "Activate for Instant" : "Deactivate"} busy={act.busy} onCancel={() => setOpen(null)}
                          onConfirm={(code) => { void act.run(() => api.gates.setActivation(user, a.id, open.action, code), open.action === "activate" ? "Activated for Instant." : "Deactivated.").then((ok) => ok && setOpen(null)); }} />
                      </div>
                    ) : null}
                  </Card>
                </li>
              ))}
            </ul>
          );
        }}
      </Load>
    </div>
  );
}

/** AS-56: partner MPIN reset: identity check by one person, second approval by a different one. */
export function MpinPage() {
  const { user, api } = useApi();
  const p = usePolled(() => api.gates.mpinPartners(user), null);
  const [ver, setVer] = useState(0);
  const act = useAction(() => { p.reload(); setVer((v) => v + 1); });
  const [open, setOpen] = useState<string | null>(null);
  const [idOk, setIdOk] = useState(false);
  const [selfieOk, setSelfieOk] = useState(false);
  return (
    <div className="space-y-6">
      <PageHeader title="Partner MPIN resets" subtitle="Check the partner against the KYC on file (ID last 4 digits and a live selfie). A different person must approve. A reset starts a 24-hour hold." />
      {act.banner}
      <Load p={p}>
        {(rows) => (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.partnerId}>
                <Card className="space-y-3" aria-label={`MPIN reset for ${r.partnerId}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold">{r.label}</h2>
                    {r.holdUntil ? <Badge tone="warn">24-hour hold active</Badge> : null}
                    {r.openApprovalId ? <Badge>Waiting for a second person</Badge> : null}
                  </div>
                  {!r.holdUntil && !r.openApprovalId ? <Button variant="secondary" onClick={() => { setOpen(open === r.partnerId ? null : r.partnerId); setIdOk(false); setSelfieOk(false); }}>Check identity</Button> : null}
                  {open === r.partnerId ? (
                    <div role="group" aria-label={`Identity check for ${r.partnerId}`} className="space-y-2 rounded-md border border-line bg-canvas p-3">
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={idOk} onChange={(e) => setIdOk(e.target.checked)} /> The ID last 4 digits match the KYC on file</label>
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={selfieOk} onChange={(e) => setSelfieOk(e.target.checked)} /> The live selfie matches the KYC photo</label>
                      <ReasonForm kind="mpin" confirmLabel="Raise for a second approval" busy={act.busy} onCancel={() => setOpen(null)}
                        onConfirm={(code, note) => { void act.run(() => api.gates.checkMpinReset(user, r.partnerId, idOk, selfieOk, code, note), "Identity matched. A different person must approve the reset.").then((ok) => ok && setOpen(null)); }} />
                    </div>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Load>
      <ApprovalList key={ver} onChanged={p.reload} kinds={["mpin_reset"]} title="Waiting for a second person" empty="No MPIN resets are waiting." />
    </div>
  );
}
