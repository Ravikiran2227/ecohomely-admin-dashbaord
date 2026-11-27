import { Info, X } from "lucide-react";
import { useState } from "react";
import { Banner } from "@/ui/Banner";

/**
 * The notice for the local demo (owner feedback 19 Nov 2026): one short line, dismissible for the session, the details in a tooltip (and in
 * text for assistive technology). It exists only when the build talks to a local server; a production-profile build compiles it out
 * (`VITE_API_PRODUCTION_PROFILE=true` makes this constant false at build time, and `tests/build/cspBuild.test.ts` checks the text is not in that bundle).
 */
export const SHOW_LOCAL_NOTICE: boolean = import.meta.env.VITE_API_PRODUCTION_PROFILE !== "true";
const KEY = "eh.localNotice.dismissed";

export function LocalNotice({ details }: { details: string }) {
  const [gone, setGone] = useState(() => { try { return sessionStorage.getItem(KEY) === "1"; } catch { return false; } });
  if (gone) return null;
  return (
    <Banner tone="info" className="items-center rounded-none border-x-0 border-t-0 py-1.5 text-xs">
      <span className="flex items-center gap-2">
        <span>Local demo: live where ready, synthetic elsewhere</span>
        <span title={details} className="inline-flex text-info-fg"><Info className="size-3.5" aria-hidden /></span>
        <span className="sr-only">{details}</span>
        <button
          type="button"
          aria-label="Dismiss this notice"
          title="Dismiss for this session"
          className="ml-auto rounded-sm p-0.5 text-info-fg hover:bg-info-bd/40"
          onClick={() => { try { sessionStorage.setItem(KEY, "1"); } catch { /* storage unavailable */ } setGone(true); }}
        ><X className="size-3.5" aria-hidden /></button>
      </span>
    </Banner>
  );
}
