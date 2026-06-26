/**
 * _content.ts — structured content for data-driven GEO blog articles.
 *
 * Each post is authored as structured blocks (not bespoke JSX) so every article
 * renders with one consistent, on-brand template (see [slug]/page.tsx): cover,
 * key-takeaways, auto table-of-contents (from h2 blocks), prose, and a full
 * "Sources" list. New posts = new entries here; no new page files.
 *
 * Inline formatting inside `text` supports **bold** and [label](url) links only.
 * All statistics cite named, dated, public sources (mirrors the deliverables'
 * canonical research list).
 */

export type Block =
  | { t: "p"; text: string }
  | { t: "h2"; id: string; text: string }
  | { t: "h3"; text: string }
  | { t: "ul"; items: string[] }
  | { t: "ol"; items: string[] }
  | { t: "quote"; text: string; cite?: string }
  | { t: "cite"; text: string };

export interface BlogContent {
  slug: string;
  title: string;
  dek: string; // sub-headline under the title
  category: string;
  datePublished: string; // ISO YYYY-MM-DD
  dateDisplay: string;
  readTime: string;
  keywords: string[];
  takeaways: string[];
  body: Block[];
  sources: string[];
}

// Shared source strings (canonical, reused across posts) ----------------------
const S = {
  geoPaper:
    'Aggarwal et al., "GEO: Generative Engine Optimization," Princeton / Georgia Tech / Allen Institute for AI / IIT Delhi, KDD 2024 — arxiv.org/abs/2311.09735',
  chatgptWau:
    "OpenAI / ChatGPT — 900M weekly active users (Feb 2026), via TechCrunch — techcrunch.com/2026/02/27/chatgpt-reaches-900m-weekly-active-users/",
  aiOverviews:
    "Google AI Overviews — 2B monthly users, via TechCrunch — techcrunch.com/2025/07/23/googles-ai-overviews-have-2b-monthly-users-ai-mode-100m-in-the-us-and-india/",
  gemini:
    "Google Gemini app — 750M monthly active users, via TechCrunch — techcrunch.com/2026/02/04/googles-gemini-app-has-surpassed-750m-monthly-active-users/",
  pew:
    "Pew Research Center — Google users are less likely to click links when an AI summary appears (Jul 2025) — pewresearch.org/short-reads/2025/07/22/",
  sparktoro:
    "SparkToro / Rand Fishkin — in 2026, fewer than one-third of Google searches still send a click — sparktoro.com/blog/",
  bain:
    "Bain & Company — your next customer will find you using AI — bain.com/insights/your-next-customer-will-find-you-using-ai-now-what/",
  g2:
    'G2 "Answer Economy," via Demand Gen Report — half of B2B software buyers now start research with AI chatbots',
  zyppy:
    "Cyrus Shepard / Zyppy — AI citation ranking factors (synthesis of 54 experiments) — signal.zyppy.com/p/ai-citation-ranking-factors",
  siana:
    "Siana Marketing — where ChatGPT gets its information (2026 report) — sianamarketing.com",
  ahrefsFresh:
    "Ahrefs — fresh content and AI citations — ahrefs.com/blog/fresh-content/",
  ahrefsCited:
    "Ahrefs — ChatGPT's most-cited pages (67% off-limits to crawlers) — ahrefs.com/blog/chatgpts-most-cited-pages/",
  otterly:
    "Otterly.ai — schema markup's real impact on AI search — otterly.ai/blog/schema-markup-real-impact-ai-search/",
  profound:
    "Profound — the data on Reddit & AI search (4B+ citations analysed) — tryprofound.com/blog/the-data-on-reddit-and-ai-search",
  peec:
    "Peec AI — AI search engines cite Reddit, YouTube and LinkedIn most, via Search Engine Land — searchengineland.com",
  semrushLinkedin:
    "Semrush — LinkedIn AI Visibility Study (89K cited URLs across 325K prompts) — semrush.com/blog/linkedin-ai-visibility-study/",
  semrushDomains:
    "Semrush — the most-cited domains in AI: a 3-month study — semrush.com/blog/most-cited-domains-ai/",
  seRankingReviews:
    "SE Ranking — review platforms in AI Overviews — seranking.com/blog/review-platforms-in-ai-overviews/",
  soci:
    "SOCi — 2026 Local Visibility Index, via Search Engine Land — searchengineland.com/ai-local-visibility-report-2026-468085",
  brightlocal:
    "BrightLocal — Local Consumer Review Survey 2026 (AI trust) — brightlocal.com/research/lcrs-ai-trust/",
  hvac:
    "5WPR HVAC & Plumbing AI Visibility Index, via Plumbing & Mechanical — 87% of HVAC/plumbing contractors are invisible when homeowners ask AI",
  growthpro:
    "GrowthPro AI — local AI search statistics 2026 — growthproai.com",
  clarity:
    "Microsoft Clarity — AI traffic converts at ~3x the rate of other channels (study) — clarity.microsoft.com/blog/",
  amsive:
    "Amsive — does LLM traffic convert better than organic? A 54-site study (the contested counter-evidence) — amsive.com/insights/seo/",
  seer:
    "Seer Interactive — AI Overview impact on Google CTR (2026 update) — seerinteractive.com/insights/",
  hubspot:
    "HubSpot — Generative Engine Optimization for small business — blog.hubspot.com/marketing/generative-engine-optimization-small-business",
  repeatRuns:
    "Search Engine Land — repeated ChatGPT runs & brand visibility (~5 brands surface per category) — searchengineland.com/repeated-chatgpt-runs-brand-visibility-468552",
  forrester:
    "Forrester — 2026 Buyer Insights: zero-click is only half the AI story — forrester.com/blogs/",
};

// ---------------------------------------------------------------------------
// Posts
// ---------------------------------------------------------------------------

