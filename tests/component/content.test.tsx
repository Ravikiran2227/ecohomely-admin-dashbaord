/**
 * Dynamic content screens (handover v1.32 §10P item 4; NEW / RECONSTRUCTED, CR-T85): the list with filters and counters,
 * the editor with the slot preview (the image is never loaded), draft -> submit -> review by a different head -> take down,
 * the two-person explanation, read-only for auditors, and axe 0.
 */
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "../axe";
import { person, renderAt } from "../helpers";

const MK = () => person(["MK"], { id: "t-mk", displayName: "Test Marketing", departments: [13] });
const HEAD13 = () => person(["DH"], { id: "t-dh13", displayName: "Test Head 13", departments: [13], headOf: [13] });
/** The seeded submitter of ci-2c3d... is st-sm-ravi; as a head they still may not review it. */
const SUBMITTER_HEAD = () => person(["SM", "DH"], { id: "st-sm-ravi", displayName: "Ravi", departments: [13], headOf: [13] });
const AUDITOR = () => person(["AU"], { id: "t-au", displayName: "Test Auditor", departments: [] });

/** jsdom renders the whole console after each action; a busy machine needs more than the 1 s default. */
const SLOW = { timeout: 5000 };
/** The editor is re-created with the new version after an action, so a notice is checked by text, not by holding its node. */
const shown = (text: string | RegExp) => waitFor(() => expect(screen.getByText(text)).toBeInTheDocument(), SLOW);
const IN_REVIEW_BY_ASHA = "ci-3d4e6f8a0c2e4a63";
const IN_REVIEW_BY_RAVI = "ci-2c3d5e7f9b1d3f52";
const DRAFT = "ci-4e5f7a9b1d3f5b74";
const PUBLISHED = "ci-0a1f3c9e2b7d4401";

describe("app content list", () => {
  it("shows the items with their counters, the legal note and New content for an author, and passes axe", async () => {
    const { container } = renderAt("/content", { user: MK(), departments: [13] });
    expect(await screen.findByRole("heading", { level: 1, name: "App content" })).toBeInTheDocument();
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("link", { name: "Monsoon deep clean is here" })).toBeInTheDocument();
    for (const h of ["Title", "Type", "Slot", "App", "Window (IST)", "Status", "Impressions", "Clicks", "CTR"]) expect(within(table).getByText(h)).toBeInTheDocument();
    expect(within(table).getByText("18,420")).toBeInTheDocument();
    expect(within(table).getByText("4%")).toBeInTheDocument(); // 731 / 18 420
    expect(screen.getByText(/Offer wording needs a legal review before publishing/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New content" })).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it("filters by status and by slot", async () => {
    const { ui } = renderAt("/content", { user: MK(), departments: [13] });
    await screen.findByRole("table");
    await ui.selectOptions(screen.getByLabelText("Status"), "published");
    await waitFor(() => expect(screen.queryByRole("link", { name: "Rate your partner after the job" })).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: "First booking welcome offer" })).toBeInTheDocument();
    await ui.selectOptions(screen.getByLabelText("Slot"), "partner_home_banner");
    expect(await screen.findByText("No content matches these filters")).toBeInTheDocument();
  });

  it("hides New content from an auditor", async () => {
    renderAt("/content", { user: AUDITOR() });
    await screen.findByRole("table");
    expect(screen.queryByRole("button", { name: "New content" })).not.toBeInTheDocument();
  });
});

