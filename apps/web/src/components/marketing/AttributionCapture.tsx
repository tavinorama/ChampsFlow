"use client";

/**
 * AttributionCapture — invisible mount-effect for the marketing layout.
 *
 * A cold lead can land with ?from=/utm_* on ANY public page (homepage, /kit,
 * a blog post), not only on the pages that send funnel POSTs. Mounting this
 * in the (marketing) layout makes every landing store the campaign origin in
 * sessionStorage (via readAttributionFromLocation), so the /test and
 * /ai-audit funnels find it later even after the query string is long gone.
 */

import { useEffect } from "react";
import { readAttributionFromLocation } from "../../lib/campaign-attribution";

export function AttributionCapture(): null {
  useEffect(() => {
    readAttributionFromLocation();
  }, []);
  return null;
}
