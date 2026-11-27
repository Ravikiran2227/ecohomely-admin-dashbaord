// @vitest-environment node
/**
 * pdfjs-dist supply check (project head decision 19 Nov 2026): the exact version, its licence, the files the console ships contain no dynamic
 * code (this version has no `isEvalSupported` option: the code path is gone), and the optional native canvas package is not installed.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");
const lock = JSON.parse(read("package-lock.json")) as {
  packages: Record<string, { version?: string; license?: string; integrity?: string; dev?: boolean; optional?: boolean; optionalDependencies?: Record<string, string> }>;
};

describe("pdfjs-dist 6.5.438", () => {
  it("is pinned exactly, Apache-2.0, at the checked hash, and not a dev-only dependency", () => {
    expect((JSON.parse(read("package.json")) as { dependencies: Record<string, string> }).dependencies["pdfjs-dist"]).toBe("6.5.438");
    const e = lock.packages["node_modules/pdfjs-dist"];
    expect(e?.version).toBe("6.5.438");
    expect(e?.license).toBe("Apache-2.0");
    expect(e?.integrity).toBe("sha512-vg8Pw1x+AFKy4AMDvhuWl5cOYV8d698UoEANoFFhc79hqXDnZQqnOXoxw3HG907WHOg1JYOvLhP756boddFxpA==");
    expect(e?.dev).toBeUndefined();
    // CVE-2024-4367 is fixed from 4.2.67; the installed version is newer.
    const [maj = 0, min = 0, pat = 0] = (e?.version ?? "0.0.0").split(".").map(Number);
    expect(maj > 4 || (maj === 4 && (min > 2 || (min === 2 && pat >= 67)))).toBe(true);
  });
  it("the files the console ships (page code and worker) contain no eval( and no new Function(", () => {
    for (const f of ["node_modules/pdfjs-dist/build/pdf.min.mjs", "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"]) {
      const t = read(f);
      expect(/\beval\s*\(/.test(t), `${f} has eval(`).toBe(false);
      expect(/new\s+Function\s*\(/.test(t), `${f} has new Function(`).toBe(false);
    }
  });
  it("the native canvas package is only ever an optional transitive dependency, never one we ask for", () => {
    // 21 Nov 2026. This used to assert `@napi-rs/canvas` was absent from node_modules, which made the
    // result depend on how you installed: a plain `npm install` or `npm ci` fetches optional packages
    // and the check failed, and DECISIONS_B 10M-B4 says not to run `--omit=optional` here (it also
    // strips the build tools' own native binaries). The guarantee that actually matters is that the
    // console never *asks* for native code, so that is what is asserted now.
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter((d) => d.startsWith("@napi-rs/"))).toEqual([]);

    // It exists in the tree only as an OPTIONAL dependency of pdfjs-dist, so a production install
    // with --omit=optional drops it and nothing breaks.
    expect(Object.keys(lock.packages["node_modules/pdfjs-dist"]?.optionalDependencies ?? {})).toContain("@napi-rs/canvas");
    for (const [name, entry] of Object.entries(lock.packages)) {
      if (!name.includes("@napi-rs/canvas")) continue;
      expect(entry.optional, `${name} must be optional`).toBe(true);
    }
  });
});