describe("app content editor", () => {
  it("writes a draft with a preview that never loads the image, then submits it for review", async () => {
    const { ui, container } = renderAt("/content/new", { user: MK(), departments: [13] });
    expect(await screen.findByRole("heading", { level: 1, name: "New app content" })).toBeInTheDocument();
    await ui.selectOptions(screen.getByLabelText("Slot"), "customer_booking_done");
    const type = screen.getByLabelText("Type");
    expect(within(type).getAllByRole("option").map((o) => o.textContent)).toEqual(["Banner", "Announcement"]);
    await ui.type(screen.getByLabelText(/^Title/), "Thanks for booking");
    await ui.type(screen.getByLabelText(/^Image address/), "https://cdn.example.invalid/thanks.webp");
    await ui.type(screen.getByLabelText(/^Link/), "ecohomely://bookings");
    const preview = screen.getByRole("figure", { name: "Slot preview" });
    expect(within(preview).getByText("Image from cdn.example.invalid")).toBeInTheDocument();
    expect(within(preview).getByText("Thanks for booking")).toBeInTheDocument();
    expect(within(preview).getByText("Booking confirmed")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    await expectNoA11yViolations(container);
    await ui.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Thanks for booking" }, SLOW)).toBeInTheDocument();
    expect(screen.getByText("Draft", { selector: "span" })).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "Submit for review" });
    expect(submit).toBeEnabled();
    await ui.click(submit);
    await shown(/Submitted\. The head of department 13 or 8 reviews it\./);
    expect(await screen.findByRole("region", { name: "Review" }, SLOW)).toHaveTextContent(/Two-person rule/);
    expect(screen.queryByRole("button", { name: "Approve and publish" })).not.toBeInTheDocument(); // MK is not a reviewer
  });

  it("checks the form before sending: https only, 6-digit pincodes, end after start", async () => {
    const { ui } = renderAt("/content/new", { user: MK(), departments: [13] });
    await screen.findByRole("heading", { level: 1, name: "New app content" });
    await ui.type(screen.getByLabelText(/^Title/), "Hello");
    await ui.type(screen.getByLabelText(/^Image address/), "http://cdn.example.invalid/x.png");
    await ui.type(screen.getByLabelText(/^Pincodes/), "560034, 012345");
    const start = screen.getByLabelText("Start (India time)") as HTMLInputElement;
    const end = screen.getByLabelText("End (India time)");
    await ui.clear(end);
    await ui.type(end, start.value);
    await ui.click(screen.getByRole("button", { name: "Save draft" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/Image: use an https:\/\/ address/);
    expect(alert).toHaveTextContent(/012345/);
    expect(alert).toHaveTextContent(/The end must be after the start/);
  });

  it("lets a different head approve, shows the history and counters, then take it down with a reason", async () => {
    const { ui, container } = renderAt(`/content/${IN_REVIEW_BY_ASHA}`, { user: HEAD13(), departments: [13] });
    expect(await screen.findByRole("heading", { level: 1, name: "Festive home refresh" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Title/)).toBeDisabled(); // a reviewer never edits
    await expectNoA11yViolations(container);
    await ui.click(screen.getByRole("button", { name: "Reject…" }));
    const reject = screen.getByRole("group", { name: "Reject" });
    expect(within(reject).getByRole("button", { name: "Reject" })).toBeDisabled(); // a reason is required
    await ui.click(within(reject).getByRole("button", { name: "Cancel" }));
    await ui.click(screen.getByRole("button", { name: "Approve and publish" }));
    await shown("Approved and published.");
    await waitFor(() => expect(screen.getByRole("region", { name: "History" })).toHaveTextContent(/Approved and published by t-dh13/), SLOW);
    expect(screen.getByRole("region", { name: "Counters" })).toBeInTheDocument();
    await ui.click(screen.getByRole("button", { name: "Take down…" }));
    const form = screen.getByRole("group", { name: "Take down" });
    await ui.selectOptions(within(form).getByLabelText("Reason"), "campaign_ended");
    await ui.click(within(form).getByRole("button", { name: "Take down now" }));
    await shown("Taken down.");
    await waitFor(() => expect(screen.getByRole("region", { name: "History" })).toHaveTextContent(/Taken down by t-dh13: The campaign has ended/), SLOW);
  });

  it("explains the two-person rule to the head who submitted the item and hides the decision", async () => {
    renderAt(`/content/${IN_REVIEW_BY_RAVI}`, { user: SUBMITTER_HEAD(), departments: [13] });
    expect(await screen.findByRole("heading", { level: 1, name: "New training videos for sofa cleaning" })).toBeInTheDocument();
    expect(screen.getByText("You wrote or submitted this item, so a different head must review it.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve and publish" })).not.toBeInTheDocument();
  });

  it("is read-only for an auditor and shows the counters of a published item", async () => {
    renderAt(`/content/${DRAFT}`, { user: AUDITOR() });
    expect(await screen.findByRole("heading", { level: 1, name: "Rate your partner after the job" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Title/)).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit for review" })).not.toBeInTheDocument();
  });

  it("shows impressions, clicks and CTR of a published item, with no take-down for an auditor", async () => {
    renderAt(`/content/${PUBLISHED}`, { user: AUDITOR() });
    const counters = await screen.findByRole("region", { name: "Counters" });
    expect(counters).toHaveTextContent("18,420");
    expect(counters).toHaveTextContent("731");
    expect(counters).toHaveTextContent("4%");
    expect(screen.queryByRole("button", { name: "Take down…" })).not.toBeInTheDocument();
  });

  it("shows an error with a retry for an unknown item", async () => {
    renderAt("/content/ci-missing", { user: MK(), departments: [13] });
    expect(await screen.findByText("No such content item.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
