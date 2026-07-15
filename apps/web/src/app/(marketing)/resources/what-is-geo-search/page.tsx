/**
 * /resources/what-is-geo-search — "Understanding GEO Search"
 *
 * Flagship PUBLIC, on-page GEO asset (also Kit Part 2).
 * Renders the full whitepaper content from whitepaper-understanding-geo.md
 * so it is fully crawlable, citable, and printable.
 *
 * - Extended ResourceMarkdown renderer: ## / ### headings, tables,
 *   "> " blockquotes, inline [links](url), **bold**, bullets.
 * - Two download paths: "Download as PDF" (browser print) +
 *   real PDF download → /downloads/Understanding-GEO-Search.pdf
 * - JSON-LD: TechArticle + FAQPage + BreadcrumbList
 * - Strong Plans CTA at end.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "../../../../components/brand/Logo";
import { ResourceMarkdown } from "../../../../components/ResourceMarkdown";
import { SoftCTA } from "../../../../components/marketing/SoftCTA";
import { safeJsonLd } from "../../../../lib/safe-json-ld";

export const metadata: Metadata = {
  title:
    "Understanding GEO Search — How AI Engines Decide Which Businesses to Name | Ozvor",
  description:
    "The complete Ozvor whitepaper on Generative Engine Optimization (GEO): what it is, why it matters for small businesses, the Princeton research that proved it, and a concrete starter checklist. Free to read and download.",
  alternates: {
    canonical: "https://ozvor.com/resources/what-is-geo-search",
  },
  openGraph: {
    title:
      "Understanding GEO Search — How AI Engines Decide Which Businesses to Name | Ozvor",
    description:
      "ChatGPT reached 900M weekly users. AI now names 2–3 businesses per query. This whitepaper explains what GEO is, the peer-reviewed science behind it, and what to do this week.",
    url: "https://ozvor.com/resources/what-is-geo-search",
    siteName: "Ozvor",
    type: "article",
  },
};

// ---------------------------------------------------------------------------
// Whitepaper content — structured from whitepaper-understanding-geo.md
// Each section maps to one <section> with a heading rendered via ResourceMarkdown.
// ---------------------------------------------------------------------------

interface WhitepaperSection {
  id: string;
  number: string;
  heading: string;
  body: string;
  keyTakeaway?: string;
}

const WHITEPAPER: {
  title: string;
  subtitle: string;
  badge: string;
  intro: string;
  sections: WhitepaperSection[];
  sources: string;
  plansCta: { heading: string; body: string; buttonLabel: string };
} = {
  title: "Understanding GEO Search",
  subtitle:
    "How AI answer engines decide which businesses to name, and what that means for yours",
  badge: "The Get-Cited Kit · Part 2 · June 2026",
  intro:
    "**Who this is for.** You run a real business. You are not a marketer, you do not have a \"growth team,\" and until recently the most you ever thought about search was making sure your Google listing had the right phone number. This whitepaper is written for you. It explains (in plain English, with real numbers and named sources) the single biggest shift in how customers find businesses since Google itself. By the end you will understand what GEO is, why it is already costing some businesses customers they never knew they lost, and exactly what to do about it.",

  sections: [
    {
      id: "the-shift",
      number: "01",
      heading: "The shift, in one page",
      body: `For twenty years the rules of getting found online were stable enough to fit on a napkin. A customer typed a question into Google. Google returned ten blue links. You earned a spot on that first page, the customer scrolled, and the click was yours to win. Whole industries (SEO agencies, content marketers, the entire idea of "ranking") were built on that one mechanic: ten links, and a race to the top of them.

That mechanic is being dismantled in real time.

AI answer engines (ChatGPT, Google's AI Overviews, Gemini, Perplexity, and Claude) now sit *on top of* search. Instead of handing the customer ten links to evaluate, they read the web for the customer and hand back a finished answer. When someone asks ChatGPT "who's the best accountant for freelancers near me?" or asks Google "reliable CRM for a five-person team," the AI does not return a page of options to scroll through. It returns a short paragraph that names **two or three businesses**. That is the entire shortlist. There is no page two. There is no "scroll down a bit." You are either one of the named businesses, or you do not exist in that conversation.

This is the part that makes the shift so dangerous: **it is invisible to the people it hurts most.** A large enterprise has a team watching this. Most small businesses have never heard the term "Generative Engine Optimization." You can keep your Google rankings exactly where they were. You can keep doing everything your SEO agency told you to do. And you can still watch your phone ring less, because the AI is now answering the question *before* the customer ever reaches a list of websites, and your business is simply not in the answer.

The old failure mode of search was ranking on page two: bad, but visible. You knew you were losing. The new failure mode is worse, because it is silent. When the AI names two plumbers and yours is not one of them, you did not lose a ranking. **You lost the customer before they ever knew you existed.** You will never see the lead that did not call. There is no analytics dashboard for the conversation that happened inside ChatGPT and ended without your name in it.

That is the problem GEO solves. **Generative Engine Optimization (GEO)** is the practice of structuring your online presence so AI answer engines are more likely to name you when someone asks a question your business can answer. SEO earns you a link. GEO earns you a mention inside the answer, which is increasingly the only place the decision gets made.`,
      keyTakeaway:
        "Search used to hand customers 10 links to choose from. AI now hands them 2–3 named businesses. The new way to lose is not ranking on page two. It is being invisible inside the answer, a loss you never see in any dashboard.",
    },
    {
      id: "the-numbers",
      number: "02",
      heading: "The numbers that prove it is already here",
      body: `It would be easy to dismiss all of this as a futurist's slide deck: "AI will change everything," eventually, someday. It is not a forecast. The behavior has already moved, and the scale is enormous. Here are the figures, each with its source named, so you can weigh them yourself.

**The engines already have audiences the size of nations.**

- **ChatGPT reached roughly 900 million weekly active users in February 2026**, more than double the ~400 million it reported a year earlier (OpenAI, reported via TechCrunch and Search Engine Land, Feb 2026). It now handles on the order of **2.5 billion prompts a day** (OpenAI via Axios, Jul 2025).
- **Google's AI Overviews reach more than 2 billion people a month**, across 200+ countries and territories, up roughly 500 million in a single quarter (Alphabet Q2 2025 earnings, via TechCrunch and Search Engine Journal).
- **Google's Gemini app passed 750 million monthly active users** in early 2026 (Alphabet earnings, via TechCrunch and 9to5Google).

**Customer behavior has shifted to match.**

- **Around 37% of consumers now say they start their searches with an AI tool rather than Google**, and 59% expect AI to become their primary way of searching (Eight Oh Two consumer study, Nov 2025). Independently, **Bain & Company found roughly 44% of buyers now start or split their research inside an AI tool** (Bain, 2026).
- **70% of users say they use AI for search more than they did a year ago** (Fractl survey via Search Engine Land, 2026).

**And the click to your website is disappearing even when you do rank.**

- **In 2026, about 68% of US Google searches ended without a single click to the open web**, up from roughly 60% in 2024 (SparkToro / Rand Fishkin, Jun 2026). Of every 1,000 searches, only about 276 now send a click out to a website, down from about 374.
- **Pew Research Center** found that when an AI summary appears, users click a traditional result only about **8% of the time versus 15% without the summary**, and they click links *inside* the AI summary just 1% of the time (Pew Research Center, Jul 2025).
- **Gartner forecast** that traditional search engine volume would fall about **25% by 2026** as people move to AI assistants (Gartner press release, Feb 2024).

The most chilling version: a real publisher held a stable #1 Google ranking while its click-through rate fell from 5.1% to 0.6% (PPA analysis). Same ranking. Almost no clicks.

**The awareness gap is the opportunity.** Industry tracking suggests only about **16% of brands systematically monitor their AI-search performance** at all (HubSpot, citing 2025 data). Among local businesses the figure is lower. By one estimate **roughly 88% of local businesses have no AI-search strategy whatsoever**, with only about 12% having begun any GEO work (GrowthPro, 2026, vendor research, directional). At the same time, **68% of marketers say they are actively changing strategy for AI search** (BrightEdge, survey of 750+ professionals, Jun 2025). Nearly everyone knows AI search matters, but almost no one has done the work. That contradiction is your opening.`,
      keyTakeaway:
        "Nearly a billion people use ChatGPT weekly and over 2 billion see Google's AI Overviews monthly. About 37–44% of buyers now begin with AI, and roughly 68% of Google searches end with no click at all (SparkToro, 2026). Yet only ~16% of brands even track their AI visibility (HubSpot, 2025). The gap between knowing and doing is your opening.",
    },
    {
      id: "sales-funnel",
      number: "03",
      heading: "AI search and your sales funnel, where the money actually is",
      body: `Up to this point we have talked about visibility. But visibility is not the goal: **customers are the goal, and customers are money.** There is a comforting myth worth killing early: the idea that AI traffic is "just curious browsers" who never buy. The data says the opposite.

**Are AI visitors actually worth more?**

The strongest, best-attributed evidence says yes.

- **Microsoft's own Clarity analytics, across 1,277 websites, found visitors arriving from AI signed up at roughly 11 times the rate of visitors from traditional search**, a sign-up click-through rate of 1.66% versus 0.15% (Microsoft Clarity, Nov 2025).
- **Adobe Analytics, looking at more than a trillion visits to US retailers, found AI-referred traffic converted 42% better than non-AI traffic and drove 37% more revenue per visit** (Adobe Analytics, Q1 2026, via TechCrunch). The same data showed AI visitors spend 48% longer on site, view 13% more pages, and bounce 32% less.
- **Forrester surveyed roughly 18,000 buyers and found 94% of B2B buyers now use AI somewhere in their buying journey**, with twice as many naming generative AI their most meaningful research source as named any other single source (Forrester 2026 Buyer Insights, Jan 2026).
- **Seer Interactive, analyzing 5.47 million queries and 2.43 billion impressions across 53 brands, found that brands cited inside a Google AI Overview earned 120% more organic clicks** than uncited brands on the same query (Seer Interactive, Apr 2026).
- **G2's "Answer Economy" research found that one in three B2B buyers purchased from a vendor they had never heard of before discovering it through AI** (G2 survey of 1,076 buyers, Mar 2026, via Demand Gen Report).

**The honest counterweight.** We will not pretend the conversion picture is unanimous. **Amsive, studying 54 sites, found no statistically significant overall difference between AI and organic conversion rates** (4.87% vs 4.60%, p=0.794), although the majority of sites, and high-traffic sites in particular, did see higher conversion from AI (Amsive, 2026). The honest synthesis: AI visitors are at least as valuable as search visitors, often far more, and **you cannot convert a visitor the AI never sent you because it never named you.**

**GEO across the funnel**

| Funnel stage | The customer's question | What AI is doing | What GEO does for you |
|---|---|---|---|
| **Awareness** | "What's the best way to handle X?" | Answers directly, names a few example businesses | Gets you mentioned as an example before the customer is even shopping |
| **Consideration** | "Best [your category] for [their situation]?" | Returns a 2–3 name shortlist | Puts you *on* the shortlist instead of in the invisible long tail |
| **Decision** | "Is [your business] any good? vs [competitor]?" | Summarizes reviews, reputation, specifics | Ensures the AI's summary of you is accurate and favorable |

Note that review-site citations rise sharply at the decision stage, bottom-of-funnel, where review platforms can account for over 13% of citations, nearly double their share at the discovery stage (SE Ranking, 2025–26).`,
      keyTakeaway:
        "AI does not send browsers. It sends buyers. Microsoft Clarity measured ~11x higher sign-up rates from AI traffic; Adobe measured +42% conversion and +37% revenue per visit; Seer measured +120% clicks for cited brands. The honest caveat (Amsive found no overall difference) only sharpens the real point: you cannot win a customer the AI never named.",
    },
    {
      id: "how-ai-decides",
      number: "04",
      heading: "How AI engines decide who to cite",
      body: `If AI is choosing two or three businesses, the obvious question is: *on what basis?* The good news for a small business is that this is not a black box, and it is not a popularity contest you are doomed to lose. There is real, published science here, and it points to levers you can actually pull.

**Two paths into the answer: memory and live search**

**Training data (slow, the model's long-term memory).** When an AI model is built, it digests a huge slice of the internet. Sources that appear often, from places that appear often, get baked into the model's memory. This is why Wikipedia, Reddit, and LinkedIn surface so frequently. The catch for a small business: anything you publish today will not reach a model's built-in memory until its next major training run, which can be many months away.

**Live retrieval (fast, the model's web search).** This is the real opportunity. ChatGPT, Perplexity, Gemini, Google AI Mode, and Claude can all fetch live web content while answering and cite their sources with links. Content you publish this month can be picked up and cited within days or weeks, no retraining required. By one marketing-research estimate, ChatGPT runs a live web search on only about 34.5% of queries (Siana Marketing, 2026). The rest are answered from memory alone. That is precisely why GEO has to be ongoing: you are playing for both the fast lane *and* a place in the model's long-term memory.

The one rule both paths share: **the AI matches your content to the question by meaning, not by keyword.** If a customer asks for "Invisalign consultation in the city centre" and your page says exactly that, you can be matched. If your page says "we love helping clients smile," nothing connects, and nothing gets cited.

**The science: the Princeton GEO study**

The term "GEO" is not marketing slang. It was defined in a **peer-reviewed paper presented at KDD 2024** (one of the world's top data-science conferences) by researchers from **Princeton, Georgia Tech, the Allen Institute for AI, and IIT Delhi** (Aggarwal et al., "GEO: Generative Engine Optimization," arXiv:2311.09735). They built a benchmark of **10,000 real user queries** and tested nine different content tactics to see which actually moved a page's visibility inside AI answers.

| Tactic | Lift in AI visibility | What it means in plain English |
|---|---|---|
| **Add quotations** from credible sources | **+41%** | The single most effective move. Quote a named expert or study. |
| **Add statistics** (concrete data points) | **+33%** | A real number the AI can lift beats an adjective every time. |
| **Cite authoritative sources** inline | **+28% on average** | And **up to +115% for an underdog page** that started ranked 5th. |
| Combine fluency + statistics | **>+5.5% over the best single tactic** | Tactics compound, which is why this is ongoing work, not a one-off. |
| **Keyword stuffing** | **−8.7%** | The *only* tactic that backfired. GEO is the opposite of spammy SEO. |

Two things in that table are worth dwelling on. First, the headline: the right content changes lifted a page's visibility in AI answers by **up to 40% overall.** Second, the line that should give every small business hope: **citing authoritative sources lifted an underdog page (one starting in 5th place) by up to 115%.** GEO is, by design, a great equalizer. It rewards the clearest, best-sourced, most current answer, not the biggest brand or the fattest ad budget.`,
      keyTakeaway:
        "Getting cited is science, not luck. A peer-reviewed Princeton study (KDD 2024) proved that adding quotations (+41%), statistics (+33%), and authoritative citations (+28%, up to +115% for an underdog) lifts AI visibility by up to 40%, while keyword stuffing actually hurts you (−8.7%). The winnable formula favors credibility over budget.",
    },
    {
      id: "where-ai-cites",
      number: "05",
      heading: "Where AI pulls its citations from",
      body: `Knowing *what* makes content citable is half the battle. The other half is knowing *where* AI looks, because not every corner of the web carries equal weight, and some of the highest-weight places are ones a small business can influence directly.

**The most-cited sources on the web**

Large-sample studies of AI citations agree on the rough pecking order:

- **Reddit is the single most-cited domain across the major AI engines**, roughly 3.11% of all citations, ahead of YouTube (2.13%) and Wikipedia (1.35%) (Profound, analysis of 4 billion+ citations). It ranks #1 on Perplexity and #2 on ChatGPT, Google AI Overviews, and Grok.
- The **top five cited domains overall** are, in order: **Reddit, YouTube, LinkedIn, Wikipedia, and Forbes** (Peec AI, 30 million sources, via Search Engine Land, Mar 2026).
- **Wikipedia alone accounts for about 16% of ChatGPT's citations** (Ahrefs, Jun 2025).

There is a sobering scarcity inside this: **about 68% of ChatGPT's top-1,000 citations point to places a small business cannot realistically influence** (Wikipedia, brand homepages, app stores) leaving only about **one in three citation "seats" genuinely winnable** (educational content, review sites, news, and blogs) (Ahrefs, Sep 2025). The contestable seats are scarce, which is exactly why claiming them early matters.

**The great equalizer: LinkedIn**

Here is the finding that should change how a small-business owner feels about all of this.

- **LinkedIn is roughly the #2 most-cited domain, appearing in about 11% of AI answers** and as much as 14.3% in ChatGPT Search (Semrush, 325,000 prompts, Jan–Feb 2026).
- And the killer detail: **the median cited LinkedIn post had just 15–25 reactions and one comment or fewer.** About 95% of cited posts were original content (Semrush, 2026).

Read that again. AI engines were not citing the viral posts with thousands of likes. They were citing modest, specific, original posts that simply answered the question well. **You do not need a big following. You do not need to go viral. You need to be the clearest, most credible, most specific answer.** That is a contest a one-person business can win against a national brand.

The same pattern holds on **Quora**, the fourth most-cited source in Google's AI Mode, where cited threads averaged a substantial 535+ words and were marked "Most Relevant" 90% of the time (Semrush, Sep 2025): depth and relevance, not popularity.

**One more thing: where AI looks changes**

In one three-month Semrush study, Reddit citations on ChatGPT swung from about 60% of responses down to about 10%, and Wikipedia from roughly 55% to under 20%, after a single change in how Google exposed search results (Semrush, 230,000+ prompts, 2025). The lesson is not "chase Reddit." The lesson is that **a one-time fix does not stay fixed**, the ground keeps moving, which is the entire argument for monitoring rather than a single audit.

This volatility also rewards the early mover in a way that compounds. AI engines tend to trust the sources they have already cited, so today's mention quietly becomes tomorrow's default. Across 100 runs of the same prompt, ChatGPT surfaced about 44 different brands, but **only about 5 appeared 80% or more of the time**, while roughly 72% of brands lived in a long tail the AI almost never named (Search Engine Land / Fishkin, Feb 2026). The seats at the top of the answer are few, and they harden over time.`,
      keyTakeaway:
        "AI cites Reddit, YouTube, LinkedIn, Wikipedia, and review sites most, but only about 1 in 3 citation seats is winnable by a small business. The equalizer: the median cited LinkedIn post had just 15–25 reactions (Semrush, 2026). Specificity beats reach. And because the citation mix shifts month to month, the work is never \"done.\"",
    },
    {
      id: "small-business-reality",
      number: "06",
      heading: "The small-business and local reality",
      body: `Everything so far applies to businesses of every size. But the squeeze is sharpest, and the opportunity widest, for small and local businesses, because the "2–3 names" math is brutal at the local level.

**"It names one. Maybe two."**

The most important dataset here is SOCi's 2026 Local Visibility Index, which analyzed roughly 350,000 business locations across 2,751 brands (SOCi, Jan 2026):

- **ChatGPT recommends only about 1.2% of local business locations** when asked for a business like yours, compared with 35.9% that appear in Google's traditional local "3-pack." Gemini names about 11%, Perplexity about 7.4%. In other words, when a customer asks ChatGPT for "the best [your category] near me," it names essentially one business, and **98.8% of local businesses never get mentioned at all.**
- **Earning AI local visibility is 3 to 30 times harder than ranking in traditional local search.**
- **Only 45% of the brands that rank in the top 20 of traditional local search also appear in the top 20 of AI recommendations.** Winning on Google no longer guarantees anything in AI.
- **Business-profile information was only about 68% accurate on ChatGPT and Perplexity**, meaning the AI may be giving customers the wrong details about you (SOCi, 2026).

The home-services data is even starker. **An estimated 87% of independent HVAC and plumbing contractors have effectively zero AI citation share**, while a handful of national franchises capture roughly 19% of all consumer-intent citations in the category (5WPR HVAC & Plumbing AI Visibility Index, Q1 2026, via Plumbing & Mechanical). If you are an independent contractor, the AI is, by default, handing your leads to a national chain.

And customers are absolutely asking. **45% of consumers now use AI to find local business recommendations, up from just 6% a year earlier**, making AI the #3 local-discovery channel, ahead of Yelp and TripAdvisor (BrightLocal Local Consumer Review Survey, Mar 2026).

**The levers you actually control**

The local picture is not hopeless. It is the opposite. Because most local competitors are doing nothing, the levers that work are unusually cheap to pull:

- **Reviews.** Vendor research suggests businesses with 50+ recent reviews are roughly 3x more likely to appear in AI recommendations, and 4.5+ star ratings are cited about twice as often (GrowthPro and SOCi data, vendor-sourced, directional). SOCi's higher-confidence data confirms AI-recommended locations averaged 4.3 stars.
- **Accuracy.** Because business-profile data is only ~68% accurate in AI, simply ensuring your name, services, and location are consistent across the web is a real edge.
- **Recency.** AI strongly favors fresh content, and reviews are a constant freshness signal you control.`,
      keyTakeaway:
        "When a customer asks ChatGPT for a local business, it names roughly one, and 98.8% never appear (SOCi, 2026). An estimated 87% of independent HVAC and plumbing firms are invisible in AI (5WPR, 2026), with leads defaulting to national chains. The cheap, controllable levers (reviews, accuracy, recency) are exactly the ones most competitors are ignoring.",
    },
    {
      id: "geo-vs-seo",
      number: "07",
      heading: "GEO vs. SEO, why you need both",
      body: `A tempting conclusion at this point is that GEO is the new thing that replaces SEO. It is not. They work at different moments, and, crucially, **they share the same plumbing**, so the work you do for one largely helps the other.

| | **SEO** | **GEO** |
|---|---|---|
| **Goal** | Rank a page among Google's links | Be named inside an AI-generated answer |
| **The win** | A clickable blue link | A mention in the answer text |
| **Leans on** | Backlinks, keywords | Structured, specific, authoritative, quotable content |
| **Time to impact** | Months to years | Live-retrieval citations can appear in weeks |
| **Failure mode** | Page two (visible) | Not named (invisible) |

The two reinforce each other in three concrete ways:

- **Crawlability.** AI engines reach your site with their own crawlers: GPTBot, ClaudeBot, PerplexityBot, Google-Extended. If these are blocked, or if your pages do not load cleanly, you are invisible to AI for the same reason you would be invisible to Google. One synthesis of 54 citation experiments rated URL accessibility and search rank as the two strongest citation factors (Cyrus Shepard / Zyppy, 2026), both of which are classic SEO fundamentals.
- **Schema and structure.** Clean headings, clear page structure, and schema.org markup help Google understand your pages, and help AI engines parse and quote them. (Realistic note: experiments suggest schema's direct effect on AI citation is modest and engine-dependent; Otterly.ai, 2026; so treat it as good hygiene, not a magic switch.)
- **Freshness.** AI cites fresh pages disproportionately: AI-cited URLs were about 25.7% more recently updated than the top organic results, and ChatGPT cited pages hundreds of days newer than the standard search listing (Ahrefs, ~17M citations, Dec 2025). Publishing and updating regularly feeds both systems.

The honest framing: **most small businesses have done some SEO and almost no GEO.** That gap is the opening. You are not being asked to outspend big brands. You are being asked to be more specific, better-sourced, and more present where AI looks, and to make sure the technical foundations let the engines read you at all.`,
      keyTakeaway:
        "GEO does not replace SEO. It sits on the same foundations. Crawlability, clean structure, schema, and fresh content feed both. Fixing your technical plumbing improves your Google rankings *and* your odds of being cited by AI at the same time.",
    },
    {
      id: "what-to-do",
      number: "08",
      heading: "What to do now: a starter checklist (and an honest promise)",
      body: `Enough diagnosis. Here is a concrete starter checklist any business owner can begin this week, ordered roughly by impact-per-effort.

**1. Find out where you actually stand.** You cannot fix what you cannot see. Ask ChatGPT, Gemini, Perplexity, and Claude the exact buyer-intent questions your customers would ask ("best [your category] in [your city]," "[your category] for [specific situation]") and write down whether you appear, who does, and whether the details are right. This single exercise is sobering and clarifying.

**2. Unblock the crawlers.** Check that GPTBot, ClaudeBot, PerplexityBot, and Google-Extended are not blocked in your robots.txt, and that your key pages load fast and clean. If AI engines cannot read your site, nothing else matters.

**3. Fix your factual footprint.** Make your business name, services, hours, and location identical everywhere they appear. Inconsistent or wrong data is why AI gets you wrong 1-in-3 times (SOCi, 2026).

**4. Claim and feed your review profiles.** Get onto the review platforms relevant to your category, and ask happy customers for recent reviews. Recency and volume are levers you directly control.

**5. Publish specific, sourced, opinionated content, consistently.** Apply the Princeton findings: include a real statistic, quote a credible source, take a clear point of view, and answer *one* question per piece completely. "Three deductions freelancers in Portugal miss" gets cited; "tax planning is important" does not. Post these on your own site *and* on LinkedIn.

**6. Re-check, and keep going.** Where AI looks changes month to month. Re-run step 1 on a schedule and keep publishing. The work compounds, early citations tend to become defaults.

**An honest promise**

We will tell you plainly what GEO **can** and **cannot** do, because the field is full of people who will not.

**GEO cannot guarantee you will be cited.** Anyone promising a guaranteed spot in ChatGPT is selling snake oil. AI answers vary by phrasing, by engine, by day, and by what is freshly indexed. We will never claim otherwise.

**What GEO reliably does:** certain content and technical practices are measurably more likely to earn citations than others (that is the entire Princeton finding), and being absent from the sources AI draws on *guarantees* you will not be cited. GEO improves your odds and your share of the answer. A realistic timeline: act on the fundamentals and publish consistently, and you can expect movement on narrow, niche queries after roughly four weeks; broad, competitive queries take longer. The work compounds, which is precisely why starting now beats waiting.`,
      keyTakeaway:
        "Start with what you control: see where you stand, unblock the crawlers, fix your facts, feed your reviews, and publish specific sourced content consistently. No honest provider guarantees a citation, but absence guarantees invisibility, and the practices that improve your odds are proven and within reach.",
    },
    {
      id: "ozvor-fits",
      number: "09",
      heading: "How Ozvor fits",
      body: `Everything in this whitepaper is something a determined owner could do by hand: run the prompts across five engines, track who gets named, audit crawlers and schema, benchmark competitors, and keep it all current as the ground shifts. The catch is that last part: *keep it all current.* Doing it once is a weekend project. Doing it every week, across five engines, for your business and your competitors, is a job. That is the job **Ozvor** exists to do.

Here is the path, and it starts free.

**Step 1: The free AI Visibility Test.** In a couple of minutes, with no credit card, run one real prompt and see who AI names. Sign up free to unlock the full 10-prompt snapshot across all 5 engines, benchmarked against a competitor, with your **Ozvor AI Visibility Score** made of three parts: **Visibility** (how often AI names you), **Citation Readiness** (can engines read and trust your site), and **Execution** (how many fixes you have shipped). The free tier covers 1 brand and 1 competitor.

**Step 2: The Get-Cited Kit ($29).** The Kit turns the diagnosis into action: your top fixes, ranked by impact and effort, three ready-to-publish drafts (a blog post, a LinkedIn post, and an FAQ entry, each with schema.org markup) written to follow the citation-worthy traits from Section 4, plus this whitepaper as your manual for the *why*.

**Step 3: Ongoing monitoring (Growth & Agency).** Because where AI looks changes constantly, a one-time snapshot goes stale. The subscription plans re-run your probes every week, track your Ozvor AI Visibility Score over time, and surface any competitor gains or engine drops on your dashboard, plus keep feeding you the next content drafts to publish:

- **Growth: $99/mo** (or **$831/yr** with founder pricing): 1 brand, 10 competitors, 250 prompts, weekly monitoring, citation tracking, and GEO content.
- **Agency: $249/mo** (or **$2,091/yr** with founder pricing): up to 25 brands, white-label reports, and client workflow, built for agencies and multi-location operators.
- **Founder pricing** is 30% off, annual only, for the first 100 customers.

For done-for-you execution, where our team publishes and keeps improving it for you, there is **[OrganicPosts by Ozvor](/organicposts)**, our consultancy arm.

The sequence is deliberate, and the first step costs nothing: **see where you stand free, act on the Kit, then keep the gains compounding instead of going stale.** Start at [ozvor.com](https://ozvor.com), or reach us at [hello@ozvor.com](mailto:hello@ozvor.com).`,
      keyTakeaway:
        "Start with the free AI Visibility Test to see exactly where you stand across five engines, no credit card. The $29 Get-Cited Kit turns that into action; Growth ($99/mo) and Agency ($249/mo) keep you monitored as the ground shifts. Founder pricing: 30% off, annual, first 100 only.",
    },
  ],

  sources: `**Academic / primary research**
- Aggarwal et al., "GEO: Generative Engine Optimization" (Princeton / Georgia Tech / Allen Institute for AI / IIT Delhi), KDD 2024, arXiv:2311.09735
- Kaiser & Schulze, "ChatGPT Referrals to E-Commerce Websites," *Marketing Science* (INFORMS)
- Pew Research Center, "Google users are less likely to click links when an AI summary appears," Jul 2025

**Adoption, scale & zero-click**
- OpenAI ChatGPT 900M WAU, via TechCrunch and Search Engine Land, Feb 2026; ~2.5B prompts/day via Axios, Jul 2025
- Alphabet: AI Overviews 2B+ monthly users (Q2 2025 earnings); Gemini 750M MAU
- SparkToro / Rand Fishkin, 2026 zero-click study (~68% of US searches), Jun 2026
- Gartner, "search engine volume to drop 25% by 2026" forecast, Feb 2024
- Eight Oh Two consumer study (37% start with AI), Nov 2025; Bain & Company (44%), 2026; Fractl via Search Engine Land, 2026

**Funnel, conversion & lead impact**
- Microsoft Clarity, AI traffic sign-up study (1,277 domains), Nov 2025
- Adobe Analytics, AI retail traffic conversion & engagement (1T+ visits), Q1 2026
- Forrester 2026 Buyer Insights (94% of B2B buyers use AI), Jan 2026
- Seer Interactive, AI Overview citation & click study (+120%), Apr 2026
- G2 "Answer Economy," via Demand Gen Report, Mar 2026
- Amsive, "Does LLM traffic convert better than organic?" (no significant difference), 2026

**Where AI cites from & citation mechanics**
- Profound, Reddit & AI search (4B+ citations); Peec AI top-cited domains, via Search Engine Land, Mar 2026
- Semrush: LinkedIn AI visibility study; Quora in Google AI Mode; most-cited domains study, 2025–26
- Ahrefs: top-cited domains; "67% off-limits citations," Sep 2025; fresh-content study (~17M citations), Dec 2025
- Cyrus Shepard / Zyppy, AI citation ranking factors, 2026; Otterly.ai schema experiment, 2026

**SMB & local**
- SOCi 2026 Local Visibility Index (~350k locations / 2,751 brands), Jan 2026
- BrightLocal Local Consumer Review Survey 2026, Mar 2026
- 5WPR HVAC & Plumbing AI Visibility Index, Q1 2026
- SE Ranking, review platforms in AI Overviews, 2025–26; GrowthPro AI, 2026 (vendor, directional)

**Market & marketer adoption**
- BrightEdge, "68% of marketers embracing the AI search shift," Jun 2025; HubSpot AI-visibility tracking data, 2025

*Platform user counts are self-reported by the companies; survey figures carry the usual sampling caveats. Single-vendor conversion multipliers are flagged as directional. AI behavior is non-deterministic: the same prompt can yield different answers on different days and engines.*`,

  plansCta: {
    heading: "Your Kit is a snapshot. AI search moves every week.",
    body: "The Get-Cited Kit shows you where you stand today. It gives you three fixes and three drafts to act on. But AI answers change constantly. New competitors get cited, engines re-index, and your fixes start (or stop) working. A one-time audit can't tell you whether you're gaining or losing ground. That's what the subscription Plans do. They track your Ozvor AI Visibility Score over time. They re-run your probes every week. Your dashboard then shows any competitor gains or engine drops. And they keep feeding you the next content drafts to publish. Growth ($99/mo, or $831/yr founder pricing) covers weekly monitoring for one brand. Agency ($249/mo, or $2,091/yr founder pricing) adds more brands and competitor tracking. Knock out your three fixes first. Then keep the gains compounding instead of going stale.",
    buttonLabel: "See Growth & Agency plans",
  },
};

// ---------------------------------------------------------------------------
// Print CSS (strips chrome for clean PDF output)
// ---------------------------------------------------------------------------

const PRINT_CSS = `
  @media print {
    .mk-navbar, footer[aria-label="Site footer"], .noprint { display: none !important; }
    .geo-guide { max-width: 100% !important; padding: 0 !important; }
    .geo-guide a[href]::after { content: ""; }
    body { background: #fff !important; }
  }
`;

// ---------------------------------------------------------------------------
// JSON-LD structured data
// ---------------------------------------------------------------------------

const ARTICLE_LD_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://ozvor.com/resources/what-is-geo-search",
      headline:
        "Understanding GEO Search — How AI Engines Decide Which Businesses to Name",
      description:
        "What Generative Engine Optimization (GEO) is, why it matters for small businesses, the peer-reviewed Princeton research that proved it, and a concrete starter checklist.",
      author: { "@type": "Organization", name: "Ozvor" },
      publisher: {
        "@type": "Organization",
        name: "Ozvor",
        url: "https://ozvor.com",
      },
      datePublished: "2026-06-01",
      dateModified: "2026-06-24",
      inLanguage: "en",
      url: "https://ozvor.com/resources/what-is-geo-search",
      about: {
        "@type": "Thing",
        name: "Generative Engine Optimization",
      },
      citation: [
        {
          "@type": "ScholarlyArticle",
          name: "GEO: Generative Engine Optimization",
          author: "Aggarwal et al.",
          url: "https://arxiv.org/abs/2311.09735",
          datePublished: "2024",
        },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is GEO (Generative Engine Optimization)?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "GEO — Generative Engine Optimization — is the practice of structuring your online presence so AI answer engines like ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews are more likely to name your business when someone asks a question your business can answer. SEO gets you a link. GEO gets you mentioned inside the AI's answer.",
          },
        },
        {
          "@type": "Question",
          name: "How do AI engines decide which businesses to cite?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "AI engines cite businesses whose content most directly and credibly answers the question asked. A peer-reviewed Princeton study (KDD 2024) found that adding quotations from credible sources (+41% visibility lift), concrete statistics (+33%), and authoritative citations (+28%, up to +115% for an underdog page) are the most effective tactics. Keyword stuffing backfired at −8.7%.",
          },
        },
        {
          "@type": "Question",
          name: "How is GEO different from SEO?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "SEO aims to rank a page in Google's index so users click a blue link. GEO aims to be named inside an AI-generated answer. GEO leans on structured, specific, authoritative content rather than backlinks and keywords. Live-retrieval GEO impact can appear in weeks; SEO typically takes months to years. They share the same technical foundations — crawlability, schema, fresh content — so fixing one often helps the other.",
          },
        },
        {
          "@type": "Question",
          name: "Can GEO guarantee my business will be cited by ChatGPT?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. Anyone promising a guaranteed spot in ChatGPT or Perplexity is selling snake oil. AI answers vary by phrasing, by engine, by day, and by what is freshly indexed. What GEO reliably does is improve your odds: the practices that earn citations are measurably more effective than not using them, as the Princeton study showed. Being absent from the sources AI draws on guarantees you will not be cited.",
          },
        },
        {
          "@type": "Question",
          name: "How often does AI cite local businesses?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Very rarely. SOCi's 2026 Local Visibility Index analyzed 350,000 business locations and found ChatGPT recommends only about 1.2% of local business locations when asked for a local business — compared to 35.9% appearing in Google's traditional '3-pack'. Earning AI local visibility is 3 to 30 times harder than ranking in traditional local search.",
          },
        },
      ],
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Home",
          item: "https://ozvor.com",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Resources",
          item: "https://ozvor.com/resources",
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "Understanding GEO Search",
          item: "https://ozvor.com/resources/what-is-geo-search",
        },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function WhatIsGeoSearchPage(): React.ReactElement {
  return (
    <article
      className="geo-guide"
      style={{
        maxWidth: "760px",
        margin: "0 auto",
        padding: "var(--space-12) var(--space-4) var(--space-20)",
        fontFamily: "var(--font-family)",
        color: "var(--color-text)",
      }}
    >
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(ARTICLE_LD_DATA) }}
      />

      {/* Branded header */}
      <header
        style={{
          marginBottom: "var(--space-8)",
          borderBottom: "1px solid var(--color-border)",
          paddingBottom: "var(--space-6)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--space-4)",
            flexWrap: "wrap",
            marginBottom: "var(--space-5)",
          }}
        >
          <Logo markSize={30} wordSize="1.0625rem" />
          <span
            style={{
              fontSize: "var(--font-size-caption)",
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--color-primary)",
            }}
          >
            {WHITEPAPER.badge}
          </span>
        </div>

        <h1
          style={{
            fontSize: "clamp(1.9rem, 4.5vw, 2.75rem)",
            fontWeight: 800,
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
            margin: "0 0 var(--space-3) 0",
          }}
        >
          {WHITEPAPER.title}
        </h1>
        <p
          style={{
            fontSize: "var(--font-size-body)",
            color: "var(--color-muted)",
            lineHeight: 1.6,
            margin: "0 0 var(--space-5) 0",
          }}
        >
          {WHITEPAPER.subtitle}
        </p>

        {/* Intro / callout block */}
        <blockquote
          style={{
            margin: "0 0 var(--space-5) 0",
            padding: "var(--space-4)",
            borderLeft: "4px solid var(--color-primary)",
            backgroundColor: "var(--color-surface-muted)",
            borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
          }}
        >
          <p
            style={{
              fontSize: "var(--font-size-body-sm)",
              lineHeight: 1.7,
              margin: 0,
              fontStyle: "italic",
            }}
          >
            <strong>Who this is for.</strong> You run a real business. You are not a
            marketer, you do not have a &ldquo;growth team,&rdquo; and until recently
            the most you ever thought about search was making sure your Google listing
            had the right phone number. This whitepaper explains (in plain English,
            with real numbers and named sources) the single biggest shift in how
            customers find businesses since Google itself.
          </p>
        </blockquote>

        {/* Download actions */}
        <div
          className="noprint"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "var(--space-3)",
            alignItems: "center",
          }}
        >
          <a
            href="/downloads/Understanding-GEO-Search.pdf"
            download
            aria-label="Download Understanding GEO Search whitepaper as PDF (14 pages)"
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: "44px",
              padding: "0 var(--space-5)",
              backgroundColor: "var(--color-primary)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-md)",
              fontWeight: 700,
              fontSize: "var(--font-size-body-sm)",
              textDecoration: "none",
              fontFamily: "var(--font-family)",
            }}
          >
            ↓ Download PDF (14 pages)
          </a>
        </div>
      </header>

      {/* Table of contents */}
      <nav
        aria-label="Whitepaper table of contents"
        className="noprint"
        style={{
          marginBottom: "var(--space-8)",
          padding: "var(--space-4) var(--space-5)",
          backgroundColor: "var(--color-surface-muted)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
        }}
      >
        <p
          style={{
            fontSize: "var(--font-size-caption)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            color: "var(--color-primary)",
            margin: "0 0 var(--space-3) 0",
          }}
        >
          Table of contents
        </p>
        <ol
          style={{
            margin: 0,
            padding: "0 0 0 var(--space-5)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-1)",
          }}
        >
          {WHITEPAPER.sections.map((s) => (
            <li key={s.id} style={{ fontSize: "var(--font-size-body-sm)" }}>
              <a
                href={`#${s.id}`}
                style={{
                  color: "var(--color-primary)",
                  textDecoration: "none",
                }}
              >
                {s.number}. {s.heading}
              </a>
            </li>
          ))}
          <li style={{ fontSize: "var(--font-size-body-sm)" }}>
            <a
              href="#sources"
              style={{
                color: "var(--color-primary)",
                textDecoration: "none",
              }}
            >
              10. Sources and further reading
            </a>
          </li>
        </ol>
      </nav>

      {/* Sections */}
      {WHITEPAPER.sections.map((s) => (
        <section key={s.id} id={s.id} style={{ marginBottom: "var(--space-8)" }}>
          <h2
            style={{
              fontSize: "clamp(1.1rem, 2.5vw, 1.35rem)",
              fontWeight: 800,
              letterSpacing: "-0.01em",
              margin: "0 0 var(--space-4) 0",
              lineHeight: 1.2,
            }}
          >
            <span
              style={{
                color: "var(--color-primary)",
                marginRight: "var(--space-2)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {s.number}
            </span>
            {s.heading}
          </h2>
          <div style={{ fontSize: "var(--font-size-body-sm)" }}>
            <ResourceMarkdown body={s.body} h2Tag="h3" />
          </div>
          {s.keyTakeaway && (
            <p
              style={{
                margin: "var(--space-3) 0 0 0",
                padding: "var(--space-3) var(--space-4)",
                borderLeft: "4px solid var(--color-primary)",
                backgroundColor: "var(--color-surface-muted)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--font-size-body-sm)",
                fontWeight: 700,
                lineHeight: 1.5,
              }}
            >
              Key takeaway: {s.keyTakeaway}
            </p>
          )}
        </section>
      ))}

      {/* Sources */}
      <section id="sources" style={{ marginBottom: "var(--space-8)" }}>
        <h2
          style={{
            fontSize: "clamp(1.1rem, 2.5vw, 1.35rem)",
            fontWeight: 800,
            letterSpacing: "-0.01em",
            margin: "0 0 var(--space-4) 0",
          }}
        >
          <span style={{ color: "var(--color-primary)", marginRight: "var(--space-2)" }}>
            10
          </span>
          Sources and further reading
        </h2>
        <div
          style={{
            fontSize: "var(--font-size-caption)",
            color: "var(--color-muted)",
            lineHeight: 1.7,
          }}
        >
          <ResourceMarkdown body={WHITEPAPER.sources} h2Tag="h3" />
        </div>
      </section>

      {/* Soft CTA nudge — free test */}
      <div className="noprint" style={{ marginBottom: "var(--space-6)" }}>
        <SoftCTA
          headline="Ready to see your own GEO score?"
          subline="The AI Visibility Test runs one real probe per engine, you see exactly who AI recommends in your category."
          primary={{ label: "Run the free test", href: "/test" }}
          secondary={{ label: "Full playbook in the $29 Get-Cited Kit →", href: "/kit" }}
        />
      </div>

      {/* Plans CTA */}
      <section
        className="noprint"
        style={{
          marginBottom: "var(--space-6)",
          padding: "var(--space-6)",
          border: "2px solid var(--color-primary)",
          borderRadius: "var(--radius-lg)",
          backgroundColor: "var(--color-surface)",
        }}
      >
        <h2
          style={{
            fontSize: "var(--font-size-h2)",
            fontWeight: 800,
            margin: "0 0 var(--space-2) 0",
          }}
        >
          {WHITEPAPER.plansCta.heading}
        </h2>
        <p
          style={{
            fontSize: "var(--font-size-body-sm)",
            color: "var(--color-muted)",
            lineHeight: 1.7,
            margin: "0 0 var(--space-4) 0",
          }}
        >
          {WHITEPAPER.plansCta.body}
        </p>
        <Link
          href="/pricing"
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: "48px",
            padding: "0 var(--space-6)",
            backgroundColor: "var(--color-primary)",
            color: "#fff",
            borderRadius: "var(--radius-md)",
            fontWeight: 800,
            fontSize: "var(--font-size-body)",
            textDecoration: "none",
          }}
        >
          {WHITEPAPER.plansCta.buttonLabel} →
        </Link>
      </section>

      {/* Footer note */}
      <p
        style={{
          fontSize: "var(--font-size-caption)",
          color: "var(--color-muted)",
          lineHeight: 1.6,
          margin: 0,
        }}
      >
        © 2026 Ozvor · ozvor.com · hello@ozvor.com
        <br />
        The Get-Cited Kit, Part 2 of 3. Part 1: your Ozvor AI Visibility Score report. Part 3:
        your three ready-to-publish drafts.
      </p>
    </article>
  );
}