export const BLOG_CONTENT: BlogContent[] = [
  // 1 ───────────────────────────────────────────────────────────────────────
  {
    slug: "what-is-generative-engine-optimization",
    title: "What Is Generative Engine Optimization (GEO)? A Plain-English 2026 Field Guide",
    dek: "SEO got you ranked. GEO gets you named. Here is what changed, why it matters for small businesses, and what actually moves the needle — without the hype.",
    category: "GEO 101",
    datePublished: "2026-06-26",
    dateDisplay: "26 June 2026",
    readTime: "9 min read",
    keywords: ["generative engine optimization", "GEO", "AI search", "what is GEO", "AI citations"],
    takeaways: [
      "GEO is the practice of structuring your content so AI answer engines (ChatGPT, Claude, Perplexity, Gemini, Google AI Overviews) cite *you* when they answer a question.",
      "It is a measurable discipline, not a buzzword — the term comes from a peer-reviewed paper presented at KDD 2024.",
      "The two best-documented levers are adding specific statistics and adding cited quotes — each lifted citation visibility by ~40% in the original study.",
      "No tool can guarantee a citation (AI is non-deterministic), but you can raise the probability and track it over time.",
    ],
    body: [
      { t: "p", text: "For twenty years, the goal of digital marketing was simple to state: rank on the first page of Google. Get the blue link, get the click. That goal hasn't disappeared — but a second, parallel game has started, and most small businesses haven't noticed they're already playing it." },
      { t: "p", text: "When someone opens ChatGPT and types *\"best independent bookkeeper for freelancers in Lisbon,\"* they don't get ten blue links. They get a paragraph — and that paragraph names two or three businesses. **Generative Engine Optimization (GEO)** is the work of making sure your name is one of them." },

      { t: "h2", id: "definition", text: "So what is GEO, exactly?" },
      { t: "p", text: "GEO is the practice of structuring your content and online presence so that large language models are more likely to cite you when they generate an answer to a relevant question. If SEO is about being *ranked*, GEO is about being *named and quoted*." },
      { t: "p", text: "The term isn't marketing invention. It was formally defined in a research paper by academics at Princeton, Georgia Tech, the Allen Institute for AI, and IIT Delhi, presented at **KDD 2024** — one of the most competitive conferences in data science. The authors built a benchmark of 10,000 real queries and tested nine content techniques to measure which ones actually increase citation visibility inside AI answers." },
      { t: "cite", text: S.geoPaper },

      { t: "h2", id: "why-now", text: "Why this matters now, not later" },
      { t: "p", text: "The behaviour shift is no longer theoretical. ChatGPT reached roughly **900 million weekly active users** by early 2026. Google's **AI Overviews** — the AI summary box above the classic results — reach around **2 billion users a month**, and the Gemini app has passed **750 million monthly users**. A meaningful and growing share of buying research now begins inside an AI answer, not a search results page." },
      { t: "cite", text: `${S.chatgptWau}; ${S.aiOverviews}; ${S.gemini}` },
      { t: "p", text: "Crucially, that research increasingly *ends* there too. Pew Research found Google users are markedly less likely to click any link when an AI summary is shown, and SparkToro's 2026 analysis estimates fewer than a third of Google searches still send a click to an external site. If the AI answers the question and names a competitor, the click you used to compete for never happens." },
      { t: "cite", text: `${S.pew}; ${S.sparktoro}` },

      { t: "h2", id: "geo-vs-seo", text: "GEO vs SEO: same planet, different game" },
      { t: "p", text: "GEO doesn't replace SEO — strong fundamentals (a crawlable site, clear pages, real authority) feed both. But the optimisation target is different. SEO optimises for a ranking algorithm that returns links. GEO optimises for a language model that returns a synthesised answer with a handful of named sources. The practical consequences:" },
      { t: "ul", items: [
        "**Format shifts from keyword pages to answers.** Models retrieve and quote content that directly answers a specific question, not pages stuffed with a target phrase.",
        "**Specificity beats breadth.** A post on \"three expenses freelancers in Portugal miss at tax time\" gets cited; \"the importance of good accounting\" gets cited for nothing.",
        "**Evidence is a ranking factor.** Numbers and attributed quotes measurably raised citation rates in the GEO study.",
        "**Off-site presence matters more.** AI engines lean heavily on third-party sources (Reddit, Wikipedia, LinkedIn, review sites), not just your own domain.",
      ] },

      { t: "h2", id: "what-works", text: "What actually moves the needle" },
      { t: "p", text: "The GEO paper didn't just name the problem; it ranked the fixes. The two strongest single techniques were **adding statistics** (specific numerical data) and **adding cited quotes** (authoritative, attributed statements) — each improved a content source's citation visibility by roughly **40%** against the baseline. Independent practitioner research since then points the same direction: clarity, direct answers, freshness, credible sourcing, and being mentioned across trusted third-party sites." },
      { t: "cite", text: `${S.geoPaper}; ${S.zyppy}` },
      { t: "p", text: "Put plainly, the citation-worthy page tends to be: specific, answer-shaped, statistic-rich, credibly sourced, easy for a crawler to read, and kept fresh." },

      { t: "h2", id: "honest", text: "The honest caveats" },
      { t: "p", text: "Anyone promising *guaranteed* AI citations is selling something. Models are non-deterministic — ask the same question twice and the named brands can change. Search Engine Land's repeated-run testing found only about five brands tend to surface per category across runs, and the set shifts. What you *can* do is raise your probability of being in that set, and measure whether it's working over time. That measurement — auditing how often and how favourably AI engines name you versus competitors — is the foundation everything else builds on." },
      { t: "cite", text: S.repeatRuns },

      { t: "h2", id: "start", text: "Where to start" },
      { t: "p", text: "You can't improve what you can't see. The first move in GEO is a baseline: ask the major engines the questions your customers ask, and record whether you're named, where, and next to whom. From there, the work is unglamorous but learnable — make your best pages answer specific questions, back claims with numbers, earn mentions on the sources AI trusts, and keep publishing. The businesses that show up in 2027's answers are the ones building that base now, while the field is still open." },
    ],
    sources: [S.geoPaper, S.chatgptWau, S.aiOverviews, S.gemini, S.pew, S.sparktoro, S.zyppy, S.repeatRuns, S.hubspot],
  },

  // 2 ───────────────────────────────────────────────────────────────────────
  {
    slug: "ai-search-replacing-google-local-discovery",
    title: "AI Search Is Quietly Replacing Google for Local Discovery — Here's the Data",
    dek: "\"Find me a good plumber near here\" used to mean a map and ten links. Now it means three names. If you run a local business, that change is already costing you leads you'll never see.",
    category: "Local & SMB",
    datePublished: "2026-06-26",
    dateDisplay: "26 June 2026",
    readTime: "8 min read",
    keywords: ["AI local search", "local SEO", "AI Overviews local", "small business AI visibility", "GEO local"],
    takeaways: [
      "Buyers increasingly ask an AI assistant before they open Maps or a search page — and the AI replies with a short list of names, not a directory.",
      "Most local businesses are completely absent from those answers: one industry index found 87% of HVAC and plumbing contractors were invisible when homeowners asked AI.",
      "Reviews and third-party mentions — not just your website — are what AI engines lean on for local recommendations.",
      "The fix is concrete: get findable, get reviewed, and get mentioned where AI looks.",
    ],
    body: [
      { t: "p", text: "Picture the moment a pipe bursts. Five years ago, the homeowner grabbed their phone, searched *\"emergency plumber near me,\"* and scanned a map pack and a page of links. Today, a growing share of them open ChatGPT or Gemini and type *\"my kitchen pipe is leaking, who should I call in [town]?\"* — and the assistant answers with two or three businesses, sometimes with a sentence on why." },
      { t: "p", text: "That's not a small UX change. It collapses a page of options into a tiny shortlist. If you're on it, you win disproportionately. If you're not, you're not even in the running — and you'll never see the lead you lost." },

      { t: "h2", id: "shift", text: "The shift, in numbers" },
      { t: "p", text: "Adoption is the backdrop. ChatGPT sits near **900M weekly users**; Google's **AI Overviews** reach **~2B monthly**; the **Gemini** app has crossed **750M monthly**. As these surfaces answer more questions directly, fewer searches produce a click — Pew and SparkToro both document the decline of the click. For local discovery specifically, the assistant increasingly *is* the directory." },
      { t: "cite", text: `${S.chatgptWau}; ${S.aiOverviews}; ${S.gemini}; ${S.pew}` },

      { t: "h2", id: "invisible", text: "Most local businesses are invisible" },
      { t: "p", text: "Here's the uncomfortable part. When researchers actually asked AI engines for local recommendations, most local businesses simply didn't appear. A 2026 visibility index of the HVAC and plumbing trades found that **87% of contractors were invisible** when homeowners asked AI for help — not ranked low, *absent*. SOCi's 2026 Local Visibility work and others report the same pattern across local categories: a handful of names recur, and everyone else is missing." },
      { t: "cite", text: `${S.hvac}; ${S.soci}; ${S.growthpro}` },
      { t: "p", text: "The reason most owners miss this is that nothing on their own dashboard changes. Your Google Business Profile still gets views; your site still gets its trickle of traffic. The leads that evaporate inside an AI answer leave no footprint in your analytics. The damage is invisible because the channel is invisible." },

      { t: "h2", id: "what-ai-uses", text: "What AI actually leans on for local answers" },
      { t: "p", text: "For local recommendations, AI engines lean heavily on *third-party* signals — not just your website. Reviews are central: BrightLocal's 2026 research shows consumers increasingly trust AI summaries of local businesses, and those summaries are built from review platforms, directories, and community sites. SE Ranking found review platforms appear frequently as sources inside AI Overviews for local and product queries." },
      { t: "cite", text: `${S.brightlocal}; ${S.seRankingReviews}` },
      { t: "p", text: "In other words: your star rating, the recency and substance of your reviews, your consistency across directories, and whether real people mention you in places like Reddit are doing the heavy lifting — often more than your homepage copy." },

      { t: "h2", id: "fix", text: "The fix is unglamorous and learnable" },
      { t: "ol", items: [
        "**Get findable.** Make sure your business name, category, location, and services are stated plainly and consistently on your site and every major directory. Vague \"we help you smile\" copy doesn't match a specific query.",
        "**Get reviewed — and keep it fresh.** A steady stream of recent, specific reviews on the platforms AI reads is one of the strongest local signals you control.",
        "**Get mentioned where AI looks.** Helpful answers in local subreddits, Q&A sites, and local press put your name in the sources engines retrieve.",
        "**Measure it.** Ask the engines the questions your customers ask, monthly, and track whether you're named — and next to whom.",
      ] },
      { t: "p", text: "None of this requires a big budget. It requires knowing the game is on, and treating the AI answer as the new shop window — because for a fast-growing slice of your customers, it already is." },
    ],
    sources: [S.chatgptWau, S.aiOverviews, S.gemini, S.pew, S.hvac, S.soci, S.growthpro, S.brightlocal, S.seRankingReviews],
  },

  // 3 ───────────────────────────────────────────────────────────────────────
  {
    slug: "how-ai-engines-choose-which-brands-to-name",
    title: "How ChatGPT, Claude, Perplexity & Gemini Decide Which Brands to Name",
    dek: "AI recommendations feel like magic. They're not. Under the hood there are two mechanisms — training and retrieval — and understanding them tells you exactly where to spend your effort.",
    category: "How AI Works",
    datePublished: "2026-06-26",
    dateDisplay: "26 June 2026",
    readTime: "9 min read",
    keywords: ["how AI chooses sources", "AI citations", "retrieval augmented generation", "ChatGPT sources", "Perplexity citations"],
    takeaways: [
      "AI answers are built from two pools: what a model learned in training, and what it retrieves live from the web at answer time.",
      "Retrieval is the fast lane for small businesses — content can be cited within days, not after a year-long retraining cycle.",
      "Retrieval matches on meaning: if your content doesn't say the specific words a buyer would use, it won't be pulled in.",
      "Crawlability is a hard gate — a large share of the pages AI wants to cite are blocked or unreadable, and that's a fixable own-goal.",
    ],
    body: [
      { t: "p", text: "When an AI assistant names three businesses in answer to a question, it can feel arbitrary — or worse, rigged. It's neither. There are two distinct mechanisms deciding who gets named, and once you can see them, the whole discipline of GEO stops feeling mysterious and starts feeling like a checklist." },

      { t: "h2", id: "training", text: "Mechanism 1: training data (the slow pool)" },
      { t: "p", text: "When a model is trained, it ingests an enormous slice of the public internet. Sources that appear often, and are cited often, get baked into the model's parameters. This is why Wikipedia, Reddit, and major publishers echo through so many AI answers — they were represented at scale during training." },
      { t: "p", text: "For a small business, this pool is real but slow. Anything you publish today won't enter a model's training data until its next major training run, which can be a year or more away. You can influence it — by being mentioned, consistently, on sources that get trained on — but you can't rush it." },

      { t: "h2", id: "retrieval", text: "Mechanism 2: live retrieval (the fast pool)" },
      { t: "p", text: "This is where the opportunity lives. Most modern assistants now fetch live web content at answer time — Perplexity was built around it, ChatGPT Search and Gemini do it routinely, and Claude can search the web. The model runs a search, pulls a set of pages, and synthesises an answer that cites them. This is **retrieval-augmented generation**, and it means content you publish this week can be cited *this month*." },
      { t: "p", text: "Where do those retrieved sources come from? Studies of cited domains find a consistent cast: Reddit leads, with community and Q&A sites, Wikipedia, LinkedIn, YouTube, and review platforms close behind — plus the brand's own site when it's clear and crawlable." },
      { t: "cite", text: `${S.profound}; ${S.peec}; ${S.semrushDomains}` },

      { t: "h2", id: "semantic", text: "Retrieval matches meaning — so phrasing matters" },
      { t: "p", text: "Retrieval systems match your content to a query by *semantic relevance*. If a customer asks for an *\"Invisalign consultation in the city centre\"* and your page says exactly that, you're a candidate. If your page says *\"we love helping our patients smile,\"* there's nothing for the query to match, and you're invisible — no matter how lovely the sentiment." },
      { t: "p", text: "This is the single most common own-goal. Owners write warm, generic copy that connects with humans skimming a homepage but gives a retrieval engine nothing concrete to grab. The fix is to write the way customers ask: name the service, the place, the price range, the timeline, the specifics." },

      { t: "h2", id: "crawlability", text: "The hard gate: can the engine even read you?" },
      { t: "p", text: "Before any of this matters, the engine has to be able to fetch and parse your page. Ahrefs' analysis of ChatGPT's most-cited pages found that a striking share of the content models *want* to cite is effectively off-limits — blocked by robots rules, hidden behind scripts, or otherwise unreadable to crawlers. That's a self-inflicted wound: pages that could be cited, aren't, because the door is shut." },
      { t: "cite", text: S.ahrefsCited },
      { t: "p", text: "Two practical checks: make sure your important pages are server-rendered or otherwise readable without running JavaScript, and make sure you're not accidentally blocking the AI crawlers you actually want." },

      { t: "h2", id: "trust", text: "Trust signals tip the balance" },
      { t: "p", text: "Among readable, relevant candidates, engines favour sources that look credible: clear authorship, structured data, corroboration across multiple sites, recency, and real-world reputation signals like reviews. Practitioner research consistently finds freshness and structured markup associated with higher citation rates, and schema markup measurably helps engines understand and surface your content." },
      { t: "cite", text: `${S.ahrefsFresh}; ${S.otterly}; ${S.zyppy}` },

      { t: "h2", id: "takeaway", text: "What this means for your effort" },
      { t: "p", text: "Stack the mechanisms and the to-do list writes itself: be *readable* (crawlable, parseable), be *relevant* (say the specific words buyers use), be *retrievable* across the third-party sources AI trusts (reviews, communities, professional networks), and be *credible* (sourced, structured, fresh). You can't control the model. You can control every one of those inputs — and measure the result." },
    ],
    sources: [S.profound, S.peec, S.semrushDomains, S.ahrefsCited, S.ahrefsFresh, S.otterly, S.zyppy, S.semrushLinkedin],
  },

  // 4 ───────────────────────────────────────────────────────────────────────
  {
    slug: "most-cited-sources-in-ai-search-2026",
    title: "Where AI Gets Its Answers: The Most-Cited Sources in AI Search (2026)",
    dek: "If you want to be quoted by AI, it helps to know where AI actually looks. The answer is surprisingly concentrated — and most of it isn't your website.",
    category: "Research",
    datePublished: "2026-06-26",
    dateDisplay: "26 June 2026",
    readTime: "8 min read",
    keywords: ["most cited domains AI", "Reddit AI citations", "LinkedIn AI search", "AI source authority", "GEO sources"],
    takeaways: [
      "AI citations are concentrated: a small set of community, reference, and professional sites account for a large share of what engines quote.",
      "Reddit is consistently the single most-cited domain; Wikipedia, YouTube, and LinkedIn round out the top tier.",
      "LinkedIn is the highest-leverage owned surface for B2B and professional services.",
      "Your own domain still matters — but think of it as one source among several, not the whole strategy.",
    ],
    body: [
      { t: "p", text: "There's a comforting myth in marketing that if you just publish great content on your own site, the algorithms will reward you. In AI search, that myth is actively expensive. Engines pull from a concentrated set of *third-party* sources far more than from any single business's website — and knowing the map tells you where to plant your flag." },

      { t: "h2", id: "concentration", text: "Citations are concentrated" },
      { t: "p", text: "Multiple independent studies of AI-cited domains converge on the same shape: a short head of dominant sources, then a long tail. Semrush's three-month tracking of the most-cited domains, Peec AI's domain study, and Profound's analysis of billions of citations all find the same handful of sites doing the heavy lifting." },
      { t: "cite", text: `${S.semrushDomains}; ${S.peec}; ${S.profound}` },

      { t: "h2", id: "reddit", text: "Reddit: the surprise heavyweight" },
      { t: "p", text: "Across studies, **Reddit is consistently the single most-cited domain** in AI answers. Profound's analysis of over four billion citations put Reddit at the top by a wide margin. The reason is structural: Reddit is full of specific, first-person, question-and-answer discussion — exactly the format retrieval engines love, on almost every conceivable topic." },
      { t: "cite", text: `${S.profound}; ${S.peec}` },
      { t: "p", text: "The lesson is not \"go spam Reddit.\" It's that genuinely helpful participation in the communities where your customers ask questions can put your name and expertise into the single richest vein AI mines. One substantive, non-promotional answer in the right subreddit can outperform months of homepage tweaks." },

      { t: "h2", id: "tier", text: "The rest of the top tier" },
      { t: "ul", items: [
        "**Wikipedia** — the reference backbone; heavily trained on and frequently retrieved. Hard to influence directly, but notability and accurate entity information help.",
        "**YouTube** — video transcripts are increasingly mined; a clear, specific video can be a citation source.",
        "**LinkedIn** — the top source for professional and B2B queries (more below).",
        "**Review & directory platforms** — central for local and product recommendations (Google, Yelp, Trustpilot, G2, industry directories).",
      ] },
      { t: "cite", text: `${S.peec}; ${S.semrushDomains}; ${S.seRankingReviews}` },

      { t: "h2", id: "linkedin", text: "LinkedIn: the best owned surface for B2B" },
      { t: "p", text: "Semrush analysed roughly **89,000 LinkedIn URLs** cited by ChatGPT Search, Google AI Mode, and Perplexity across **325,000 prompts**, and found LinkedIn appearing in about **11% of AI responses** on average. Two findings stand out for small businesses: LinkedIn *articles* (long-form) drew the majority of citations, and the median cited post had only **15–25 reactions**. AI doesn't reward the most-liked post; it rewards the most *relevant, specific* one." },
      { t: "cite", text: S.semrushLinkedin },
      { t: "p", text: "That's liberating. You don't need to go viral. You need to publish specific, useful, answer-shaped posts consistently — and a modest account can be cited as readily as a famous one." },

      { t: "h2", id: "own-site", text: "Where your own site fits" },
      { t: "p", text: "Your domain still matters — it's where you state your offer precisely, host the data and FAQs engines quote, and earn direct citations. But treat it as *one* source in a portfolio. The businesses winning AI visibility show up in several places engines trust: their own clear site, the communities where their customers gather, the professional networks where their expertise lives, and the review platforms that vouch for them." },

      { t: "h2", id: "playbook", text: "A simple source-coverage playbook" },
      { t: "ol", items: [
        "**Own site:** publish specific, sourced, answer-shaped pages and FAQs; make them crawlable.",
        "**Community:** answer real questions helpfully on Reddit/Quora in your niche.",
        "**Professional:** post specific, useful LinkedIn articles on a steady cadence (B2B/services).",
        "**Reputation:** keep recent, substantive reviews flowing on the platforms your buyers trust.",
        "**Measure:** track which sources the engines actually cite for *your* category, and double down on what works.",
      ] },
    ],
    sources: [S.profound, S.peec, S.semrushDomains, S.semrushLinkedin, S.seRankingReviews, S.ahrefsCited],
  },

  // 5 ───────────────────────────────────────────────────────────────────────
  {
    slug: "online-reviews-are-an-ai-ranking-factor",
    title: "Your Star Rating Is Now an AI Ranking Factor",
    dek: "Reviews were always good for conversion. In 2026 they do something else: they help decide whether an AI recommends you at all.",
    category: "Reviews & Trust",
    datePublished: "2026-06-26",
    dateDisplay: "26 June 2026",
    readTime: "7 min read",
    keywords: ["reviews AI ranking", "AI Overviews reviews", "online reviews GEO", "reputation AI search", "BrightLocal AI"],
    takeaways: [
      "AI engines pull from review platforms when answering local and product questions, so your reputation now feeds your visibility, not just your conversion rate.",
      "Recency and substance matter: a wall of old five-stars is weaker than a steady flow of recent, specific reviews.",
      "Consumers increasingly trust AI summaries of businesses — which are themselves built from reviews.",
      "Treat reviews as a publishing channel, not a vanity metric: ask, respond, and keep them current.",
    ],
    body: [
      { t: "p", text: "Most owners think of reviews as a conversion tool: social proof that nudges a hesitant visitor into a customer. That's still true. But something quieter and more consequential has happened — reviews have become an *input to discovery*. They help decide whether an AI names you in the first place." },

      { t: "h2", id: "how", text: "How reviews enter the AI answer" },
      { t: "p", text: "When you ask an assistant for a local recommendation — a dentist, a contractor, a SaaS tool — it frequently retrieves and synthesises from review and directory platforms. SE Ranking found review platforms appearing regularly as cited sources inside AI Overviews, particularly for local and product queries. The engine isn't just reading your website; it's reading what others say about you, and weighting it." },
      { t: "cite", text: S.seRankingReviews },
      { t: "p", text: "So the chain is: customers review you → review platforms aggregate it → AI retrieves and summarises it → the AI's summary shapes the next customer's decision. Your reputation is now upstream of your visibility." },

      { t: "h2", id: "trust", text: "Consumers trust the AI's summary of you" },
      { t: "p", text: "And they increasingly act on it. BrightLocal's 2026 research on AI and local trust found a growing share of consumers comfortable relying on AI summaries of local businesses when deciding who to contact. That summary is assembled largely from your reviews — so a thin or stale review profile doesn't just look bad to a human reading your page; it gives the AI little to work with and less reason to recommend you." },
      { t: "cite", text: S.brightlocal },

      { t: "h2", id: "recency", text: "Recency and substance beat a pile of old stars" },
      { t: "p", text: "A common mistake is treating reviews as a one-time achievement — collect a hundred five-stars, then forget about it. Both humans and retrieval systems weight *recency*. Freshness is a relevance signal across AI search generally, and reviews are no exception: a steady trickle of recent, specific reviews (\"they fixed the leak under the sink in 40 minutes and explained the cause\") gives the engine concrete, current material to quote. A wall of \"Great service!\" from two years ago does not." },
      { t: "cite", text: S.ahrefsFresh },

      { t: "h2", id: "playbook", text: "Treat reviews as a channel, not a trophy" },
      { t: "ol", items: [
        "**Ask, every time.** Build a simple, consistent request into your post-service routine. The single biggest lever on review volume is asking.",
        "**Ask for specifics.** Encourage detail — the service, the outcome, the location. Specific reviews are more useful to both humans and AI than generic praise.",
        "**Spread across the platforms AI reads.** Don't rely on one site; consistency across Google, industry directories, and relevant niche platforms widens your footprint.",
        "**Respond — especially to the critical ones.** Thoughtful responses add fresh, on-topic text and signal an engaged, real business.",
        "**Keep it flowing.** A modest, steady stream beats an old spike. Make review-gathering a habit, not a campaign.",
      ] },
      { t: "p", text: "The businesses that win AI recommendations in local and product categories aren't necessarily the biggest — they're the ones with a current, specific, credible reputation that an engine can read and quote. Your star rating stopped being just a conversion lever the day AI started reading it." },
    ],
    sources: [S.seRankingReviews, S.brightlocal, S.ahrefsFresh, S.soci],
  },
  // 6 ───────────────────────────────────────────────────────────────────────
  {
    slug: "schema-markup-for-ai-search",
    title: "Schema Markup: How to Speak the Language AI Engines Read",
    dek: "Schema markup is the unglamorous, high-leverage GEO move most small businesses skip. It's how you tell an AI exactly what you are, what you offer, and why it can trust the answer.",
    category: "Technical GEO",
    datePublished: "2026-06-26",
    dateDisplay: "26 June 2026",
    readTime: "8 min read",
    keywords: ["schema markup", "structured data", "AI search", "JSON-LD", "GEO technical"],
    takeaways: [
      "Schema markup (structured data) is machine-readable labelling that tells engines what your content *means*, not just what it says.",
      "It measurably helps AI engines understand and surface your content — and most small-business sites have little or none.",
      "The high-value types for SMBs are Organization, LocalBusiness, Product/Service, FAQ, Review/AggregateRating, and Article.",
      "It's cheap, low-risk, and one of the few GEO levers entirely within your control.",
    ],
    body: [
      { t: "p", text: "Most GEO advice is about *what* you write. This one is about how you *label* it. Schema markup is the quiet, technical layer that turns a page a human reads into data a machine can be certain about — and certainty is exactly what an AI engine wants before it puts your name in an answer." },

      { t: "h2", id: "what", text: "What schema markup actually is" },
      { t: "p", text: "Schema markup (usually written as **JSON-LD**, a small block of structured data in your page's code) is a vocabulary — from schema.org — for describing things. Instead of leaving an engine to *infer* that \"Acme Plumbing\" is a local business in Porto open until 6pm with a 4.8 rating, you state it explicitly in a format built for machines. You're removing ambiguity." },
      { t: "p", text: "Humans never see it. Engines do. And the difference between *guessing* what your page means and *knowing* it is the difference between being a maybe and being a confident citation." },

      { t: "h2", id: "evidence", text: "Does it actually help with AI?" },
      { t: "p", text: "Yes — and there's evidence, not just folklore. Otterly.ai's analysis of schema markup's real impact on AI search found structured data associated with better understanding and surfacing of content in AI answers. Practitioner syntheses of citation ranking factors repeatedly list clear structure and markup among the signals correlated with being cited." },
      { t: "cite", text: `${S.otterly}; ${S.zyppy}` },
      { t: "p", text: "It also compounds with everything else. Schema makes your reviews legible (feeding the reputation signals AI weights), your FAQs answer-shaped, and your entity (who you are) unambiguous — which helps engines connect mentions of you across the web." },

      { t: "h2", id: "types", text: "The types that matter for small businesses" },
      { t: "ul", items: [
        "**Organization** — your name, logo, URL, and social profiles. Establishes your entity so engines can connect mentions of you elsewhere.",
        "**LocalBusiness** — address, hours, phone, service area, geo-coordinates. Essential for local discovery.",
        "**Product / Service** — what you sell, with descriptions and (where relevant) price. Helps you match product queries.",
        "**FAQPage** — question-and-answer pairs. This is gold for GEO: it's literally pre-formatted answers to specific questions.",
        "**Review / AggregateRating** — your ratings and review counts, made machine-readable (feeds the reputation signals AI leans on).",
        "**Article** — for blog posts: headline, author, publisher, dates. (This very page uses it.)",
      ] },
      { t: "cite", text: S.seRankingReviews },

      { t: "h2", id: "faq", text: "Why FAQ schema is the SMB sweet spot" },
      { t: "p", text: "If you do only one thing, do this. AI engines answer *questions*. FAQ schema lets you publish the exact questions your customers ask, paired with crisp, specific answers — in the precise format an engine wants to retrieve and quote. \"How long does Invisalign take?\" → \"Typically 6–18 months depending on complexity.\" That's a citation waiting to happen, and the markup makes it unmissable." },

      { t: "h2", id: "how", text: "How to add it without a developer" },
      { t: "ol", items: [
        "**Inventory** the entities you want understood: your business, your top services, your FAQs, your reviews.",
        "**Generate** JSON-LD — most site platforms (WordPress, Shopify, Squarespace, Wix) have schema plugins or built-in settings; Google's Structured Data Markup Helper can also generate it.",
        "**Place** it in the page's HTML head (JSON-LD is a single script block — no visible change).",
        "**Validate** with Google's Rich Results Test and the schema.org validator to catch errors.",
        "**Keep it true.** Schema must match the visible page — never mark up ratings or hours you don't actually have.",
      ] },

      { t: "h2", id: "bottom-line", text: "The bottom line" },
      { t: "p", text: "Schema markup won't write your content or earn your reviews. But of all the GEO levers, it's the one most fully in your control, the cheapest to implement, and the lowest-risk — and most of your competitors haven't bothered. It's the closest thing GEO has to free points. Take them." },
    ],
    sources: [S.otterly, S.zyppy, S.seRankingReviews, S.geoPaper],
  },

  // 7 ───────────────────────────────────────────────────────────────────────
  {
    slug: "how-to-measure-ai-visibility",
    title: "How to Measure Whether AI Actually Mentions Your Brand",
    dek: "You can't improve what you don't measure — and \"I asked ChatGPT once and it mentioned us\" isn't measurement. Here's how to build a real AI-visibility baseline.",
    category: "Measurement",
    datePublished: "2026-06-26",
    dateDisplay: "26 June 2026",
    readTime: "8 min read",
    keywords: ["measure AI visibility", "AI visibility tracking", "share of voice AI", "GEO metrics", "AI brand monitoring"],
    takeaways: [
      "AI answers are non-deterministic: ask the same prompt twice and the named brands can differ — so single checks are noise, not data.",
      "A real baseline means a fixed prompt set, run repeatedly, across multiple engines, scored consistently.",
      "Track three things: presence (are you named?), position (how prominently?), and sentiment (how favourably?).",
      "Re-run on a schedule so you can see whether your GEO work is actually moving the needle.",
    ],
    body: [
      { t: "p", text: "Ask an AI assistant whether it recommends your business and it might say yes. Ask again an hour later and it might not mention you at all. That's not a glitch — it's how these systems work. Which means the casual \"I checked and we're in there\" tells you almost nothing. To know where you really stand, you need to measure like a scientist, not a tourist." },

      { t: "h2", id: "why-hard", text: "Why measuring AI visibility is genuinely hard" },
      { t: "p", text: "Large language models are non-deterministic: the same prompt can yield different answers across runs, because of sampling, live-retrieval variation, and personalisation. Search Engine Land's repeated-run testing found only about five brands tend to surface per category — and the set shifts between runs. So a single query is a coin flip, not a measurement." },
      { t: "cite", text: S.repeatRuns },
      { t: "p", text: "The implication is simple but easy to ignore: you must run each prompt *multiple times* and aggregate, or you're measuring randomness." },

      { t: "h2", id: "method", text: "A measurement method that holds up" },
      { t: "ol", items: [
        "**Fix a prompt set.** Write 20–50 prompts a real customer would ask — \"best [category] in [city]\", \"alternatives to [competitor]\", \"is [your brand] any good?\". Keep them stable so results are comparable over time.",
        "**Cover the engines that matter.** Run the set across ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews — visibility differs sharply between them.",
        "**Repeat each prompt.** Run every prompt several times per engine and aggregate. One run is anecdote; several is data.",
        "**Score consistently.** For each result, record presence (named or not), position (first, in a list, an afterthought), and sentiment (positive, neutral, negative).",
        "**Log the sources.** Note which sites the engine cited — that tells you *where* to invest (your site, Reddit, reviews, LinkedIn).",
      ] },

      { t: "h2", id: "metrics", text: "The three metrics that matter" },
      { t: "ul", items: [
        "**Presence (Share of Voice).** Across your prompt set and engines, how often are you named at all — and how does that compare to competitors? This is your headline number.",
        "**Position.** Being named first or in the lead sentence is worth far more than a passing mention at the end. Weight accordingly.",
        "**Sentiment.** AI doesn't just list you — it characterises you. \"Reliable and well-reviewed\" and \"a budget option with mixed feedback\" are both mentions; only one wins customers.",
      ] },

      { t: "h2", id: "cadence", text: "Why cadence beats one-off checks" },
      { t: "p", text: "AI search rewards freshness, and the underlying models and indexes change constantly. A baseline you measure once decays immediately. Re-running your prompt set on a schedule — monthly is a sensible floor — turns a snapshot into a trend line, which is the only way to know whether publishing that content, earning those reviews, or fixing your schema actually changed anything." },
      { t: "cite", text: S.ahrefsFresh },

      { t: "h2", id: "diy-vs-tool", text: "DIY or tooled?" },
      { t: "p", text: "You can absolutely start by hand: a spreadsheet, a fixed prompt list, and a disciplined monthly hour. It's tedious and the repetition-and-aggregation step is easy to skimp on, but it's real measurement and it's free. As it grows — more prompts, more engines, more competitors, more runs — automated tracking pays for itself by doing the repetition consistently and scoring it the same way every time. Either way, the principle is identical: fixed prompts, multiple runs, multiple engines, consistent scoring, on a schedule." },

      { t: "h2", id: "start", text: "Start with a baseline this week" },
      { t: "p", text: "Pick ten prompts your customers actually ask. Run each three times across two or three engines. Tally presence, position, and sentiment, and note the sources cited. That single afternoon gives you something most of your competitors have never had: an honest answer to \"when a customer asks AI, does it name us — and what does it say?\" Everything else in GEO is about moving those numbers." },
    ],
    sources: [S.repeatRuns, S.ahrefsFresh, S.siana, S.semrushDomains, S.geoPaper],
  },

  // 8 ───────────────────────────────────────────────────────────────────────
  {
    slug: "zero-click-search-and-ai-traffic",
    title: "Zero-Click Search Is Here. Does AI Traffic Still Convert?",
    dek: "AI answers questions without sending a click — which sounds like a disaster for businesses. The data is more interesting (and more hopeful) than the panic suggests.",
    category: "Strategy",
    datePublished: "2026-06-26",
    dateDisplay: "26 June 2026",
    readTime: "8 min read",
    keywords: ["zero-click search", "AI traffic conversion", "does AI traffic convert", "AI Overviews CTR", "GEO ROI"],
    takeaways: [
      "Zero-click is real: most Google searches now end without a click to an external site, and AI summaries accelerate it.",
      "But the visits AI *does* send tend to be higher-intent — multiple studies report AI-referred traffic converting better than average.",
      "The evidence isn't unanimous: at least one large study found no conversion advantage, so claims deserve honesty.",
      "The strategic takeaway: being named in the answer matters even when there's no click, and the clicks you do get are worth more.",
    ],
    body: [
      { t: "p", text: "Here's the fear, stated plainly: if AI answers the question, nobody clicks through to your site, and your traffic — and your sales — collapse. It's a reasonable worry. It's also only half the story, and the missing half changes the conclusion." },

      { t: "h2", id: "zero-click", text: "The zero-click reality" },
      { t: "p", text: "The click really is shrinking. Pew Research found Google users are significantly less likely to click any link when an AI summary appears. SparkToro's 2026 analysis estimates that fewer than one-third of Google searches still send a click to the open web. When an AI Overview or chatbot answers the question, the visit you used to compete for often simply doesn't happen." },
      { t: "cite", text: `${S.pew}; ${S.sparktoro}; ${S.seer}` },
      { t: "p", text: "If your entire strategy depends on ranking for a link and capturing the click, that strategy is eroding under you. This is the genuine threat, and pretending otherwise helps no one." },

      { t: "h2", id: "but", text: "But the clicks that remain are better" },
      { t: "p", text: "Now the other half. The visits AI *does* send tend to be unusually high-intent — someone who read a synthesised answer, saw you named as a credible option, and chose to click through is closer to deciding than a random searcher. Microsoft's Clarity team reported AI-referred traffic converting at roughly three times the rate of other channels. Forrester's 2026 buyer work makes the same structural point: zero-click is only half the AI story — the influence on the buyer happens *inside* the answer, before any click." },
      { t: "cite", text: `${S.clarity}; ${S.forrester}; ${S.g2}` },

      { t: "h2", id: "honesty", text: "The honest counter-evidence" },
      { t: "p", text: "Good strategy survives contact with inconvenient data, so here it is: not every study agrees. Amsive's analysis across 54 sites found that LLM-referred traffic did *not* uniformly convert better than organic — the advantage varied and sometimes vanished. The truthful synthesis is that AI traffic is often higher-intent, but \"3x\" is not a law of nature; it depends on your category, your offer, and how you're characterised in the answer." },
      { t: "cite", text: S.amsive },

      { t: "h2", id: "reframe", text: "Reframing the goal: presence over clicks" },
      { t: "p", text: "Put the two halves together and the strategy reframes itself. In a zero-click world, **being named in the answer is the win** — even without a click, you've earned consideration, brand recall, and trust at the exact moment of decision. And when a click does come, it's worth more than the old organic click was. Both arguments point the same way: get into the answer, and make sure the answer describes you well." },
      { t: "p", text: "That's a different scoreboard than \"rank #1 for the keyword.\" It rewards being the credible, specific, well-reviewed option an engine is comfortable naming — which is exactly what GEO builds." },

      { t: "h2", id: "do", text: "What to do about it" },
      { t: "ol", items: [
        "**Measure presence, not just traffic.** Track how often AI names you and how it describes you — that's the leading indicator now.",
        "**Win the characterisation.** Specific, sourced, well-reviewed businesses get described favourably; vague ones get skipped or hedged.",
        "**Make the click count.** For the high-intent visitors who do arrive, ensure your landing experience converts — they're already warm.",
        "**Don't abandon SEO.** Strong fundamentals still feed both link clicks and AI citations; this is additive, not a replacement.",
      ] },
    ],
    sources: [S.pew, S.sparktoro, S.seer, S.clarity, S.forrester, S.amsive, S.g2, S.bain],
  },

  // 9 ───────────────────────────────────────────────────────────────────────
  {
    slug: "geo-vs-seo-where-to-spend-2026",
    title: "GEO vs SEO: What's the Same, What's New, and Where to Spend in 2026",
    dek: "GEO didn't kill SEO — it built a second floor on top of it. Here's an honest map of what overlaps, what's genuinely new, and how a small business should split its effort.",
    category: "Strategy",
    datePublished: "2026-06-26",
    dateDisplay: "26 June 2026",
    readTime: "8 min read",
    keywords: ["GEO vs SEO", "SEO and GEO", "AI search strategy", "where to invest GEO", "generative engine optimization"],
    takeaways: [
      "GEO and SEO share a foundation: a crawlable, fast, credible site with genuine expertise. Neglect that and both fail.",
      "What's new in GEO: optimising for synthesised answers and named citations, off-site presence, evidence density, and entity clarity.",
      "The target differs — SEO chases rankings and clicks; GEO chases mentions and trust inside the answer.",
      "For most SMBs in 2026, the smart split is to keep doing core SEO and layer GEO on top, not to abandon one for the other.",
    ],
    body: [
      { t: "p", text: "Every few years a new acronym arrives promising that everything before it is dead. GEO is not that. The most useful way to think about Generative Engine Optimization is not as SEO's replacement but as its second storey: it sits on the same foundation, but the rooms upstairs are arranged differently." },

      { t: "h2", id: "same", text: "What's the same (the shared foundation)" },
      { t: "p", text: "A lot, and it's worth saying clearly because it's where panic-driven advice goes wrong. Both SEO and GEO need: a site that engines can crawl and parse; pages that load and render without tripping over JavaScript; genuine topical authority; clear information architecture; and real expertise behind the words. If a crawler can't read you, neither Google nor ChatGPT can cite you — Ahrefs found a large share of the pages AI *wants* to cite are effectively blocked. The fundamentals are non-negotiable for both games." },
      { t: "cite", text: S.ahrefsCited },

      { t: "h2", id: "new", text: "What's genuinely new in GEO" },
      { t: "ul", items: [
        "**Optimising for answers, not links.** The unit of success is being named and quoted inside a synthesised answer, not ranking a URL.",
        "**Evidence density.** Adding specific statistics and cited quotes measurably raised citation visibility in the GEO research — a lever SEO never emphasised.",
        "**Off-site presence.** AI leans heavily on third-party sources (Reddit, LinkedIn, reviews, Wikipedia). Your own page is one input among many.",
        "**Entity clarity.** Engines need to know *who you are* and connect mentions across the web — structured data and consistent identity matter more.",
        "**Cross-engine reality.** There's no single \"#1\" — ChatGPT, Perplexity, Gemini, and AI Overviews can each name a different set.",
      ] },
      { t: "cite", text: `${S.geoPaper}; ${S.profound}; ${S.semrushLinkedin}` },

      { t: "h2", id: "different-target", text: "The target is different" },
      { t: "p", text: "SEO asks: *can I rank on page one and earn the click?* GEO asks: *when an engine synthesises an answer, will it name me, place me well, and describe me favourably?* The first is a position in a list of links; the second is a sentence in a paragraph of prose. They're related — authority feeds both — but you optimise for them differently, and you measure them differently (rankings and clicks vs presence, position, and sentiment in answers)." },

      { t: "h2", id: "spend", text: "Where a small business should spend" },
      { t: "p", text: "Here's an honest allocation for most SMBs in 2026 — not a formula, a starting point:" },
      { t: "ol", items: [
        "**Keep the SEO fundamentals running (≈ half your effort).** Crawlable, fast site; clear service/location pages; legitimate authority. This is the foundation both games stand on.",
        "**Layer GEO on top (≈ the other half).** Make key pages answer specific questions; add FAQ and structured data; back claims with numbers; earn mentions on the third-party sources AI trusts; keep reviews fresh.",
        "**Measure both.** Track rankings/traffic *and* AI presence/sentiment, so you can see which investments pay off where.",
      ] },
      { t: "p", text: "The mistake to avoid in both directions: don't bet the business on link-clicks that are shrinking, and don't torch your working SEO to chase a shiny acronym. The businesses that win are doing the boring fundamentals *and* the new layer." },

      { t: "h2", id: "edge", text: "The small-business edge" },
      { t: "p", text: "One closing encouragement. GEO is new enough that most local and small businesses have done nothing — one industry index found the vast majority of contractors entirely absent from AI answers. That's not just a risk; it's an opening. The field is uncrowded in a way SEO hasn't been for a decade. Showing up consistently now is how you claim space before everyone else notices the game has changed." },
      { t: "cite", text: `${S.hvac}; ${S.hubspot}` },
    ],
    sources: [S.ahrefsCited, S.geoPaper, S.profound, S.semrushLinkedin, S.hvac, S.hubspot, S.zyppy],
  },

  // 10 ──────────────────────────────────────────────────────────────────────
  {
    slug: "30-day-geo-plan-small-business",
    title: "A 30-Day GEO Starter Plan for Small Businesses",
    dek: "No agency, no big budget, an hour or two a week. Here's a concrete four-week plan to go from invisible in AI answers to showing up — and knowing it.",
    category: "Playbook",
    datePublished: "2026-06-26",
    dateDisplay: "26 June 2026",
    readTime: "9 min read",
    keywords: ["GEO plan", "GEO checklist", "small business AI visibility", "how to start GEO", "30 day GEO"],
    takeaways: [
      "GEO is learnable in a few focused hours a week — you don't need an agency to start.",
      "Week 1 is measurement; Week 2 fixes your own site; Week 3 builds off-site presence; Week 4 establishes a sustainable rhythm.",
      "The goal of the first month isn't perfection — it's a baseline, a few concrete improvements, and a repeatable habit.",
      "By day 30 you'll know whether AI names you, you'll have removed the obvious blockers, and you'll have a system to keep improving.",
    ],
    body: [
      { t: "p", text: "Most GEO advice tells you what matters and leaves you staring at a blank week. This is the opposite: a concrete, four-week plan you can run alongside actually running your business. It assumes no budget beyond your time and no skills beyond a willingness to be specific. By the end, you'll have a baseline, a handful of real improvements, and — most importantly — a habit." },

      { t: "h2", id: "week1", text: "Week 1 — Measure (you can't fix what you can't see)" },
      { t: "p", text: "Resist the urge to start \"doing\" before you know where you stand. Spend week one building a baseline." },
      { t: "ol", items: [
        "**Write 10 customer prompts** — the real questions buyers ask: \"best [your category] in [your area]\", \"[competitor] alternatives\", \"is [your brand] good?\".",
        "**Run each three times** across ChatGPT, Perplexity, and Gemini. Yes, three times — answers vary, so repetition is the measurement.",
        "**Record presence, position, sentiment** for each, plus which sources the engine cited.",
        "**Tally your baseline:** out of all runs, how often are you named, how prominently, and how favourably — versus competitors?",
      ] },
      { t: "cite", text: S.repeatRuns },
      { t: "p", text: "Most owners find this sobering — often they're barely mentioned. That's the point: now you have a number to beat." },

      { t: "h2", id: "week2", text: "Week 2 — Fix your own foundation" },
      { t: "p", text: "Make the source you fully control as citable as possible." },
      { t: "ol", items: [
        "**Check crawlability.** Make sure your key pages are readable without JavaScript and you're not blocking AI crawlers. A blocked page can't be cited — and that's a common own-goal.",
        "**Rewrite your top pages to be specific.** Replace \"we help you smile\" with the actual service, location, price range, and timeline. Say the words customers search.",
        "**Add an FAQ page** answering your 8–12 most-asked questions, crisply. This is the most directly citable content you can publish.",
        "**Add structured data** (Organization, LocalBusiness, FAQ, Review) via your platform's schema plugin, then validate it.",
      ] },
      { t: "cite", text: `${S.ahrefsCited}; ${S.otterly}; ${S.geoPaper}` },

      { t: "h2", id: "week3", text: "Week 3 — Build off-site presence" },
      { t: "p", text: "AI leans on third-party sources more than your own site, so plant your flag where it looks." },
      { t: "ol", items: [
        "**Earn fresh, specific reviews.** Ask your last 10 happy customers, and ask for detail (the service, the outcome). Reviews feed the reputation signals AI weights for local and product answers.",
        "**Answer two real questions** in the communities your customers use — a relevant subreddit, Quora, or an industry forum. Be genuinely helpful, not promotional.",
        "**Post one specific, useful piece** on LinkedIn if you're B2B or a service — long-form, answer-shaped. Modest accounts get cited too; relevance beats reach.",
        "**Fix directory consistency** — same name, category, address, and hours everywhere AI might read them.",
      ] },
      { t: "cite", text: `${S.profound}; ${S.brightlocal}; ${S.semrushLinkedin}` },

      { t: "h2", id: "week4", text: "Week 4 — Establish the rhythm" },
      { t: "p", text: "GEO rewards consistency, so the final week is about turning a sprint into a system." },
      { t: "ol", items: [
        "**Set a publishing cadence** you can actually sustain — one specific, useful piece per week beats five in a burst then silence. Freshness is a relevance signal.",
        "**Schedule the monthly re-measure.** Put your Week-1 prompt set on a recurring monthly slot so you can watch the trend.",
        "**Pick next month's targets** from your data — the prompts where you're absent or poorly described are your roadmap.",
        "**Keep reviews flowing** — make the ask part of your routine, not a one-off campaign.",
      ] },
      { t: "cite", text: S.ahrefsFresh },

      { t: "h2", id: "day30", text: "Where you'll be at day 30" },
      { t: "p", text: "You won't be \"finished\" — GEO isn't a project with an end date. But in one month, with a couple of focused hours a week, you'll have gone from guessing to knowing: a real baseline, a crawlable and specific website, an FAQ and schema engines can read, fresh reviews and a few genuine off-site mentions, and a monthly habit that compounds. That puts you ahead of the large majority of small businesses that are still completely absent from AI answers — and it's the unglamorous, repeatable work that actually gets you named." },
      { t: "cite", text: S.hvac },
    ],
    sources: [S.repeatRuns, S.ahrefsCited, S.otterly, S.geoPaper, S.profound, S.brightlocal, S.semrushLinkedin, S.ahrefsFresh, S.hvac],
  },
];

export function findBlogContent(slug: string): BlogContent | undefined {
  return BLOG_CONTENT.find((p) => p.slug === slug);
}
