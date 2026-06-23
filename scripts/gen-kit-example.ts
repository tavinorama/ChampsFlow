/**
 * One-off: generate a sample Get-Cited Kit deliverable (mock mode, no network)
 * so we can see exactly what a $29 buyer receives. Run: npx tsx scripts/gen-kit-example.ts
 */
import { buildKitDeliverable } from "../packages/llm/src/kit-deliverable";

void (async () => {
  const kit = await buildKitDeliverable({
    brand: "Acme CRM",
    domain: null, // null → no live crawl, fully deterministic mock
    category: "CRM software",
    region: "US",
  });
  console.log(JSON.stringify(kit, null, 2));
})();
