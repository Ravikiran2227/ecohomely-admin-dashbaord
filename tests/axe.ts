import axe from "axe-core";
import { expect } from "vitest";

/**
 * Automated accessibility check (WCAG 2 A/AA rules) on rendered markup. DEV/TEST ONLY: axe-core (MPL-2.0) is a
 * devDependency and is never imported from src, so it is never shipped (checked against dist in the build check).
 * jsdom has no layout engine, so colour-contrast cannot be computed here; it is checked in the real browser run
 * (`_local\scripts\run_b_browser_check.ps1`), which injects axe-core into Edge.
 */
export async function expectNoA11yViolations(container: Element) {
  const results = await axe.run(container, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] },
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.html.slice(0, 90)).join(" | ")}`);
  expect(summary, "accessibility violations").toEqual([]);
}
