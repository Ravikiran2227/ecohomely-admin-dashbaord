import type { ColumnDef } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ApiError } from "@/api/errors";
import type { ScheduledJob, ScheduledJobPage } from "@/api/instant";
import { JOB_STATUSES } from "@/instant/domain";
import { Load } from "@/work/common";
import { Field, selectClass } from "@/work/common";
import { Badge, Card, Input, PageHeader } from "@/ui/primitives";
import { DataTable } from "@/ui/DataTable";
import { formatDateTime, useInstant, usePolled } from "./hooks";

/**
 * Scheduled bookings (E-140, READY local): the staff list of scheduled Instant jobs for IO, SA, AU and the head of Instant Ops.
 * Read only. No customer data at all: the booking reference stands for the customer. The release time and the auto-cancel time
 * are the server's settings (never worked out here). Scheduled booking can be switched off on the server: then this page says so.
 */
export function ScheduledJobsPage() {
  const { user, instant } = useInstant();
  const [pincode, setPincode] = useState("");
  const [status, setStatus] = useState("");
  const pinOk = pincode === "" || /^[1-9][0-9]{5}$/.test(pincode);
  const p = usePolled(
    async (): Promise<{ off: boolean; page: ScheduledJobPage | null }> => {
      try {
        return { off: false, page: await instant.scheduledJobs(user, { pincode: pinOk && pincode ? pincode : undefined, status: status || undefined }) };
      } catch (e) {
        if (e instanceof ApiError && e.code === "not_found") return { off: true, page: null };
        throw e;
      }
    },
    null,
    `${pinOk ? pincode : ""}|${status}`,
  );
  const columns = useMemo<ColumnDef<ScheduledJob, unknown>[]>(() => [
    { accessorKey: "reference", header: "Booking", cell: (c) => <Link className="text-primary underline" to={`/instant/jobs/${c.row.original.jobId}`}>{c.row.original.reference}</Link> },
    { accessorKey: "serviceName", header: "Service" },
    { id: "where", header: "Pincode and area", accessorFn: (j) => `${j.pincode} ${j.area}` },
    { accessorKey: "scheduledAt", header: "Visit", cell: (c) => formatDateTime(c.row.original.scheduledAt) },
    { accessorKey: "releaseAt", header: "Enters dispatch", cell: (c) => formatDateTime(c.row.original.releaseAt) },
    { id: "cancel", header: "Auto-cancel if no partner", accessorFn: (j) => j.autoCancelAt ?? Number.MAX_SAFE_INTEGER, cell: (c) => (c.row.original.autoCancelAt === null ? "-" : formatDateTime(c.row.original.autoCancelAt)) },
    { accessorKey: "status", header: "Status", cell: (c) => <Badge>{c.row.original.status.replace(/_/g, " ")}</Badge> },
    { accessorKey: "partnerAssigned", header: "Partner", cell: (c) => (c.row.original.partnerAssigned ? "Assigned" : "Not yet") },
  ], []);
  return (
    <div className="space-y-6">
      <PageHeader title="Scheduled bookings" subtitle="Scheduled Instant jobs in the next 31 days. Read only: the booking reference stands for the customer, no name, phone or address." />
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40"><Field label="Pincode">{(id) => <Input id={id} inputMode="numeric" maxLength={6} value={pincode} onChange={(e) => setPincode(e.target.value.trim())} aria-invalid={!pinOk} />}</Field></div>
        <div className="w-56"><Field label="Status">{(id) => (
          <select id={id} className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {JOB_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
          </select>)}</Field></div>
      </div>
      {!pinOk ? <p role="alert" className="text-sm text-danger">A pincode has 6 digits and does not start with 0.</p> : null}
      <Load p={p}>
        {(r) => r.off || !r.page ? (
          <Card role="status" className="text-sm">Scheduled booking is switched off on the server (INSTANT_SCHEDULED_BOOKING_ENABLED), so there is no list to show.</Card>
        ) : (
          <section aria-label="Scheduled bookings" className="space-y-2">
            <p className="text-sm text-muted">{r.page.total} scheduled {r.page.total === 1 ? "booking" : "bookings"}{r.page.total > r.page.items.length ? `, showing the first ${r.page.items.length}` : ""}.</p>
            <DataTable label="Scheduled bookings table" data={r.page.items} columns={columns} getRowId={(j) => j.jobId} empty="No scheduled bookings in this period." />
          </section>
        )}
      </Load>
    </div>
  );
}
