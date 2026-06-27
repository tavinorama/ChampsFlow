/**
 * Landing page v6 — TrustIndex AI / Ozvor
 * Route: / (within (marketing) route group)
 *
 * Rebuilt to match the Ozvor design mockup:
 *  11 sections in order:
 *   1. Hero — eyebrow + H1 + subopy + CTAs + trust ticks + dashboard mock
 *   2. Engines strip
 *   3. Stats (3 cards)
 *   4. Search Moved (the shift)
 *   5. The Ladder (Free → Kit → Plans → OrganicPosts)
 *   6. Inside the Platform (Audit / Benchmark / Plan)
 *   7. Who it's for
 *   8. Privacy-first
 *   9. Building in public
 *  10. FAQ (details/summary, first item open)
 *  11. Final CTA
 *
 * Static rendering: no dynamic data. Server Component — no "use client".
 */

import type { Metadata } from "next";
import Link from "next/link";
import { StickyBuyBar } from "../../components/marketing/StickyBuyBar";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "Ozvor — Audit + Execute your GEO strategy",
  description:
    "The AI Search Visibility + GEO execution platform for SMBs. Ozvor shows where your brand stands across ChatGPT, Claude, Perplexity, Gemini & Google AI, why competitors win, and turns the gaps into publish-ready fixes — with your TrustIndex AI Score.",
  alternates: { canonical: "https://ozvor.com/" },
  openGraph: {
    title: "Ozvor — Audit + Execute your GEO strategy",
    description:
      "The AI Search Visibility + GEO execution platform for SMBs. Ozvor shows where your brand stands across ChatGPT, Claude, Perplexity, Gemini & Google AI, why competitors win, and turns the gaps into publish-ready fixes — with your TrustIndex AI Score.",
    url: "https://ozvor.com/",
    siteName: "Ozvor",
    images: [
      {
        url: "https://ozvor.com/og-default.png",
        width: 1200,
        height: 630,
        alt: "Ozvor — Know if AI trusts your brand",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ozvor — Audit + Execute your GEO strategy",
    description:
      "When your customer asks ChatGPT for a recommendation, be the answer.",
    images: ["https://ozvor.com/og-default.png"],
  },
};

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Ozvor",
  description:
    "AI Search Trust Intelligence platform for SMBs. Audits brand visibility across ChatGPT, Perplexity, Gemini, and Google AI; benchmarks competitor citations; computes a TrustIndex Score; and builds a GEO content plan for organic AI-search visibility.",
  url: "https://ozvor.com",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: [
    {
      "@type": "Offer",
      name: "Free",
      price: "0",
      priceCurrency: "USD",
      billingIncrement: "P1M",
    },
    {
      "@type": "Offer",
      name: "Growth",
      price: "99",
      priceCurrency: "USD",
      billingIncrement: "P1M",
    },
    {
      "@type": "Offer",
      name: "Agency",
      price: "249",
      priceCurrency: "USD",
      billingIncrement: "P1M",
    },
  ],
  creator: {
    "@type": "Organization",
    name: "Ozvor",
    url: "https://ozvor.com",
  },
};

// ---------------------------------------------------------------------------
// FAQ data
// ---------------------------------------------------------------------------

