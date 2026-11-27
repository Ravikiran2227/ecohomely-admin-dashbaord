import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Banner } from "@/ui/Banner";
import { KpiCard } from "@/ui/KpiCard";
import { Button, PageHeader, StatusPill } from "@/ui/primitives";
import { SlaTimer, slaState } from "@/ui/SlaTimer";
import { StateEmpty } from "@/ui/states";
import { expectNoA11yViolations } from "../axe";

/** Design system v1.0 section 3: the shared components. Behaviour only; the look is checked in the real browser. */
describe("StatusPill", () => {
  it("is always icon plus text, never colour alone; the icon is hidden from assistive technology", () => {
    const { container } = render(<>{(["ok", "warn", "breach", "info", "neutral", "critical"] as const).map((t) => <StatusPill key={t} tone={t}>{`State ${t}`}</StatusPill>)}</>);
    for (const t of ["ok", "warn", "breach", "info", "neutral", "critical"]) {
      const pill = screen.getByText(`State ${t}`);
      expect(pill.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    }
    expect(container.querySelectorAll("svg")).toHaveLength(6);
  });
});

describe("SLA timer", () => {
  const MIN = 60_000;
  it("ok until 80% of the time is used, warn from 80%, breach at 100%", () => {
    const start = 0, due = 100 * MIN;
    expect(slaState(start, due, 50 * MIN).tone).toBe("ok");
    expect(slaState(start, due, 79 * MIN).tone).toBe("ok");
    expect(slaState(start, due, 80 * MIN).tone).toBe("warn");
    expect(slaState(start, due, 99 * MIN).tone).toBe("warn");
    expect(slaState(start, due, 100 * MIN).tone).toBe("breach");
    expect(slaState(start, due, 104 * MIN)).toMatchObject({ tone: "breach", remainingMs: -4 * MIN });
  });
  it("shows the time left, or the time over, with the SLA in the tooltip", () => {
    const now = Date.now();
    const { rerender } = render(<SlaTimer startedAt={now - 30 * MIN} dueAt={now + 12 * MIN} label="First response" />);
    expect(screen.getByText(/\d+:?\d* ?(min)? left|left/)).toBeInTheDocument();
    expect(screen.getByText(/left/).closest("span[title]")?.getAttribute("title")).toMatch(/^First response: due /);
    rerender(<SlaTimer startedAt={now - 60 * MIN} dueAt={now - 4 * MIN} />);
    expect(screen.getByText(/^Breached/)).toBeInTheDocument();
  });
});

describe("KPI card", () => {
  it("shows a value with its detail and delta, and a health pill", () => {
    render(<KpiCard label="Stuck jobs" value="3" detail="Past 10 minutes" health={{ tone: "breach", text: "Breach" }} delta={{ text: "4% vs last week", direction: "up", good: false }} />);
    const card = screen.getByRole("region", { name: "Stuck jobs" });
    expect(card).toHaveTextContent("3");
    expect(card).toHaveTextContent("Past 10 minutes");
    expect(card).toHaveTextContent("Breach");
    expect(card).toHaveTextContent("▲ 4% vs last week");
  });
  it("never invents a number: 'not available' with the server's reason", () => {
    render(<KpiCard label="Fill rate" value={null} unavailableReason="The daily snapshot has not been taken yet." />);
    const card = screen.getByRole("region", { name: "Fill rate" });
    expect(card).toHaveTextContent("Not available");
    expect(card).toHaveTextContent("The daily snapshot has not been taken yet.");
    expect(card.textContent).not.toMatch(/\d/);
  });
});

describe("Banner, empty state, page header, button", () => {
  it("a danger banner is an alert, info and warn are status messages; each has an icon", () => {
    render(<><Banner tone="danger">Payments provider not responding.</Banner><Banner tone="warn">Slow.</Banner><Banner>FYI.</Banner></>);
    expect(screen.getByRole("alert")).toHaveTextContent("Payments provider not responding.");
    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(document.querySelectorAll("[role] svg")).toHaveLength(3);
  });
  it("an empty queue can be good news (ok icon) and can offer one action", () => {
    render(<StateEmpty title="No breached jobs right now" good action={<Button variant="secondary">Open the board</Button>}>Nothing is past its SLA.</StateEmpty>);
    expect(screen.getByText("No breached jobs right now")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open the board" })).toBeInTheDocument();
  });
  it("the page header has breadcrumbs, one h1, a description and actions; axe", async () => {
    const { container } = render(
      <main>
        <PageHeader title="Payouts" subtitle="Weekly batches." breadcrumbs={<span>Money / Payouts</span>} actions={<Button size="lg">Prepare batch</Button>} />
        <Button variant="danger" aria-label="Delete draft">Delete</Button>
      </main>,
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByText("Money / Payouts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prepare batch" })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
