/**
 * stripe-bootstrap.ts — create the Ozvor catalog in YOUR Stripe account.
 *
 * Creates (idempotently) the Products, Prices (USD), and the founder coupon that
 * the app's checkout reads, then prints the exact env lines to paste.
 *
 * Run with YOUR key (test first, then live). The key is read from the env — it
 * is never written to disk or committed:
 *
 *   STRIPE_SECRET_KEY=sk_test_xxx npx tsx scripts/stripe-bootstrap.ts
 *
 * Re-running is safe: Prices are matched by lookup_key and the coupon by id;
 * Products are matched by metadata.ozvor_sku (Stripe Search has a brief
 * indexing lag, so two runs within ~1 min could create a duplicate Product —
 * not a problem for Prices, which never duplicate).
 */
import Stripe from "stripe";

const key = process.env["STRIPE_SECRET_KEY"];
if (!key) {
  console.error("✗ Set STRIPE_SECRET_KEY (use a sk_test_… key first).");
  process.exit(1);
}
const stripe = new Stripe(key, { apiVersion: "2024-06-20" });
const mode = key.startsWith("sk_live_") ? "LIVE" : "TEST";

// USD amounts in cents. Annual = 12× monthly (LIST price — the 30% founder
// discount is applied by the coupon at checkout, annual-only, NOT baked here).
//
// Agency pricing updated 2026-06-25: $149/mo → $249/mo; annual $2,988 list.
// Founder price (30% off annual): $2,988 × 0.70 = $2,091.60 → $2,091/yr.
//
// IMPORTANT — display/charge sync:
//   The Agency price shown in the UI is $249/mo and $2,091/yr (founder).
//   The ACTUAL CHARGE comes from the Stripe price IDs in env:
//     STRIPE_PRICE_ID_AGENCY        → must point to the $249/mo price created here
//     STRIPE_PRICE_ID_AGENCY_ANNUAL → must point to the $2,988/yr price created here
//   Run this script, paste the printed price IDs into Railway / .env.local, then
//   set env vars — otherwise checkout will charge the old $149 amount.
//   DO NOT hardcode price IDs anywhere; always read from env at runtime.
const CATALOG = {
  growth: { name: "Ozvor — Growth", desc: "Weekly AI-visibility monitoring + GEO content plan for 1 brand.", monthly: 9900, annual: 118800 },
  agency: { name: "Ozvor — Agency", desc: "Weekly monitoring + competitor tracking across up to 25 brands.", monthly: 24900, annual: 298800 },
  kit:    { name: "The Get-Cited Kit",      desc: "One-time AI Visibility audit + 3 ready-to-publish drafts + GEO guide.", once: 2900 },
};

async function findOrCreateProduct(sku: string, name: string, description: string): Promise<Stripe.Product> {
  try {
    const found = await stripe.products.search({ query: `active:'true' AND metadata['ozvor_sku']:'${sku}'`, limit: 1 });
    if (found.data[0]) return found.data[0];
  } catch { /* search may be unavailable on brand-new accounts — fall through to create */ }
  return stripe.products.create({ name, description, metadata: { ozvor_sku: sku } });
}

async function findOrCreatePrice(lookupKey: string, params: Stripe.PriceCreateParams): Promise<Stripe.Price> {
  const found = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  if (found.data[0]) return found.data[0];
  return stripe.prices.create({ ...params, lookup_key: lookupKey });
}

async function main(): Promise<void> {
  console.log(`\n→ Bootstrapping Ozvor catalog in Stripe [${mode} mode]…\n`);

  const growth = await findOrCreateProduct("growth", CATALOG.growth.name, CATALOG.growth.desc);
  const agency = await findOrCreateProduct("agency", CATALOG.agency.name, CATALOG.agency.desc);
  const kit = await findOrCreateProduct("kit", CATALOG.kit.name, CATALOG.kit.desc);

  const growthMo = await findOrCreatePrice("growth_monthly_usd", { product: growth.id, currency: "usd", unit_amount: CATALOG.growth.monthly, recurring: { interval: "month" } });
  const growthYr = await findOrCreatePrice("growth_annual_usd", { product: growth.id, currency: "usd", unit_amount: CATALOG.growth.annual, recurring: { interval: "year" } });
  // Lookup keys include the price point so re-running never reuses an old price.
  // Old keys (agency_monthly_usd / agency_annual_usd) pointed to the $149/$1,788
  // prices; new keys are versioned to force creation of the $249/$2,988 prices.
  const agencyMo = await findOrCreatePrice("agency_monthly_249_usd", { product: agency.id, currency: "usd", unit_amount: CATALOG.agency.monthly, recurring: { interval: "month" } });
  const agencyYr = await findOrCreatePrice("agency_annual_2988_usd", { product: agency.id, currency: "usd", unit_amount: CATALOG.agency.annual, recurring: { interval: "year" } });
  const kitOnce = await findOrCreatePrice("kit_onetime_usd", { product: kit.id, currency: "usd", unit_amount: CATALOG.kit.once });

  // Founder coupon: 30% off, forever (locked for life), restricted to the plans.
  let coupon: Stripe.Coupon;
  try {
    coupon = await stripe.coupons.retrieve("FOUNDER30");
  } catch {
    coupon = await stripe.coupons.create({
      id: "FOUNDER30",
      name: "Founder 30% (annual only)",
      percent_off: 30,
      duration: "forever",
      applies_to: { products: [growth.id, agency.id] },
    });
  }

  console.log("✓ Products + prices + coupon ready.\n");
  console.log("── Paste these into your env (Railway api service / .env.local) ──\n");
  console.log(`STRIPE_PRICE_ID_GROWTH=${growthMo.id}`);
  console.log(`STRIPE_PRICE_ID_GROWTH_ANNUAL=${growthYr.id}`);
  console.log(`STRIPE_PRICE_ID_AGENCY=${agencyMo.id}`);
  console.log(`STRIPE_PRICE_ID_AGENCY_ANNUAL=${agencyYr.id}`);
  console.log(`STRIPE_PRICE_ID_KIT=${kitOnce.id}`);
  console.log(`STRIPE_FOUNDER_COUPON_ID=${coupon.id}`);
  console.log(`\n# Still needed (from the Stripe dashboard):`);
  console.log(`#   STRIPE_SECRET_KEY      = the key you just used (${mode.toLowerCase()})`);
  console.log(`#   STRIPE_WEBHOOK_SECRET  = Developers → Webhooks → add endpoint`);
  console.log(`#       URL:    https://<your-api-domain>/api/billing/webhook`);
  console.log(`#       Events: checkout.session.completed, customer.subscription.updated,`);
  console.log(`#               customer.subscription.deleted, invoice.payment_failed\n`);
}

void main().catch((err) => {
  console.error("✗ Bootstrap failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
