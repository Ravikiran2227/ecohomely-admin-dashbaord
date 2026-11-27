import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { RecordTable } from "@/work/ListKit";
import { expectNoA11yViolations } from "../axe";

// C1 B3 (review R-5): the list pattern used on /admin/staff, /hr/kyc, /customers/tolet, /finance/refunds and /approvals.
type Row = { id: string; name: string; n: number };
const ROWS: Row[] = Array.from({ length: 30 }, (_, i) => ({ id: `r-${i + 1}`, name: `Person ${String(i + 1).padStart(2, "0")}`, n: 30 - i }));

function Harness({ rows = ROWS, withSelect = false }: { rows?: Row[]; withSelect?: boolean }) {
  const [sel, setSel] = useState<string[]>([]);
  return (
    <>
      <RecordTable label="People" rows={rows} getId={(r) => r.id} title={(r) => r.name} search={(r) => r.name} subtitle="Person"
        columns={[{ id: "name", header: "Name", cell: (r) => r.name, sort: (r) => r.name }, { id: "n", header: "Score", cell: (r) => r.n, sort: (r) => r.n }]}
        select={withSelect ? { selected: sel, onChange: setSel, label: (r) => `Select ${r.name}` } : undefined}
        detail={(r) => <section aria-label={`Detail ${r.name}`}><p>Score {r.n}</p></section>} />
      <p data-testid="sel">{sel.join(",")}</p>
    </>
  );
}
const mount = (initial = "/list", el = <Harness />) => {
  const ui = userEvent.setup();
  return { ui, ...render(<MemoryRouter initialEntries={[initial]}>{el}</MemoryRouter>) };
};
const bodyRows = () => within(screen.getByRole("table", { name: "People" })).getAllByRole("row").slice(1);

describe("RecordTable (C1 B3, R-5)", () => {
  it("shows pages of 25 with a count, and Next/Previous; axe", async () => {
    const { ui, container } = mount();
    expect(bodyRows()).toHaveLength(25);
    expect(screen.getByText("1 to 25 of 30")).toBeInTheDocument();
    await expectNoA11yViolations(container);
    await ui.click(screen.getByRole("button", { name: "Next page" }));
    expect(bodyRows()).toHaveLength(5);
    expect(screen.getByText("26 to 30 of 30")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    await ui.click(screen.getByRole("button", { name: "Previous page" }));
    expect(screen.getByText("1 to 25 of 30")).toBeInTheDocument();
  });
  it("filters by text and says when nothing matches", async () => {
    const { ui } = mount();
    await ui.type(screen.getByLabelText("Filter people"), "person 0");
    expect(bodyRows()).toHaveLength(9);
    expect(screen.getByText("1 to 9 of 9 (filtered from 30)")).toBeInTheDocument();
    await ui.type(screen.getByLabelText("Filter people"), "zz");
    expect(screen.getByText(/Nothing matches "person 0zz"/)).toBeInTheDocument();
    await ui.click(screen.getByRole("button", { name: "Clear the filter" }));
    expect(bodyRows()).toHaveLength(25);
  });
  it("sorts by a column (ascending, then descending, then off) and says so to assistive tech", async () => {
    const { ui } = mount();
    const score = screen.getByRole("button", { name: "Score" });
    await ui.click(score);
    expect(screen.getByRole("columnheader", { name: /Score/ })).toHaveAttribute("aria-sort", "ascending");
    expect(within(bodyRows()[0] as HTMLElement).getByRole("rowheader")).toHaveTextContent("Person 30");
    await ui.click(score);
    expect(screen.getByRole("columnheader", { name: /Score/ })).toHaveAttribute("aria-sort", "descending");
    expect(within(bodyRows()[0] as HTMLElement).getByRole("rowheader")).toHaveTextContent("Person 01");
    await ui.click(score);
    expect(screen.getByRole("columnheader", { name: /Score/ })).not.toHaveAttribute("aria-sort");
  });
  it("opens a row's detail in the drawer (Open button or a click on the row); Esc closes it; axe", async () => {
    const { ui } = mount();
    await ui.click(screen.getByRole("button", { name: "Open Person 03" }));
    const dlg = await screen.findByRole("dialog", { name: "Person 03" });
    expect(within(dlg).getByRole("region", { name: "Detail Person 03" })).toHaveTextContent("Score 28");
    await expectNoA11yViolations(document.body);
    await ui.click(screen.getByText("Person 05"));
    expect(await screen.findByRole("dialog", { name: "Person 05" })).toBeInTheDocument();
    await ui.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("a shared link (?record=) opens the drawer on that item", async () => {
    mount("/list?record=r-7");
    expect(await screen.findByRole("region", { name: "Detail Person 07" })).toBeInTheDocument();
  });
  it("an id that is no longer in the list says so in the drawer", async () => {
    mount("/list?record=r-99");
    expect(await screen.findByText(/no longer in the list/)).toBeInTheDocument();
  });
  it("selection checkboxes do not open the drawer and report ids", async () => {
    const { ui } = mount("/list", <Harness withSelect />);
    await ui.click(screen.getByRole("checkbox", { name: "Select Person 02" }));
    await ui.click(screen.getByRole("checkbox", { name: "Select Person 04" }));
    expect(screen.getByTestId("sel")).toHaveTextContent("r-2,r-4");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("shows the empty text when there are no rows, and no table", () => {
    mount("/list", <Harness rows={[]} />);
    expect(screen.getByText("Nothing to show.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