const faqs = [
  {
    q: "What exactly is a TrustIndex AI Score?",
    a: "It's a 0–100 composite score measuring how well AI search engines trust and cite your brand. It's built from three vectors: AI (citation rate + position + sentiment across ChatGPT, Claude, Perplexity, Gemini, and Google AI Overview), Performance (technical factors: schema.org markup, AI crawler access, content citation-worthiness), and Brand (off-site authority on the 7 sources AI cites most — Reddit, Wikipedia, LinkedIn, G2, Trustpilot, Crunchbase, YouTube). Every number is measured, not estimated.",
  },
  {
    q: "Isn't this just what Google Search Console already shows?",
    a: "No. Search Console reports Google traffic only — and its AI report only covers AI Overviews on Google. We cover five engines simultaneously (ChatGPT, Claude, Perplexity, Gemini, and Google AI Overview), measure competitor displacement, classify sentiment, and produce a content plan to close your gaps. Search Console tells you what happened on Google; we show you what AI thinks of your brand across the whole answer surface.",
  },
  {
    q: "Will this work with any niche or industry?",
    a: "Yes. The audit sends the buyer prompts your actual customers ask — prompts you define. The platform measures your brand against those prompts across all five engines. It works for local services, B2B SaaS, DTC, agencies, and professional practices equally.",
  },
  {
    q: "Is my content safe? Will you train AI on my data?",
    a: "Never. Your brand data, audit results, and content drafts are never used to train any AI model. All LLM calls use zero-data-retention (ZDR) agreements with Anthropic. We act as a GDPR data processor, not a controller. EU data stays on EU infrastructure.",
  },
  {
    q: "What's OrganicPosts? Is it the same thing?",
    a: "OrganicPosts is the consultancy arm — a managed engagement where our team builds your AI-visibility project with you. The platform (Free / Kit / Plans) is self-serve: you run it yourself. OrganicPosts is for founders and marketers who'd rather hand off the research, content creation, and publishing cadence to a team. It's the top rung of the ladder.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      {/* Page-scoped keyframes + responsive overrides */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes ti-pulse { 0%,100% { opacity:.55; } 50% { opacity:1; } }
        @keyframes ti-rise { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        .ti-rise { animation: ti-rise .7s cubic-bezier(.2,.7,.2,1) both; }
        @media (max-width:860px) {
          .ti-grid3 { grid-template-columns:1fr !important; }
          .ti-dash { grid-template-columns:1fr !important; }
          .ti-shift { grid-template-columns:1fr !important; }
          .ti-shift-arrow { justify-self:center !important; transform:rotate(90deg); }
        }
        @media (max-width:860px) {
          .ti-dash > div:first-child { border-right:none !important; border-bottom:1px solid var(--color-border) !important; }
        }
        @media (max-width:520px) {
          .ti-hero-h1 { font-size:40px !important; line-height:1.02 !important; }
        }
        details summary::-webkit-details-marker { display:none; }
        details[open] summary span:last-child { transform: rotate(45deg); transition: transform 0.2s; }
      `}} />

      <StickyBuyBar />

      {/* ── SECTION 1: HERO ─────────────────────────────────────────── */}
      <section style={{
        position:'relative',
        padding:'96px 32px 60px',
        backgroundImage:'radial-gradient(var(--color-border) 1px, transparent 1px)',
        backgroundSize:'32px 32px',
        overflow:'hidden',
      }}>
        {/* top fade overlay */}
        <div style={{position:'absolute',inset:0,background:'radial-gradient(60% 50% at 50% 0%, transparent, var(--color-bg, #0a0f0d) 78%)',pointerEvents:'none'}} aria-hidden="true"/>

        <div style={{position:'relative',maxWidth:'1120px',margin:'0 auto',textAlign:'center'}}>

          {/* Eyebrow pill */}
          <div style={{
            display:'inline-flex',alignItems:'center',gap:9,
            padding:'7px 15px',borderRadius:999,
            border:'1px solid rgba(39,201,138,0.32)',
            background:'rgba(39,201,138,0.07)',
            fontFamily:"'JetBrains Mono',monospace",
            fontSize:11.5,letterSpacing:'0.12em',textTransform:'uppercase',
            color:'var(--color-accent-ink)',
          }}>
            <span style={{width:7,height:7,borderRadius:'50%',background:'#27c98a',
              animation:'ti-pulse 2s infinite',display:'inline-block'}} aria-hidden="true"/>
            AI Search Trust Intelligence · Built for SMBs
          </div>

          {/* H1 */}
          <h1 className="ti-hero-h1" style={{
            margin:'26px auto 0',maxWidth:880,
            fontSize:'clamp(44px,7vw,86px)',lineHeight:0.98,
            fontWeight:800,letterSpacing:'-0.035em',color:'var(--color-text)',
          }}>
            Know if AI trusts your brand.<br/>
            <span style={{
              background:'linear-gradient(120deg,#3ad79a,#0e8a59)',
              WebkitBackgroundClip:'text',backgroundClip:'text',color:'transparent',
            }}>Then fix it.</span>
          </h1>

          {/* Subcopy */}
          <p style={{
            margin:'24px auto 0',maxWidth:600,
            fontSize:19,lineHeight:1.55,color:'var(--color-muted)',
          }}>
            Ozvor audits how your brand shows up across ChatGPT, Perplexity, Gemini &amp; Google AI, benchmarks your rivals, and turns the gaps into fixes you can publish.
          </p>

          {/* CTAs */}
          <div style={{display:'flex',gap:14,justifyContent:'center',flexWrap:'wrap',marginTop:36}}>
            <Link href="/test" style={{
              display:'inline-flex',alignItems:'center',gap:9,
              background:'linear-gradient(135deg,#27c98a,#0c7d54)',
              color:'#06140e',fontFamily:"'Schibsted Grotesk',sans-serif",
              fontSize:16,fontWeight:700,padding:'15px 26px',
              borderRadius:12,border:'none',textDecoration:'none',
              boxShadow:'0 10px 32px rgba(39,201,138,0.32)',
            }}>
              Run the free AI Visibility Test →
            </Link>
            <Link href="/pricing" style={{
              background:'var(--color-surface-muted)',border:'1px solid var(--color-border)',
              color:'var(--color-text)',fontFamily:"'Schibsted Grotesk',sans-serif",
              fontSize:16,fontWeight:600,padding:'15px 26px',
              borderRadius:12,textDecoration:'none',display:'inline-block',
            }}>
              See plans — from $99/mo
            </Link>
          </div>

          {/* Trust ticks */}
          <div style={{display:'flex',gap:22,justifyContent:'center',flexWrap:'wrap',marginTop:26,fontSize:13.5,color:'var(--color-muted)'}}>
            <span style={{display:'inline-flex',gap:7,alignItems:'center'}}><span style={{color:'#27c98a'}}>✓</span> 30-day money-back</span>
            <span style={{display:'inline-flex',gap:7,alignItems:'center'}}><span style={{color:'#27c98a'}}>✓</span> No auto-publish, ever</span>
            <span style={{display:'inline-flex',gap:7,alignItems:'center'}}><span style={{color:'#27c98a'}}>✓</span> Privacy-first by design</span>
          </div>

          {/* Dashboard mock */}
          <div className="ti-rise" style={{
            margin:'56px auto 0',maxWidth:920,
            borderRadius:16,border:'1px solid var(--color-border)',
            background:'var(--color-surface)',
            boxShadow:'0 40px 100px rgba(0,0,0,0.55)',
            overflow:'hidden',textAlign:'left',
          }}>
            {/* Browser chrome bar */}
            <div style={{
              display:'flex',alignItems:'center',gap:8,
              padding:'13px 16px',
              borderBottom:'1px solid var(--color-border)',
              background:'var(--color-surface-muted)',
            }}>
              <span style={{width:11,height:11,borderRadius:'50%',background:'#f0584e',display:'inline-block'}} aria-hidden="true"/>
              <span style={{width:11,height:11,borderRadius:'50%',background:'#f5bd4f',display:'inline-block'}} aria-hidden="true"/>
              <span style={{width:11,height:11,borderRadius:'50%',background:'#54c860',display:'inline-block'}} aria-hidden="true"/>
              <span style={{marginLeft:14,fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:'var(--color-muted)'}}>app.ozvor.com/brands/acme-crm</span>
            </div>
            {/* Dashboard grid */}
            <div className="ti-dash" style={{display:'grid',gridTemplateColumns:'0.9fr 1.1fr',gap:0}}>
              {/* Left: gauge + bars */}
              <div style={{padding:'30px 28px',borderRight:'1px solid var(--color-border)'}}>
                <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--color-muted)'}}>Acme CRM · 50 AI probes · 5 engines</div>
                <div style={{display:'flex',alignItems:'center',gap:22,marginTop:22}}>
                  {/* Conic gauge */}
                  <div role="img" aria-label="TrustIndex AI Score: 64 out of 100" style={{
                    position:'relative',width:128,height:128,borderRadius:'50%',
                    background:'conic-gradient(#27c98a 0% 64%, var(--color-border) 64% 100%)',
                    display:'grid',placeItems:'center',flexShrink:0,
                  }}>
                    <div style={{
                      width:96,height:96,borderRadius:'50%',
                      background:'var(--color-surface)',
                      display:'grid',placeItems:'center',
                    }}>
                      <div style={{textAlign:'center'}}>
                        <div style={{fontSize:34,fontWeight:800,color:'var(--color-text)',lineHeight:1}}>64</div>
                        <div style={{fontSize:11,color:'var(--color-muted)'}}>/ 100</div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div style={{fontSize:13,color:'var(--color-muted)'}}>Overall</div>
                    <div style={{fontSize:15,fontWeight:700,color:'var(--color-text)'}}>TrustIndex AI Score</div>
                    <div style={{marginTop:8,fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:'var(--color-accent-ink)'}}>▲ +6 this week</div>
                  </div>
                </div>
                {/* Score bars */}
                <div style={{marginTop:24,display:'flex',flexDirection:'column',gap:13}}>
                  {[{label:'AI',val:58,w:'58%',bar:'linear-gradient(90deg,#27c98a,#0c7d54)'},{label:'Performance',val:71,w:'71%',bar:'linear-gradient(90deg,#27c98a,#0c7d54)'},{label:'Brand',val:49,w:'49%',bar:'linear-gradient(90deg,#e6a93f,#b9791f)'}].map(s=>(
                    <div key={s.label}>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:12.5,color:'var(--color-muted)'}}>
                        <span>{s.label}</span><span style={{color:'var(--color-text)',fontWeight:600}}>{s.val}</span>
                      </div>
                      <div style={{marginTop:5,height:6,borderRadius:3,background:'var(--color-border)'}}>
                        <div style={{height:6,width:s.w,borderRadius:3,background:s.bar}} aria-hidden="true"/>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Right: competitor list + fix */}
              <div style={{padding:'30px 28px'}}>
                <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--color-muted)'}}>Who AI recommends instead of you</div>
                <div style={{marginTop:18,display:'flex',flexDirection:'column',gap:10}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'13px 15px',borderRadius:11,background:'rgba(240,88,78,0.08)',border:'1px solid rgba(240,88,78,0.18)'}}>
                    <span style={{fontWeight:600,color:'var(--color-text)'}}>Competitor A</span>
                    <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:13,color:'#f0847c'}}>cited 6 / 10</span>
                  </div>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'13px 15px',borderRadius:11,background:'var(--color-surface-muted)',border:'1px solid var(--color-border)'}}>
                    <span style={{fontWeight:600,color:'var(--color-text)'}}>Competitor B</span>
                    <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:13,color:'var(--color-muted)'}}>cited 4 / 10</span>
                  </div>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'13px 15px',borderRadius:11,background:'rgba(39,201,138,0.08)',border:'1px solid rgba(39,201,138,0.28)'}}>
                    <span style={{fontWeight:700,color:'var(--color-text)'}}>Acme CRM (you)</span>
                    <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:13,color:'var(--color-accent-ink)'}}>cited 2 / 10</span>
                  </div>
                </div>
                <div style={{marginTop:18,padding:'14px 15px',borderRadius:11,border:'1px dashed rgba(39,201,138,0.35)',background:'rgba(39,201,138,0.05)'}}>
                  <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10.5,letterSpacing:'0.08em',textTransform:'uppercase',color:'var(--color-accent-ink)'}}>Recommended fix</div>
                  <div style={{marginTop:5,fontSize:13.5,color:'var(--color-muted)',lineHeight:1.45}}>Publish a comparison page + 2 LinkedIn proof posts. Est. +9 score in 30 days.</div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── SECTION 2: ENGINES STRIP ─────────────────────────────────── */}
      <section style={{padding:'44px 32px',borderTop:'1px solid var(--color-border)',borderBottom:'1px solid var(--color-border)'}}>
        <div style={{maxWidth:1080,margin:'0 auto',textAlign:'center'}}>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11.5,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--color-muted)'}}>
            We measure every AI engine your buyers actually use
          </div>
          <div style={{display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap',marginTop:20}}>
            {['ChatGPT','Claude','Perplexity','Gemini','Google AI Overview'].map(e=>(
              <span key={e} style={{padding:'9px 17px',borderRadius:10,border:'1px solid var(--color-border)',background:'var(--color-surface-muted)',fontWeight:600,fontSize:14.5,color:'var(--color-muted)'}}>
                {e}
              </span>
            ))}
          </div>
          <div style={{marginTop:22,fontFamily:"'JetBrains Mono',monospace",fontSize:11.5,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--color-muted)'}}>
            …and the high-authority sources they cite most
          </div>
          <div style={{display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap',marginTop:14}}>
            {['Reddit','Wikipedia','LinkedIn','G2','Trustpilot','Crunchbase','YouTube'].map(s=>(
              <span key={s} style={{padding:'6px 13px',borderRadius:999,fontSize:13,color:'var(--color-muted)',border:'1px solid var(--color-border)'}}>
                {s}
              </span>
            ))}
          </div>
          <p style={{margin:'26px auto 0',maxWidth:560,fontSize:14.5,color:'var(--color-muted)'}}>
            Google&apos;s own report covers Google only. <span style={{color:'var(--color-text)'}}>We cover the whole AI-answer surface.</span>
          </p>
        </div>
      </section>

      {/* ── SECTION 3: STATS ─────────────────────────────────────────── */}
      <section style={{padding:'72px 32px'}}>
        <div className="ti-grid3" style={{maxWidth:1080,margin:'0 auto',display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:20}}>
          {[
            {n:'900M',label:'weekly ChatGPT users',src:'OpenAI, Feb 2026'},
            {n:'2.5B',label:'AI prompts per day',src:'OpenAI, 2026'},
            {n:'+35%',label:'higher organic CTR for AI-cited pages (AIO queries)',src:'Seer Interactive, 2026'},
          ].map(st=>(
            <div key={st.n} style={{padding:'30px 26px',borderRadius:16,border:'1px solid var(--color-border)',background:'var(--color-surface)'}}>
              <div style={{fontSize:48,fontWeight:800,letterSpacing:'-0.03em',background:'linear-gradient(120deg,#3ad79a,#0e8a59)',WebkitBackgroundClip:'text',backgroundClip:'text',color:'transparent',fontFamily:"'JetBrains Mono',monospace"}}>
                {st.n}
              </div>
              <div style={{marginTop:8,fontSize:15,fontWeight:600,color:'var(--color-text)'}}>{st.label}</div>
              <div style={{marginTop:10,fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:'var(--color-muted)'}}>{st.src}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── SECTION 4: SEARCH MOVED ──────────────────────────────────── */}
      <section style={{padding:'72px 32px',borderTop:'1px solid var(--color-border)'}}>
        <div style={{maxWidth:1000,margin:'0 auto'}}>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11.5,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--color-accent-ink)',textAlign:'center'}}>The shift</div>
          <h2 style={{margin:'14px auto 0',maxWidth:720,textAlign:'center',fontSize:'clamp(30px,4.4vw,46px)',fontWeight:800,letterSpacing:'-0.03em',lineHeight:1.05,color:'var(--color-text)'}}>
            Search moved. Most businesses haven&apos;t noticed yet.
          </h2>
          <div className="ti-shift" style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',gap:18,alignItems:'stretch',marginTop:44}}>
            {/* Before */}
            <div style={{display:'flex',flexDirection:'column',padding:24,borderRadius:14,border:'1px solid var(--color-border)',background:'var(--color-surface-muted)'}}>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:'var(--color-muted)'}}>2 YEARS AGO · GOOGLE</div>
              <div style={{marginTop:10,fontSize:15,color:'var(--color-muted)'}}>&quot;best accountant for freelancers berlin&quot;</div>
              <div style={{marginTop:16,display:'flex',flexDirection:'column',gap:14}}>
                <div>
                  <div style={{fontSize:14,fontWeight:600,color:'#6ea8ff',lineHeight:1.2}}>Müller &amp; Partner — Tax advisors Berlin</div>
                  <div style={{fontSize:11,color:'#7fbf8f'}}>muellerpartner.de › steuerberatung</div>
                  <div style={{marginTop:2,fontSize:12,color:'var(--color-muted)',lineHeight:1.4}}>Full-service Steuerberatung for SMEs and the self-employed in Berlin-Mitte…</div>
                </div>
                <div>
                  <div style={{fontSize:14,fontWeight:600,color:'#6ea8ff',lineHeight:1.2}}>Top 10 accountants for freelancers (2024)</div>
                  <div style={{fontSize:11,color:'#7fbf8f'}}>freelance-blog.de › best-accountants</div>
                </div>
              </div>
              <div style={{marginTop:'auto',paddingTop:14,fontSize:12.5,color:'var(--color-muted)'}}>→ 10 blue links you scroll &amp; compare yourself</div>
            </div>
            {/* Arrow */}
            <div className="ti-shift-arrow" style={{display:'grid',placeItems:'center',width:42,height:42,borderRadius:'50%',background:'linear-gradient(135deg,#27c98a,#0c7d54)',color:'#06140e',fontSize:20,fontWeight:800,flexShrink:0}} aria-hidden="true">→</div>
            {/* After */}
            <div style={{display:'flex',flexDirection:'column',padding:24,borderRadius:14,border:'1px solid rgba(39,201,138,0.30)',background:'rgba(39,201,138,0.06)'}}>
              <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:'var(--color-accent-ink)'}}>TODAY · CHATGPT · PERPLEXITY · GEMINI</div>
              <div style={{marginTop:10,fontSize:15,color:'var(--color-muted)'}}>&quot;best accountant for freelancers berlin&quot;</div>
              <div style={{marginTop:16,fontSize:16,lineHeight:1.55,color:'var(--color-text)'}}>
                &quot;The best accountant for Berlin freelancers is <strong style={{color:'var(--color-accent-ink)'}}>Muster GmbH</strong> — they specialize in digital nomads and post weekly LinkedIn guides on freelance taxes.&quot;
              </div>
              <div style={{marginTop:'auto',paddingTop:14,fontSize:12.5,color:'var(--color-muted)'}}>→ one answer, one name recommended</div>
            </div>
          </div>
          <p style={{margin:'34px auto 0',maxWidth:760,textAlign:'center',fontSize:16,lineHeight:1.6,color:'var(--color-muted)'}}>
            And now — <strong style={{color:'var(--color-text)'}}>Google too.</strong> AI Mode passed <strong style={{color:'var(--color-text)'}}>1 billion monthly users</strong> and AI Overviews appear in <strong style={{color:'var(--color-text)'}}>25%+ of searches</strong>. The channel everyone already trusts is now an answer engine — so the only question is whether that answer includes you.
          </p>
          <div style={{textAlign:'center',marginTop:22}}>
            <Link href="/blog" style={{background:'none',border:'none',fontSize:15,fontWeight:600,color:'var(--color-accent-ink)',textDecoration:'none'}}>
              Read the full GEO research guide →
            </Link>
          </div>
        </div>
      </section>

      {/* ── SECTION 5: THE LADDER ────────────────────────────────────── */}
      <section style={{
        position:'relative',
        padding:'84px 32px 90px',
        background:'radial-gradient(100% 60% at 50% 100%, rgba(230,169,63,0.08), transparent 55%)',
      }}>
        <div style={{maxWidth:980,margin:'0 auto'}}>
          <div style={{textAlign:'center'}}>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11.5,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--color-accent-ink)'}}>One continuous path</div>
            <h2 style={{margin:'14px auto 0',maxWidth:680,fontSize:'clamp(30px,4.6vw,48px)',fontWeight:800,letterSpacing:'-0.03em',lineHeight:1.04,color:'var(--color-text)'}}>
              Start free. Climb only when you&apos;re ready.
            </h2>
            <p style={{margin:'18px auto 0',maxWidth:580,fontSize:17,lineHeight:1.55,color:'var(--color-muted)'}}>
              Four rungs, one outcome: your brand getting cited by AI. You start hands-on with the tools — we step in to do it <em style={{color:'var(--color-gold-ink,#e6c07a)',fontStyle:'normal',fontWeight:600}}>with</em> you at the top.
            </p>
          </div>

          {/* YOU DO IT band */}
          <div style={{marginTop:46,display:'flex',alignItems:'center',gap:14}}>
            <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,letterSpacing:'0.14em',textTransform:'uppercase',color:'var(--color-accent-ink)'}}>You do it</span>
            <span style={{flex:1,height:1,background:'linear-gradient(90deg,rgba(39,201,138,0.4),transparent)'}} aria-hidden="true"/>
          </div>

          {/* Ladder rungs with vertical connector */}
          <div style={{position:'relative',marginTop:22,paddingLeft:46}}>
            {/* Emerald→gold connector line */}
            <div style={{
              position:'absolute',left:17,top:8,bottom:8,width:2,
              background:'linear-gradient(180deg,#27c98a 0%,#27c98a 62%,#e6a93f 100%)',
            }} aria-hidden="true"/>

            {/* Rung 1: Free */}
            <div style={{position:'relative',marginBottom:16}}>
              <span style={{
                position:'absolute',left:-46,top:18,
                display:'grid',placeItems:'center',
                width:36,height:36,borderRadius:'50%',
                background:'rgba(39,201,138,0.14)',
                border:'2px solid #27c98a',
                fontFamily:"'JetBrains Mono',monospace",fontWeight:600,fontSize:14,
                color:'var(--color-accent-ink)',zIndex:2,
              }}>01</span>
              <div style={{
                display:'flex',alignItems:'center',gap:20,flexWrap:'wrap',
                padding:'22px 24px',borderRadius:15,
                border:'1px solid rgba(39,201,138,0.30)',
                background:'rgba(39,201,138,0.06)',
              }}>
                <div style={{flex:1,minWidth:240}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                    <span style={{fontSize:19,fontWeight:700,color:'var(--color-text)'}}>Free AI Visibility Test</span>
                    <span style={{
                      fontFamily:"'JetBrains Mono',monospace",fontSize:10,letterSpacing:'0.08em',
                      textTransform:'uppercase',padding:'3px 8px',borderRadius:5,
                      background:'rgba(39,201,138,0.16)',color:'var(--color-accent-ink)',
                    }}>Free forever</span>
                  </div>
                  <div style={{marginTop:7,fontSize:14.5,lineHeight:1.5,color:'var(--color-muted)'}}>
                    Run one buyer prompt. See how your brand compares to competitors across ChatGPT, Perplexity, Gemini and Google AI — in 60 seconds.
                  </div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:22,fontWeight:800,color:'var(--color-accent-ink)'}}>$0</div>
                  <Link href="/test" style={{
                    marginTop:8,display:'inline-block',
                    fontFamily:"'Schibsted Grotesk',sans-serif",fontSize:13.5,fontWeight:700,
                    padding:'9px 16px',borderRadius:9,border:'none',
                    background:'linear-gradient(135deg,#27c98a,#0c7d54)',
                    color:'#06140e',textDecoration:'none',
                  }}>Run the test →</Link>
                </div>
              </div>
            </div>

            {/* Rung 2: Kit $29 */}
            <div style={{position:'relative',marginBottom:16}}>
              <span style={{
                position:'absolute',left:-46,top:18,
                display:'grid',placeItems:'center',
                width:36,height:36,borderRadius:'50%',
                background:'rgba(39,201,138,0.10)',
                border:'2px solid rgba(39,201,138,0.5)',
                fontFamily:"'JetBrains Mono',monospace",fontWeight:600,fontSize:14,
                color:'var(--color-accent-ink)',zIndex:2,
              }}>02</span>
              <div style={{
                display:'flex',alignItems:'center',gap:20,flexWrap:'wrap',
                padding:'22px 24px',borderRadius:15,
                border:'1px solid var(--color-border)',
                background:'var(--color-surface)',
              }}>
                <div style={{flex:1,minWidth:240}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                    <span style={{fontSize:19,fontWeight:700,color:'var(--color-text)'}}>The Get-Cited Kit</span>
                    <span style={{
                      fontFamily:"'JetBrains Mono',monospace",fontSize:10,letterSpacing:'0.08em',
                      textTransform:'uppercase',padding:'3px 8px',borderRadius:5,
                      background:'rgba(39,201,138,0.12)',color:'var(--color-accent-ink,#5fdfa8)',
                    }}>One-time</span>
                  </div>
                  <div style={{marginTop:7,fontSize:14.5,lineHeight:1.5,color:'var(--color-muted)'}}>
                    Full audit + top-3 actionable fixes + 3 ready-to-publish content drafts with schema. A complete playbook you own forever.
                  </div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:22,fontWeight:800,color:'var(--color-text)'}}>$29</div>
                  <Link href="/kit" style={{
                    marginTop:8,display:'inline-block',
                    fontFamily:"'Schibsted Grotesk',sans-serif",fontSize:13.5,fontWeight:700,
                    padding:'9px 16px',borderRadius:9,border:'none',
                    background:'linear-gradient(135deg,#27c98a,#0c7d54)',
                    color:'#06140e',textDecoration:'none',
                  }}>Get the Kit →</Link>
                </div>
              </div>
            </div>

            {/* Rung 3: Plans from $99 */}
            <div style={{position:'relative',marginBottom:0}}>
              <span style={{
                position:'absolute',left:-46,top:18,
                display:'grid',placeItems:'center',
                width:36,height:36,borderRadius:'50%',
                background:'rgba(39,201,138,0.10)',
                border:'2px solid rgba(39,201,138,0.5)',
                fontFamily:"'JetBrains Mono',monospace",fontWeight:600,fontSize:14,
                color:'var(--color-accent-ink,#5fdfa8)',zIndex:2,
              }}>03</span>
              <div style={{
                display:'flex',alignItems:'center',gap:20,flexWrap:'wrap',
                padding:'22px 24px',borderRadius:15,
                border:'1px solid var(--color-border)',
                background:'var(--color-surface)',
              }}>
                <div style={{flex:1,minWidth:240}}>
                  <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                    <span style={{fontSize:19,fontWeight:700,color:'var(--color-text)'}}>Growth &amp; Agency Plans</span>
                    <span style={{
                      fontFamily:"'JetBrains Mono',monospace",fontSize:10,letterSpacing:'0.08em',
                      textTransform:'uppercase',padding:'3px 8px',borderRadius:5,
                      background:'rgba(39,201,138,0.12)',color:'var(--color-accent-ink,#5fdfa8)',
                    }}>Monthly/annual</span>
                  </div>
                  <div style={{marginTop:7,fontSize:14.5,lineHeight:1.5,color:'var(--color-muted)'}}>
                    Weekly automated monitoring, competitor benchmarking, full content studio, and the GEO content plan — done by the platform, every Monday.
                  </div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:22,fontWeight:800,color:'var(--color-text)'}}>from $99</div>
                  <Link href="/pricing" style={{
                    marginTop:8,display:'inline-block',
                    fontFamily:"'Schibsted Grotesk',sans-serif",fontSize:13.5,fontWeight:700,
                    padding:'9px 16px',borderRadius:9,border:'none',
                    background:'linear-gradient(135deg,#27c98a,#0c7d54)',
                    color:'#06140e',textDecoration:'none',
                  }}>See plans →</Link>
                </div>
              </div>
            </div>
          </div>

          {/* Transition divider */}
          <div style={{margin:'8px 0 8px 46px',display:'flex',alignItems:'center',gap:14}}>
            <span style={{flex:1,height:1,background:'linear-gradient(90deg,transparent,rgba(230,169,63,0.5))'}} aria-hidden="true"/>
            <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--color-gold-ink,#e6c07a)'}}>Where you stop doing it alone →</span>
            <span style={{flex:1,height:1,background:'linear-gradient(90deg,rgba(230,169,63,0.5),transparent)'}} aria-hidden="true"/>
          </div>

          {/* OrganicPosts summit card — gold gradient border */}
          <div style={{
            position:'relative',marginTop:18,borderRadius:18,
            padding:2,
            background:'linear-gradient(135deg,#e6a93f,#b9791f,#27c98a)',
          }}>
            <div style={{
              borderRadius:16,padding:'34px 32px',
              background:'var(--color-surface)',
              display:'flex',alignItems:'center',gap:28,flexWrap:'wrap',
            }}>
              <div style={{flex:1,minWidth:280}}>
                <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                  <span style={{
                    fontFamily:"'JetBrains Mono',monospace",fontSize:10,letterSpacing:'0.1em',
                    textTransform:'uppercase',padding:'4px 9px',borderRadius:6,
                    background:'rgba(230,169,63,0.16)',color:'var(--color-gold-ink,#e6c07a)',
                  }}>Done with you · the summit</span>
                </div>
                <h3 style={{margin:'14px 0 0',fontSize:27,fontWeight:800,letterSpacing:'-0.02em',color:'var(--color-text)'}}>
                  OrganicPosts
                </h3>
                <p style={{margin:'10px 0 0',maxWidth:460,fontSize:15.5,lineHeight:1.55,color:'var(--color-muted)'}}>
                  When you&apos;d rather not run it yourself: our team builds your AI-visibility project with you — research, content, publishing cadence and monitoring, done as a managed engagement.
                </p>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:'var(--color-muted)'}}>Managed engagement</div>
                <div style={{fontSize:20,fontWeight:800,color:'var(--color-gold-ink,#e6c07a)'}}>Let&apos;s scope it</div>
                <Link href="/organicposts" style={{
                  marginTop:10,display:'inline-block',
                  fontFamily:"'Schibsted Grotesk',sans-serif",fontSize:14,fontWeight:700,
                  padding:'12px 22px',borderRadius:11,border:'none',
                  background:'linear-gradient(135deg,#e6a93f,#b9791f)',
                  color:'#1a1305',textDecoration:'none',
                  boxShadow:'0 10px 28px rgba(230,169,63,0.28)',
                }}>Explore OrganicPosts →</Link>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── SECTION 6: INSIDE THE PLATFORM ───────────────────────────── */}
      <section style={{padding:'80px 32px',borderTop:'1px solid var(--color-border)'}}>
        <div style={{maxWidth:1080,margin:'0 auto'}}>
          <div style={{textAlign:'center'}}>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11.5,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--color-accent-ink)'}}>Inside the platform</div>
            <h2 style={{margin:'14px auto 0',maxWidth:640,fontSize:'clamp(28px,4.2vw,44px)',fontWeight:800,letterSpacing:'-0.03em',lineHeight:1.06,color:'var(--color-text)'}}>
              Audit. Benchmark. Plan &amp; publish.
            </h2>
            <p style={{margin:'16px auto 0',maxWidth:560,fontSize:16.5,color:'var(--color-muted)'}}>
              From &quot;are we even in AI answers?&quot; to a published plan that gets you cited.
            </p>
          </div>
          <div className="ti-grid3" style={{marginTop:46,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:20}}>
            {[
              {num:'01',title:'Audit',body:'We send 50 buyer prompts across all five AI engines and measure how often your brand is cited, where you appear, and how competitors outrank you.'},
              {num:'02',title:'Benchmark',body:'See exactly which competitors AI recommends instead of you, their citation rate by engine, and the content gap that explains the difference.'},
              {num:'03',title:'Plan & publish',body:'The platform writes a prioritized GEO content plan — blog posts, FAQ schemas, LinkedIn drafts — tailored to close your specific citation gaps.'},
            ].map(s=>(
              <div key={s.num} style={{padding:'28px 26px',borderRadius:16,border:'1px solid var(--color-border)',background:'var(--color-surface)'}}>
                <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:13,color:'#27c98a'}}>{s.num}</div>
                <h3 style={{margin:'12px 0 0',fontSize:20,fontWeight:700,color:'var(--color-text)'}}>{s.title}</h3>
                <p style={{margin:'10px 0 0',fontSize:14.5,lineHeight:1.55,color:'var(--color-muted)'}}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 7: WHO IT'S FOR ───────────────────────────────────── */}
      <section style={{padding:'80px 32px'}}>
        <div style={{maxWidth:1080,margin:'0 auto'}}>
          <div style={{textAlign:'center'}}>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11.5,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--color-accent-ink)'}}>Who it&apos;s for</div>
            <h2 style={{margin:'14px auto 0',maxWidth:600,fontSize:'clamp(28px,4.2vw,44px)',fontWeight:800,letterSpacing:'-0.03em',lineHeight:1.06,color:'var(--color-text)'}}>
              Built for businesses that win on trust.
            </h2>
          </div>
          <div className="ti-grid3" style={{marginTop:46,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:20}}>
            {[
              {who:'Local & professional services',pain:'I tried blogging for years but ChatGPT never mentions my clinic.',fix:'Audit your current AI presence, benchmark the practice two blocks over, and publish the FAQ content that earns citations.'},
              {who:'Boutique agencies',pain:"My clients ask why their competitors show up in AI answers and they don't. I have no answer.",fix:'Run multi-brand audits from one Agency account, surface the gap, and deliver a citation plan per client.'},
              {who:'Funded B2B SaaS & DTC',pain:'Our SEO is solid but AI search treats us as if we don\'t exist.',fix:'Measure your AI citation rate across all five engines, detect which competitor is winning AI share-of-voice, and fix the content gaps.'},
            ].map(p=>(
              <div key={p.who} style={{padding:'28px 26px',borderRadius:16,border:'1px solid var(--color-border)',background:'var(--color-surface)'}}>
                <div style={{fontSize:17,fontWeight:700,color:'var(--color-text)'}}>{p.who}</div>
                <div style={{marginTop:14,padding:'14px 15px',borderRadius:11,background:'rgba(240,88,78,0.07)',border:'1px solid rgba(240,88,78,0.16)',fontSize:14,lineHeight:1.5,color:'#d6b8b3',fontStyle:'italic'}}>
                  &quot;{p.pain}&quot;
                </div>
                <div style={{marginTop:14,fontSize:14.5,lineHeight:1.55,color:'var(--color-muted)'}}>
                  <span style={{color:'var(--color-accent-ink)',fontWeight:700}}>→ </span>{p.fix}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 8: PRIVACY-FIRST ─────────────────────────────────── */}
      <section style={{padding:'80px 32px',borderTop:'1px solid var(--color-border)'}}>
        <div style={{maxWidth:1080,margin:'0 auto'}}>
          <div style={{textAlign:'center'}}>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11.5,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--color-accent-ink)'}}>Privacy-first by architecture</div>
            <h2 style={{margin:'14px auto 0',maxWidth:640,fontSize:'clamp(28px,4.2vw,42px)',fontWeight:800,letterSpacing:'-0.03em',lineHeight:1.06,color:'var(--color-text)'}}>
              Your data is protected by design, not by promise.
            </h2>
          </div>
          <div className="ti-grid3" style={{marginTop:46,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:20}}>
            {[
              {icon:'🔒',title:'No training on your data',body:'We never use your brand data, audit results, or content to train AI models. Your prompts go to providers with zero-data-retention (ZDR) agreements only.'},
              {icon:'✓',title:'Draft-and-confirm by design',body:'No content is ever published without your explicit approval. Every AI-generated draft is reviewed by you before it goes anywhere.'},
              {icon:'§',title:'GDPR processor role',body:'We act as a data processor, not a controller, for your brand data. Full DPA available. EU data stays on EU infrastructure (eu-central-1).'},
            ].map(pr=>(
              <div key={pr.title} style={{padding:'28px 26px',borderRadius:16,border:'1px solid var(--color-border)',background:'var(--color-surface)'}}>
                <div style={{display:'grid',placeItems:'center',width:40,height:40,borderRadius:11,background:'rgba(39,201,138,0.12)',border:'1px solid rgba(39,201,138,0.28)',color:'var(--color-accent-ink)',fontSize:18}}>
                  {pr.icon}
                </div>
                <h3 style={{margin:'16px 0 0',fontSize:17,fontWeight:700,color:'var(--color-text)'}}>{pr.title}</h3>
                <p style={{margin:'9px 0 0',fontSize:14,lineHeight:1.55,color:'var(--color-muted)'}}>{pr.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 9: BUILDING IN PUBLIC ────────────────────────────── */}
      <section style={{padding:'80px 32px'}}>
        <div style={{maxWidth:900,margin:'0 auto',borderRadius:18,border:'1px solid var(--color-border)',background:'var(--color-surface)',padding:'42px 40px',textAlign:'center'}}>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11.5,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--color-accent-ink)'}}>Building in public</div>
          <h2 style={{margin:'14px auto 0',maxWidth:580,fontSize:'clamp(26px,3.6vw,38px)',fontWeight:800,letterSpacing:'-0.03em',lineHeight:1.08,color:'var(--color-text)'}}>
            We run Ozvor on ourselves — every Monday.
          </h2>
          <p style={{margin:'16px auto 0',maxWidth:560,fontSize:16,lineHeight:1.55,color:'var(--color-muted)'}}>
            The best way to prove a GEO platform works is to dog-food it publicly. We publish our own audit scores across all five engines weekly — no spin, no cherry-picked snapshots. As we ship improvements, you watch the numbers move.
          </p>
          <div style={{display:'flex',gap:16,justifyContent:'center',flexWrap:'wrap',marginTop:28}}>
            {[
              {label:'Current TrustIndex Score',val:'72'},
              {label:'Weeks since launch',val:'8'},
              {label:'Score improvement',val:'+28'},
            ].map(l=>(
              <div key={l.label} style={{minWidth:150,padding:'18px 22px',borderRadius:13,border:'1px solid var(--color-border)',background:'var(--color-surface-muted)'}}>
                <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,letterSpacing:'0.1em',textTransform:'uppercase',color:'var(--color-muted)'}}>{l.label}</div>
                <div style={{marginTop:8,fontSize:26,fontWeight:800,color:'var(--color-accent-ink)',fontFamily:"'JetBrains Mono',monospace"}}>{l.val}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 10: FAQ ───────────────────────────────────────────── */}
      <section style={{padding:'80px 32px',borderTop:'1px solid var(--color-border)'}}>
        <div style={{maxWidth:780,margin:'0 auto'}}>
          <div style={{textAlign:'center'}}>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11.5,letterSpacing:'0.12em',textTransform:'uppercase',color:'var(--color-accent-ink)'}}>FAQ</div>
            <h2 id="faq-heading" style={{margin:'14px auto 0',fontSize:'clamp(28px,4vw,42px)',fontWeight:800,letterSpacing:'-0.03em',color:'var(--color-text)'}}>
              Questions we get asked.
            </h2>
          </div>
          <div style={{marginTop:40,display:'flex',flexDirection:'column',gap:10}}>
            {faqs.map((f,i)=>(
              <details key={f.q} open={i===0} style={{borderRadius:13,border:'1px solid var(--color-border)',background:'var(--color-surface)',overflow:'hidden'}}>
                <summary style={{
                  width:'100%',display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,
                  textAlign:'left',cursor:'pointer',
                  padding:'20px 22px',
                  fontFamily:"'Schibsted Grotesk',sans-serif",fontSize:16.5,fontWeight:600,color:'var(--color-text)',
                  listStyle:'none',
                }}>
                  <span>{f.q}</span>
                  <span style={{flexShrink:0,fontSize:20,color:'var(--color-accent-ink)'}} aria-hidden="true">+</span>
                </summary>
                <div style={{padding:'0 22px 22px',fontSize:14.5,lineHeight:1.6,color:'var(--color-muted)'}}>
                  {f.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 11: FINAL CTA ─────────────────────────────────────── */}
      <section style={{
        position:'relative',
        padding:'96px 32px',
        background:'radial-gradient(100% 80% at 50% 0%, rgba(39,201,138,0.14), transparent 60%)',
        textAlign:'center',
        overflow:'hidden',
      }}>
        <div style={{maxWidth:720,margin:'0 auto'}}>
          <h2 style={{fontSize:'clamp(32px,5vw,56px)',fontWeight:800,letterSpacing:'-0.035em',lineHeight:1.02,color:'var(--color-text)'}}>
            Your competitors aren&apos;t doing this yet.
          </h2>
          <p style={{margin:'20px auto 0',maxWidth:520,fontSize:18,color:'var(--color-muted)'}}>
            Run your free AI Visibility Test in 60 seconds. See the gap today — no credit card.
          </p>
          <div style={{display:'flex',gap:14,justifyContent:'center',flexWrap:'wrap',marginTop:34}}>
            <Link href="/test" style={{
              background:'linear-gradient(135deg,#27c98a,#0c7d54)',
              color:'#06140e',
              fontFamily:"'Schibsted Grotesk',sans-serif",
              fontSize:16,fontWeight:700,padding:'15px 28px',
              borderRadius:12,border:'none',textDecoration:'none',display:'inline-block',
              boxShadow:'0 10px 32px rgba(39,201,138,0.32)',
            }}>Run the free test →</Link>
            <Link href="/pricing" style={{
              background:'var(--color-surface-muted)',border:'1px solid var(--color-border)',
              color:'var(--color-text)',
              fontFamily:"'Schibsted Grotesk',sans-serif",
              fontSize:16,fontWeight:600,padding:'15px 28px',
              borderRadius:12,textDecoration:'none',display:'inline-block',
            }}>See plans</Link>
          </div>
        </div>
      </section>
    </>
  );
}
