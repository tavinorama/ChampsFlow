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
];

export function findBlogContent(slug: string): BlogContent | undefined {
  return BLOG_CONTENT.find((p) => p.slug === slug);
}
