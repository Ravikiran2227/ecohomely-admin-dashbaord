import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";

/**
 * Writes THIRD_PARTY_LICENSES.txt into the build output: name, version, declared licence and the licence file
 * text of every npm package that contributed code to the bundle, plus packages whose assets we ship (fonts).
 * Licence text is read from the local installed package only (no network).
 */
const ALWAYS_INCLUDE = ["@fontsource-variable/inter"]; // font files are assets, not modules; ships under OFL-1.1

function packageDirFor(moduleId: string): string | null {
  const marker = "node_modules/";
  const clean = moduleId.replace(/\\/g, "/").split("?")[0] ?? "";
  const at = clean.lastIndexOf(marker);
  if (at === -1) return null;
  const rest = clean.slice(at + marker.length).split("/");
  const name = rest[0]?.startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0];
  if (!name) return null;
  return clean.slice(0, at + marker.length) + name;
}

function readLicenceText(dir: string): string {
  for (const f of ["LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE", "license", "License.txt", "LICENSE-MIT"]) {
    const p = join(dir, f);
    if (existsSync(p)) return readFileSync(p, "utf8").trim();
  }
  return "(no licence file in the package; see the declared licence above)";
}

export function thirdPartyLicenses(): Plugin {
  return {
    name: "ecohomely-third-party-licenses",
    apply: "build",
    generateBundle(_options, bundle) {
      const dirs = new Set<string>();
      for (const item of Object.values(bundle)) {
        if (item.type !== "chunk") continue;
        for (const id of Object.keys(item.modules)) {
          const d = packageDirFor(id);
          if (d) dirs.add(d);
        }
      }
      const root = process.cwd().replace(/\\/g, "/");
      for (const name of ALWAYS_INCLUDE) dirs.add(`${root}/node_modules/${name}`);
      const entries = [...dirs]
        .map((d) => {
          const pkg = JSON.parse(readFileSync(join(d, "package.json"), "utf8")) as {
            name: string;
            version: string;
            license?: string;
          };
          return { name: pkg.name, version: pkg.version, license: pkg.license ?? "UNKNOWN", text: readLicenceText(d) };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      const header =
        "ECOHOMELY Admin Console, third-party software and fonts included in this build.\n" +
        "Generated at build time from the installed packages (no network). Tooling used only to build is not listed.\n" +
        `Packages: ${entries.length}\n`;
      const body = entries
        .map((e) => `\n${"=".repeat(78)}\n${e.name} ${e.version}  (${e.license})\n${"=".repeat(78)}\n${e.text}\n`)
        .join("");
      this.emitFile({ type: "asset", fileName: "THIRD_PARTY_LICENSES.txt", source: header + body });
    },
  };
}
