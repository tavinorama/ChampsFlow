/**
 * prospect-signal.ts — LEVA 2 (11/09): "lista com sinal".
 *
 * O filtro de CÓDIGO que decide quem merece um toque frio. Puro, testável,
 * sem I/O: o worker passa o HTML que JÁ buscou na verificação e recebe um
 * veredicto com motivo. Nenhuma decisão aqui é palpite de LLM.
 *
 * Regra do founder (11/09) — só entra na leva quem tem, ao mesmo tempo:
 *   (1) site que respondeu 200        — provado pelo worker, antes daqui;
 *   (2) PRESENÇA: Google Business Profile OU JSON-LD LocalBusiness;
 *   (3) SINAL DE MARKETING: conteúdo datado nos últimos 12 meses OU review
 *       recente OU pixel de anúncio.
 * E ninguém entra se cair numa exclusão da leva 1: hotelaria e clínicas de
 * rede foram a origem dos STOPs (12 STOPs em 24 respostas).
 *
 * O porquê do filtro: a leva 1 mandou e-mail para qualquer negócio com site.
 * Quem não faz marketing não compra visibilidade em IA — responde STOP. O
 * sinal de marketing é a prova barata de que o orçamento existe.
 */

import { jsonLdTypes, stripHtmlToText } from "./prospecting";

/** Janela do "sinal de marketing recente" — 12 meses (regra 11/09). */
export const MARKETING_SIGNAL_MAX_AGE_DAYS = 365;

/** @type de JSON-LD que conta como presença local verificável. */
const LOCAL_BUSINESS_TYPES =
  /^(LocalBusiness|ProfessionalService|HomeAndConstructionBusiness|Plumber|Electrician|RoofingContractor|HVACBusiness|GeneralContractor|Locksmith|MovingCompany|AutoRepair|AutoRepairShop|Dentist|LegalService|Attorney|AccountingService|RealEstateAgent|Store|HealthAndBeautyBusiness|SelfStorage|ChildCare|PestControl|CleaningService|Landscaper|Electrician|Painter|Notary)$/;

/** JSON-LD LocalBusiness (ou subtipo) declarado na homepage. */
export function hasLocalBusinessJsonLd(html: string | null): boolean {
  if (!html) return false;
  return jsonLdTypes(html).some((t) => LOCAL_BUSINESS_TYPES.test(t.trim()));
}

/**
 * Sinal de Google Business Profile no HTML: link/embed para o perfil ou para
 * o mapa do negócio. Não afirma que o perfil está otimizado — afirma que ele
 * EXISTE e que o negócio o expõe, que é o que a leva precisa saber.
 */
export function hasGoogleBusinessProfile(html: string | null): boolean {
  if (!html) return false;
  return (
    /google\.[a-z.]+\/maps\/place/i.test(html) ||
    /maps\.google\.[a-z.]+\/(?:maps)?\?[^"'<>]*(?:cid=|q=)/i.test(html) ||
    /\bg\.page\//i.test(html) ||
    /goo\.gl\/maps/i.test(html) ||
    /maps\/embed\?pb=/i.test(html) ||
    /\bplace_id["'\s:=]+["']?ChI/i.test(html) ||
    /search\.google\.[a-z.]+\/local\/(?:writereview|reviews)/i.test(html)
  );
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/**
 * A data mais recente que a página DECLARA para conteúdo próprio — JSON-LD
 * datePublished/dateModified, <meta article:published_time>, <time datetime>
 * e datas visíveis ("September 3, 2026" / "2026-09-03"). Datas mais de 1 dia
 * no futuro são ignoradas (são agendas de evento, não publicação), e datas
 * de mais de 20 anos atrás também (são rodapés de copyright antigos).
 */
export function latestContentDate(html: string | null, now: Date): Date | null {
  if (!html) return null;
  const horizon = now.getTime() + 24 * 3600_000;
  const floor = now.getTime() - 20 * 365 * 24 * 3600_000;
  let best: number | null = null;
  const consider = (ms: number): void => {
    if (!Number.isFinite(ms) || ms > horizon || ms < floor) return;
    if (best === null || ms > best) best = ms;
  };
  for (const m of html.matchAll(/"(?:datePublished|dateModified|uploadDate)"\s*:\s*"([^"]{8,40})"/g)) {
    consider(Date.parse(m[1]!));
  }
  for (const m of html.matchAll(
    /<meta[^>]+(?:article:published_time|article:modified_time|datePublished)[^>]+content\s*=\s*["']([^"']{8,40})["']/gi
  )) {
    consider(Date.parse(m[1]!));
  }
  for (const m of html.matchAll(/<time[^>]+datetime\s*=\s*["']([^"']{8,40})["']/gi)) {
    consider(Date.parse(m[1]!));
  }
  const text = stripHtmlToText(html);
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    consider(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }
  for (const m of text.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),\s*(\d{4})\b/g)) {
    const mo = MONTHS[m[1]!.slice(0, 3).toLowerCase()];
    if (mo === undefined) continue;
    consider(Date.UTC(Number(m[3]), mo, Number(m[2])));
  }
  return best === null ? null : new Date(best);
}

