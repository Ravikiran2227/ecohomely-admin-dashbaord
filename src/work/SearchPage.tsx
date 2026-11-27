import { Link, useSearchParams } from "react-router";
import type { SearchHit } from "@/api/w3";
import { usePolled } from "@/instant/hooks";
import { Card, PageHeader } from "@/ui/primitives";
import { Load, useApi } from "./common";
import { SearchBox } from "./DirectoryPages";

// ------------------------------------------------------------------ global search (AS-06)
export const KIND_NAME: Record<SearchHit["kind"], string> = {
  customer: "Customers", partner: "Partners", regular_booking: "Regular bookings", instant_job: "Instant jobs", payment: "Payments", ticket: "Tickets",
};

export function SearchPage() {
  const { user, api } = useApi();
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const p = usePolled(() => api.search.search(user, q), null, q);
  return (
    <div className="space-y-4">
      <PageHeader title="Search" subtitle="Only records from your own departments, masked. Matches an id, a name or a phone number; numbers are never shown." />
      <SearchBox value={q} onSubmit={(v) => setParams(v ? { q: v } : {})} name="Search records" />
      {q.trim().length < 2 ? <Card className="text-sm text-muted">Type at least two characters.</Card> : (
        <Load p={p}>
          {({ hits, tooMany }) => {
            if (hits.length === 0) return <Card className="text-sm text-muted">Nothing you can open matches that.</Card>;
            const kinds = (Object.keys(KIND_NAME) as SearchHit["kind"][]).filter((k) => hits.some((h) => h.kind === k));
            return (
              <div className="space-y-4">
                {tooMany ? <Card role="status" className="text-sm">Too many matches. Showing the first {hits.length}. Narrow the search.</Card> : null}
                {kinds.map((k) => (
                  <section key={k} aria-label={KIND_NAME[k]} className="space-y-1">
                    <h2 className="text-base font-semibold">{KIND_NAME[k]}</h2>
                    <ul className="space-y-1 text-sm">{hits.filter((h) => h.kind === k).map((h) => <li key={h.id}><Link className="text-primary underline" to={h.href}>{h.label}</Link></li>)}</ul>
                  </section>
                ))}
              </div>
            );
          }}
        </Load>
      )}
    </div>
  );
}
