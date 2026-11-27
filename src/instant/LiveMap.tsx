import { useEffect, useRef } from "react";
import type { StyleSpecification } from "maplibre-gl";
// The worker is bundled as our own asset (hashed file in dist/assets), so nothing is fetched from another host and
// the strict Content-Security-Policy (worker-src 'self' blob:) allows it.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { MAP_CENTRE, type MapMarker } from "./geo";

/**
 * Live board map. MapLibre with a BLANK style: no sources, so no tile, glyph or sprite URL is ever requested
 * (tiles are self-hosted later, P3 ADM-PRD-003). Markers are plain elements, so no font is needed either.
 * If the library or WebGL is unavailable the parent switches to list-only mode (P5 AS-27 state).
 */
/** MapLibre cannot read a CSS variable, so the background colour is read from the design token when the map is made. */
const blankStyle = (): StyleSpecification => ({
  version: 8,
  sources: {},
  layers: [{ id: "background", type: "background", paint: { "background-color": getComputedStyle(document.documentElement).getPropertyValue("--map-bg").trim() || "transparent" } }],
});

export default function LiveMap({ markers, onUnavailable }: { markers: MapMarker[]; onUnavailable: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    let remove: (() => void) | undefined;
    void (async () => {
      try {
        const ml = await import("maplibre-gl");
        await import("maplibre-gl/dist/maplibre-gl.css");
        if (cancelled || !box.current) return;
        ml.setWorkerUrl(workerUrl);
        const map = new ml.Map({ container: box.current, style: blankStyle(), center: MAP_CENTRE, zoom: 11, attributionControl: false });
        map.on("error", () => undefined); // a blank style has nothing to fail loading; keep errors out of the console
        remove = () => map.remove();
        for (const m of markers) {
          const el = document.createElement("div");
          el.title = m.label;
          el.setAttribute("role", "img");
          el.setAttribute("aria-label", m.label);
          el.style.cssText =
            m.kind === "partner"
              ? "width:14px;height:14px;border-radius:50%;background:var(--brand-600);border:2px solid var(--n-0);box-shadow:0 0 0 1px var(--brand-600)"
              : "width:12px;height:12px;border-radius:2px;background:var(--st-warn-fg);border:2px solid var(--n-0);box-shadow:0 0 0 1px var(--st-warn-fg)";
          new ml.Marker({ element: el }).setLngLat(m.lngLat).addTo(map);
        }
      } catch {
        if (!cancelled) onUnavailable();
      }
    })();
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [markers, onUnavailable]);
  return <div ref={box} className="h-72 w-full overflow-hidden rounded-lg border border-line" data-testid="live-map" />;
}