/** Review com data dentro da janela — "alguém falou desse negócio há pouco". */
export function hasRecentReviewSignal(html: string | null, now: Date): boolean {
  if (!html) return false;
  const cutoff = now.getTime() - MARKETING_SIGNAL_MAX_AGE_DAYS * 24 * 3600_000;
  const horizon = now.getTime() + 24 * 3600_000;
  for (const block of html.matchAll(
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    const body = block[1] ?? "";
    if (!/"@type"\s*:\s*"(?:Review|UserReview)"/.test(body)) continue;
    for (const d of body.matchAll(/"datePublished"\s*:\s*"([^"]{8,40})"/g)) {
      const ms = Date.parse(d[1]!);
      if (Number.isFinite(ms) && ms >= cutoff && ms <= horizon) return true;
    }
  }
  return false;
}

/** Pixels de anúncio no HTML — prova de que o negócio JÁ paga mídia. */
export function adPixelsIn(html: string | null): string[] {
  if (!html) return [];
  const found: string[] = [];
  const add = (n: string): void => {
    if (!found.includes(n)) found.push(n);
  };
  if (/connect\.facebook\.net\/[^"']*fbevents/i.test(html) || /\bfbq\s*\(\s*['"]init/i.test(html)) add("meta-pixel");
  if (/googletagmanager\.com\/gtag\/js\?id=AW-/i.test(html) || /gtag\s*\(\s*['"]config['"]\s*,\s*['"]AW-/i.test(html)) {
    add("google-ads");
  }
  if (/\banalytics\.tiktok\.com\b/i.test(html) || /\bttq\.load\s*\(/i.test(html)) add("tiktok-pixel");
  if (/_linkedin_partner_id/i.test(html)) add("linkedin-insight");
  if (/\bpintrk\s*\(/i.test(html)) add("pinterest-tag");
  if (/sc-static\.net\/scevent/i.test(html) || /\bsnaptr\s*\(/i.test(html)) add("snap-pixel");
  return found;
}

// --- Exclusões da leva 2 ----------------------------------------------------
// Hotelaria = hospedagem + food service. Clínica DE REDE = negócio clínico COM
// marcador de múltiplas unidades — a clínica de bairro continua elegível.

const HOSPITALITY_WORDS =
  /\b(hotel|motel|hostel|resort|lodge|lodging|inn|bed\s*(?:and|&)\s*breakfast|b&b|vacation\s+rental|restaurant|ristorante|cafe|café|bistro|diner|steakhouse|pizzeria|brewery|brewpub|taproom|winery|bar\s*(?:and|&)\s*grill|catering|banquet)\b/i;
const HOSPITALITY_JSONLD =
  /^(Hotel|Motel|Resort|Hostel|LodgingBusiness|BedAndBreakfast|Campground|Restaurant|FoodEstablishment|CafeOrCoffeeShop|BarOrPub|Brewery|Winery|NightClub|FastFoodRestaurant)$/;
const CLINIC_WORDS =
  /\b(clinic|clinica|clínica|dental|dentist|orthodont|medical\s+(?:center|centre|group)|urgent\s+care|health\s+(?:center|centre)|physician|chiropract|dermatolog|veterinar|animal\s+hospital|optometr|eye\s+care|physical\s+therapy|pediatric|family\s+practice)\b/i;
const CHAIN_MARKERS =
  /\b(our\s+locations|all\s+locations|find\s+a\s+(?:location|clinic|office)|locations\s+near\s+you|\d{2,}\+?\s+locations|franchis|nationwide|multi-?location|choose\s+your\s+(?:location|clinic))\b/i;

/** Motivo da exclusão de vertical, ou null quando o negócio é elegível. */
export function excludedVertical(input: { name: string; category?: string | null; html?: string | null }): string | null {
  const label = `${input.name} ${input.category ?? ""}`;
  const html = input.html ?? "";
  const text = stripHtmlToText(html).slice(0, 20_000);
  const types = jsonLdTypes(html);
  if (HOSPITALITY_WORDS.test(label) || types.some((t) => HOSPITALITY_JSONLD.test(t.trim()))) {
    return "excluido da leva 2: hotelaria/food service (origem dos STOPs da leva 1)";
  }
  const isClinic = CLINIC_WORDS.test(label) || CLINIC_WORDS.test(text.slice(0, 4_000));
  if (isClinic && CHAIN_MARKERS.test(text)) {
    return "excluido da leva 2: clinica de rede/multi-unidade (origem dos STOPs da leva 1)";
  }
  return null;
}

export interface SignalFacts {
  localBusinessJsonLd: boolean;
  googleBusinessProfile: boolean;
  /** Dias desde o conteúdo datado mais recente; null quando não há data. */
  contentAgeDays: number | null;
  recentReviews: boolean;
  adPixels: string[];
}

export interface SignalVerdict {
  pass: boolean;
  facts: SignalFacts;
  /** Os sinais que o negócio PASSOU — vão para o dossiê do lead. */
  reasons: string[];
  /** Motivo único da reprovação, pronto para a linha de DESCARTADOS. */
  dropReason: string | null;
}

/**
 * O portão de sinal da leva 2. `html` é a homepage já buscada pelo worker
 * (status 200 garantido lá) — nada aqui faz I/O.
 */
export function signalGate(input: {
  name: string;
  category?: string | null;
  html: string | null;
  now: Date;
}): SignalVerdict {
  const html = input.html;
  const contentDate = latestContentDate(html, input.now);
  const contentAgeDays =
    contentDate === null ? null : Math.floor((input.now.getTime() - contentDate.getTime()) / (24 * 3600_000));
  const facts: SignalFacts = {
    localBusinessJsonLd: hasLocalBusinessJsonLd(html),
    googleBusinessProfile: hasGoogleBusinessProfile(html),
    contentAgeDays,
    recentReviews: hasRecentReviewSignal(html, input.now),
    adPixels: adPixelsIn(html),
  };

  const excluded = excludedVertical({
    name: input.name,
    ...(input.category != null ? { category: input.category } : {}),
    html,
  });
  if (excluded) return { pass: false, facts, reasons: [], dropReason: excluded };

  const presence: string[] = [];
  if (facts.googleBusinessProfile) presence.push("Google Business Profile exposto no site");
  if (facts.localBusinessJsonLd) presence.push("JSON-LD LocalBusiness na homepage");
  if (presence.length === 0) {
    return {
      pass: false,
      facts,
      reasons: [],
      dropReason: "sem sinal de presenca local (nem Google Business Profile nem JSON-LD LocalBusiness)",
    };
  }

  const marketing: string[] = [];
  if (contentAgeDays !== null && contentAgeDays <= MARKETING_SIGNAL_MAX_AGE_DAYS) {
    marketing.push(`conteudo datado ha ${contentAgeDays} dia(s) (site vivo nos ultimos 12 meses)`);
  }
  if (facts.recentReviews) marketing.push("review com data dentro dos ultimos 12 meses");
  if (facts.adPixels.length > 0) marketing.push(`pixel de anuncio: ${facts.adPixels.join(", ")}`);
  if (marketing.length === 0) {
    return {
      pass: false,
      facts,
      reasons: [],
      dropReason:
        contentAgeDays === null
          ? "sem sinal de marketing (nenhuma data de conteudo, nenhum review recente, nenhum pixel de anuncio)"
          : `sem sinal de marketing (conteudo mais novo tem ${contentAgeDays} dias; sem review recente; sem pixel)`,
    };
  }

  return { pass: true, facts, reasons: [...presence, ...marketing], dropReason: null };
}

// ---------------------------------------------------------------------------
// A PERGUNTA CERTA — nicho + cidade do lead, extraídos do próprio site.
// O probe com prova (packages/llm/src/cold-proof-probe.ts) precisa dos dois
// para montar "who do you recommend for <serviço> in <cidade>?". Sem os dois,
// não há pergunta certa, e sem pergunta certa o lead NÃO entra na leva —
// nunca uma pergunta genérica só para preencher.
// ---------------------------------------------------------------------------

/** JSON-LD @type → o serviço em palavras de gente (o que o cliente digitaria). */
const TYPE_TO_SERVICE: Record<string, string> = {
  Plumber: "a plumber",
  Electrician: "an electrician",
  RoofingContractor: "a roofing contractor",
  HVACBusiness: "an HVAC company",
  GeneralContractor: "a general contractor",
  Locksmith: "a locksmith",
  MovingCompany: "a moving company",
  AutoRepair: "an auto repair shop",
  AutoRepairShop: "an auto repair shop",
  Dentist: "a dentist",
  LegalService: "a lawyer",
  Attorney: "a lawyer",
  AccountingService: "an accountant",
  RealEstateAgent: "a real estate agent",
  PestControl: "pest control",
  CleaningService: "a cleaning service",
  Landscaper: "a landscaper",
  SelfStorage: "self storage",
  ChildCare: "child care",
  Painter: "a painter",
  Notary: "a notary",
};

/** Nichos reconhecíveis no texto do site, quando não há JSON-LD tipado. */
const SERVICE_KEYWORDS: Array<[RegExp, string]> = [
  [/\broofing|roof repair|roofer\b/i, "a roofing contractor"],
  [/\bplumbing|plumber\b/i, "a plumber"],
  [/\bhvac|heating and (?:air|cooling)|air conditioning\b/i, "an HVAC company"],
  [/\belectrical (?:services|contractor)|electrician\b/i, "an electrician"],
  [/\blandscap(?:ing|er)|lawn care\b/i, "a landscaper"],
  [/\bpest control|exterminator\b/i, "pest control"],
  [/\bhouse cleaning|janitorial|maid service\b/i, "a cleaning service"],
  [/\bmoving compan|movers\b/i, "a moving company"],
  [/\bauto repair|mechanic shop|collision repair\b/i, "an auto repair shop"],
  [/\bdentist|dental (?:care|practice|office)\b/i, "a dentist"],
  [/\bchiropract/i, "a chiropractor"],
  [/\bveterinar/i, "a veterinarian"],
  [/\blaw firm|attorney|lawyer\b/i, "a lawyer"],
  [/\bbookkeep|accounting|CPA\b/i, "an accountant"],
  [/\breal estate agen|realtor\b/i, "a real estate agent"],
  [/\bgarage door\b/i, "a garage door company"],
  [/\bwindow (?:replacement|installation)\b/i, "a window company"],
  [/\bfencing|fence (?:company|installation)\b/i, "a fence company"],
  [/\bpressure washing|power washing\b/i, "a pressure washing company"],
  [/\bflooring\b/i, "a flooring company"],
  [/\bremodel(?:ing)?|renovation\b/i, "a remodeling contractor"],
  [/\btree (?:service|removal)\b/i, "a tree service"],
  [/\bmed spa|medspa\b/i, "a med spa"],
  [/\bphysical therapy\b/i, "a physical therapist"],
  [/\binsurance agenc/i, "an insurance agent"],
  [/\bIT support|managed (?:IT|services provider)|MSP\b/i, "an IT support company"],
];

const US_STATES =
  /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/;

export interface ServiceAndCity {
  service: string | null;
  city: string | null;
  /** De onde cada um saiu — vai para o dossiê (nada aqui é palpite). */
  source: string;
}

/**
 * Nicho + cidade do lead, do próprio site (e da categoria do Apify quando há).
 * Ambos null-áveis de propósito: a honestidade é devolver null e deixar o
 * chamador tirar o lead da leva.
 */
export function inferServiceAndCity(input: {
  name: string;
  category?: string | null;
  html: string | null;
}): ServiceAndCity {
  const html = input.html ?? "";
  const text = stripHtmlToText(html).slice(0, 30_000);
  const sources: string[] = [];

  // --- cidade ---
  let city: string | null = null;
  const locality = /"addressLocality"\s*:\s*"([^"]{2,60})"/.exec(html)?.[1]?.trim();
  const regionRaw = /"addressRegion"\s*:\s*"([A-Za-z ]{2,30})"/.exec(html)?.[1]?.trim();
  if (locality) {
    const region = regionRaw && regionRaw.length === 2 ? regionRaw.toUpperCase() : null;
    city = region ? `${locality}, ${region}` : locality;
    sources.push("cidade: JSON-LD PostalAddress");
  }
  if (!city) {
    const m = /\b([A-Z][a-zA-Z.'-]+(?:\s+[A-Z][a-zA-Z.'-]+){0,2}),\s*([A-Z]{2})\b/.exec(text);
    if (m && US_STATES.test(m[2]!)) {
      city = `${m[1]}, ${m[2]}`;
      sources.push("cidade: endereco visivel no site");
    }
  }

  // --- serviço ---
  let service: string | null = null;
  const types = jsonLdTypes(html).map((t) => t.trim());
  for (const t of types) {
    if (TYPE_TO_SERVICE[t]) {
      service = TYPE_TO_SERVICE[t]!;
      sources.push(`nicho: JSON-LD @type ${t}`);
      break;
    }
  }
  if (!service && input.category) {
    for (const [re, label] of SERVICE_KEYWORDS) {
      if (re.test(input.category)) {
        service = label;
        sources.push("nicho: categoria da fonte");
        break;
      }
    }
  }
  if (!service) {
    const haystack = `${input.name} ${/<title[^>]*>([^<]{0,200})<\/title>/i.exec(html)?.[1] ?? ""} ${text.slice(0, 4_000)}`;
    for (const [re, label] of SERVICE_KEYWORDS) {
      if (re.test(haystack)) {
        service = label;
        sources.push("nicho: nome/titulo/texto do site");
        break;
      }
    }
  }

  return { service, city, source: sources.join(" · ") || "nada identificado" };
}
