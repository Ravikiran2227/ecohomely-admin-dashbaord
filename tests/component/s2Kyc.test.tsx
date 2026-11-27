import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockApi } from "@/api/mock";
import type { ApiClient } from "@/api/types";
import type { OpenedDocument } from "@/api/work";
import { expectNoA11yViolations } from "../axe";
import { VERIFIER, openRow, renderAt } from "../helpers";

// pdf.js itself needs a real canvas and a worker: it is replaced here, so the REAL component and renderer run against a stand-in.
const pdf = vi.hoisted(() => {
  const state = { numPages: 2, fail: false, getPage: 0, opts: [] as Record<string, unknown>[], destroyed: 0, rendered: 0 };
  const getDocument = (o: Record<string, unknown>) => {
    state.opts.push(o);
    return {
      promise: state.fail ? Promise.reject(new Error("bad pdf")) : Promise.resolve({
        numPages: state.numPages,
        getPage: async () => { state.getPage++; return { getViewport: ({ scale }: { scale: number }) => ({ width: 300 * scale, height: 400 * scale }), render: () => { state.rendered++; return { promise: Promise.resolve() }; } }; },
      }),
      destroy: async () => { state.destroyed++; },
    };
  };
  return { state, getDocument, GlobalWorkerOptions: { workerSrc: "" } };
});
vi.mock("pdfjs-dist", () => ({ getDocument: pdf.getDocument, GlobalWorkerOptions: pdf.GlobalWorkerOptions }));

const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const BYTES = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]).buffer;
const withDoc = (doc: () => OpenedDocument): ApiClient => {
  const base = createMockApi();
  return { ...base, gates: { ...base.gates, openDocument: async () => doc() } };
};
beforeEach(() => { Object.assign(pdf.state, { numPages: 2, fail: false, getPage: 0, opts: [], destroyed: 0, rendered: 0 }); });
const open = async (api: ApiClient, button: string) => {
  const r = renderAt("/hr/kyc", { user: VERIFIER(), departments: [11], api });
  await openRow(r.ui, "Application APP-402");
  const app = await screen.findByRole("region", { name: "Application APP-402" });
  await r.ui.click(within(app).getByRole("button", { name: button }));
  return { ...r, app };
};

describe("E-41 KYC document viewer", () => {
  it("shows an image in the page, then Close removes it; axe", async () => {
    const api = withDoc(() => ({ expiresAt: Date.now() + 300_000, text: "aadhaar: image, 1 KB. Shown only in this page, never saved.", file: { kind: "image", url: PIXEL, name: "aadhaar.png" } }));
    const { ui, container, app } = await open(api, "Open document: Aadhaar of APP-402");
    const box = await within(app).findByRole("group", { name: "Opened document: Aadhaar of APP-402" });
    expect(within(box).getByRole("img", { name: "Document: Aadhaar of APP-402" })).toHaveAttribute("src", PIXEL);
    await expectNoA11yViolations(container);
    await ui.click(within(box).getByRole("button", { name: "Close document: Aadhaar of APP-402" }));
    expect(screen.queryByRole("img", { name: /^Document:/ })).not.toBeInTheDocument();
  });

  it("draws a PDF on canvases from a copy of the bytes with the safe options, with no link and no download; Close clears and destroys; axe", async () => {
    const api = withDoc(() => ({ expiresAt: Date.now() + 300_000, text: "pan: PDF, 1 KB. Shown only in this page, never saved.", file: { kind: "pdf", bytes: BYTES, name: "pan.pdf" } }));
    const { ui, container, app } = await open(api, "Open document: PAN of APP-402");
    const box = await within(app).findByRole("group", { name: "Opened document: PAN of APP-402" });
    await waitFor(() => expect(within(box).getAllByRole("img").map((c) => c.getAttribute("aria-label"))).toEqual(["PDF page 1 of 2", "PDF page 2 of 2"]));
    expect(pdf.state.opts).toHaveLength(1);
    expect(pdf.state.opts[0]).toMatchObject({ disableFontFace: true, useSystemFonts: false, enableXfa: false });
    const data = pdf.state.opts[0]?.data as Uint8Array;
    expect(Array.from(data)).toEqual(Array.from(new Uint8Array(BYTES)));
    expect(data.buffer).not.toBe(BYTES); // a copy: the original bytes are not handed to the worker
    expect(box.querySelector("a, iframe, object, embed, [download]")).toBeNull();
    expect(within(box).queryByRole("link")).toBeNull();
    expect(typeof pdf.GlobalWorkerOptions.workerSrc).toBe("string");
    expect(pdf.GlobalWorkerOptions.workerSrc).not.toMatch(/^(https?:)?\/\//); // the worker is a local asset, never a CDN address
    await expectNoA11yViolations(container);
    await ui.click(within(box).getByRole("button", { name: "Close document: PAN of APP-402" }));
    await waitFor(() => expect(pdf.state.destroyed).toBeGreaterThan(0));
    expect(screen.queryByRole("img", { name: /^PDF page/ })).not.toBeInTheDocument();
  });

  it("a PDF that cannot be drawn says so and offers no download", async () => {
    pdf.state.fail = true;
    const api = withDoc(() => ({ expiresAt: Date.now() + 300_000, text: "bank: PDF", file: { kind: "pdf", bytes: BYTES, name: "bank.pdf" } }));
    const { app } = await open(api, "Open document: Bank of APP-402");
    const box = await within(app).findByRole("group", { name: "Opened document: Bank of APP-402" });
    expect(await within(box).findByText(/PDF viewing not available in the console/)).toBeInTheDocument();
    expect(box.querySelector("a, [download]")).toBeNull();
  });

  it("draws at most 10 pages and says how many there are", async () => {
    pdf.state.numPages = 12;
    const api = withDoc(() => ({ expiresAt: Date.now() + 300_000, text: "pan: PDF", file: { kind: "pdf", bytes: BYTES, name: "pan.pdf" } }));
    const { app } = await open(api, "Open document: PAN of APP-402");
    const box = await within(app).findByRole("group", { name: "Opened document: PAN of APP-402" });
    expect(await within(box).findByText("The first 10 of 12 pages are shown.")).toBeInTheDocument();
    expect(within(box).getAllByRole("img")).toHaveLength(10);
    expect(pdf.state.getPage).toBe(10);
  });

  it("removes the file and destroys the document when its 5-minute link ends", async () => {
    const api = withDoc(() => ({ expiresAt: Date.now() + 150, text: "pan: PDF", file: { kind: "pdf", bytes: BYTES, name: "pan.pdf" } }));
    const { app } = await open(api, "Open document: PAN of APP-402");
    await within(app).findByRole("group", { name: "Opened document: PAN of APP-402" });
    await waitFor(() => expect(within(app).queryByRole("group", { name: /^Opened document/ })).not.toBeInTheDocument(), { timeout: 3000 });
    expect(pdf.state.destroyed).toBeGreaterThan(0);
  });
});
