/** Synthetic pincode centres (longitude, latitude) near Visakhapatnam. Labels for the blank-style map, not real boundaries. */
export const PINCODE_CENTRES: Record<string, [number, number]> = {
  "530101": [83.295, 17.715],
  "530102": [83.31, 17.73],
  "530103": [83.335, 17.71],
  "530104": [83.29, 17.745],
  "530105": [83.255, 17.72],
  "530106": [83.28, 17.675],
  "530107": [83.37, 17.78],
};
export const MAP_CENTRE: [number, number] = [83.3, 17.72];

export type MapMarker = { id: string; kind: "job" | "partner"; label: string; lngLat: [number, number] };

/** Small deterministic jitter so several jobs in one pincode do not sit on one point. */
export function jitter(id: string): [number, number] {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return [((h % 100) / 100 - 0.5) * 0.01, (((h >> 7) % 100) / 100 - 0.5) * 0.01];
}
