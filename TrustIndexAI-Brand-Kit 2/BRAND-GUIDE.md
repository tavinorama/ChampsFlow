# TrustIndex AI — Brand Guide

_Version 1.0 · 2026-06-13_

The visual identity for **TrustIndex AI** (the AI Search Trust Intelligence
platform) and **OrganicPosts by TrustIndex AI** (the consultancy arm). The system
is warm, approachable, and credible — built to feel human and trustworthy to
small-business owners, not corporate or "AI-generated".

---

## 1. Logo

The mark is a friendly rounded square with **three ascending bars** (the rising
TrustIndex Score / "index going up") and a warm **amber spark** (the AI signal).
It ties directly to the product: the 3-vector score.

**Files (in `/logo`):**
| File | Use |
|---|---|
| `logo-full-light-bg.svg` | Primary lockup on light backgrounds |
| `logo-full-dark-bg.svg` | Lockup on dark backgrounds |
| `logo-mark-color.svg` | Mark only (green) — app icons, social avatars |
| `logo-mark-white.svg` | Mono white — over photos / dark color |
| `logo-mark-black.svg` | Dark tile — light backgrounds needing contrast |
| `favicon/favicon.svg` | Browser favicon |

**Wordmark:** "Trust" (weight 600) + "**Index**" (weight 800) read as one word;
"**AI**" in brand green. Tight tracking (-0.015em). Never re-space or recolor the
parts arbitrarily.

**Clear space:** keep at least the height of the mark's corner radius (≈ 1/3 of
the mark) clear on all sides. **Minimum size:** mark 20px; full lockup 120px wide.

**Don'ts:** don't stretch, rotate, add shadows/gradients, recolor the mark green-on-
green, place the color mark on a busy photo (use the white mark), or swap the font.

---

## 2. Color

### Core (warm / approachable)
| Token | Hex | Use |
|---|---|---|
| Friendly Green (Primary) | `#0A7E5A` | Brand, buttons, links, mark |
| Green (hover) | `#086A4C` | Hover/active |
| Amber (Accent) | `#E0982F` | The spark, small highlights |
| Proof Green (Success) | `#0C8A63` | Positive states |
| Ink (Text) | `#1A1712` | Body text, headlines |
| Muted | `#6E665A` | Secondary text |

### Surfaces
| Token | Hex | Use |
|---|---|---|
| Page background | `#FCFAF5` | Warm off-white canvas |
| Surface | `#FFFFFF` | Cards |
| Surface muted (cream) | `#FBF7F0` | Inset/muted panels |
| Border | `#ECE5D9` | Hairlines, card borders |
| Dark surface | `#0E1A14` | Dark hero/CTA, dark mode |
| Charcoal (stat/footer) | `#16231C` | Deep contrast bands |

### Dark mode
Primary becomes a brighter green `#34D399`; surfaces use `#0E1A14`.

### Data-viz ramp (categorical — score breakdown only)
AI `#2563EB` · Performance `#7C3AED` · Brand `#0FB488`. These are intentionally
distinct from the brand green so the three score vectors stay readable.

**Contrast:** Primary `#0A7E5A` passes WCAG AA on white for text and on-button
white text. Never use brand green for body text on cream below ~16px without
checking contrast.

---

## 3. Typography
- **Marketing site:** Plus Jakarta Sans (self-hosted; GDPR-friendly).
- **App / product:** Geist Sans.
- **Weights:** 400 body · 600 emphasis · 700–800 headlines & wordmark.
- **Headlines:** tight tracking (-0.03em), `text-wrap: balance`.
- **Long-form (policies, articles):** justified with `hyphens: auto`.

---

## 4. Imagery & motifs
- **GEO citation graph:** thin connected nodes (sources & brands) with a few
  highlighted green/amber nodes = "how AI connects sources and chooses who to
  cite". Used as a subtle backdrop (see `assets/` motif in the site).
- **Score ring & 3 bars:** the product's signature visual; reuse for hero mockups.
- **Always self-hosted, lightweight (SVG), and performance-first** — no external
  stock photos, no layout shift, decorative imagery is `aria-hidden`.

---

## 5. Voice
Direct, specific, helpful — never hype. We say "increase the probability",
"directional", "evidence-based" — **never** "guaranteed citation" (AI is
non-deterministic; FTC/LGPD). We tell people what is substantiated and what isn't.

---

## 6. Naming
- **TrustIndex AI** — the platform. One word "TrustIndex" + "AI".
- **OrganicPosts by TrustIndex AI** — the consultancy (one word "OrganicPosts").
- We are **not** "Trustindex.io" (a separate review-widget company) — always
  distinguish.
