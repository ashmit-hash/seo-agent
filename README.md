# SEO Agent

<div align="center">

**An autonomous, AI-powered SEO strategist and blog writing agent.**
Drop in any website URL — the agent scrapes your site, researches competitors, builds a keyword strategy, writes a publication-ready blog post, and delivers a full SEO + GEO optimization package. No paid SERP APIs. No manual research. No fluff.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-seo--agent--app-blue?style=for-the-badge)](https://seo-agent-app-kappa.vercel.app)
[![Next.js](https://img.shields.io/badge/Next.js-16.1.7-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)](https://react.dev/)
[![Gemini](https://img.shields.io/badge/Gemini-2.5%20Flash-4285F4?style=for-the-badge&logo=google)](https://ai.google.dev/)

[🚀 Quick Start](#-installation--setup) · [🗺️ How It Works](#-8-step-workflow) · [⚙️ Configuration](#-environment-variables) · [🐛 Issues](https://github.com/Abhijeetsingh0022/SEO-Agent/issues)

</div>

---

## 📊 At a Glance

| Metric | Value |
|--------|-------|
| Workflow steps | **8 gated stages** |
| Blog post length | **800–1,100 words** (tight, no filler) |
| AI models supported | **4 Gemini models** (switchable from UI) |
| SERP data cost | **$0** (custom DuckDuckGo scraper) |
| Human-in-the-loop gates | **2** (topic selection + blog approval) |
| Two-pass blog generation | **Write → Auto-format → Approve** |
| Price accuracy enforcement | **✅ Price Lock system** |
| Product catalog integration | **✅ Real products from your store** |
| Session persistence | **24-hour auto-resume** |
| Deployment | **Vercel (production-ready)** |

---

## ✨ What Makes This Different

### 🔒 Price Lock System
Most AI blog writers invent made-up price ranges. This agent extracts the **actual ₹ price range** from your live website scrape and enforces it as a hard rule throughout the blog. A brand selling products under ₹800 will never get a blog suggesting ₹15,000 options.

### 🛍️ Real Product Integration
The agent scrapes your product catalog (`/collections/all`, `/shop`, `/products`) and instructs the AI to **mention your actual products by name** inside the blog — not generic placeholders.

### 🔒 Niche Lock
A pattern-matching niche detector reads your scraped homepage data and audit output to identify your exact industry (fashion, food, SaaS, jewellery, home decor, kids products, etc.) before competitor research begins — preventing wrong-industry suggestions.

### ✍️ Two-Pass Blog Generation
1. **Pass 1** — PROMPT_STEP6 writes the raw blog
2. **Pass 2** — PROMPT_STEP6_FORMAT automatically reformats it into proper flowing paragraphs (no poem-style one-sentence-per-line output)
3. **Approval gate** — you review and approve or request revisions before moving forward

### 📅 GEO + March 2026 Algorithm Alignment
Every prompt is anchored to the current date and calibrated to the **March 2026 Core Update**, the **December 2025 E-E-A-T expansion**, and the **February 2026 Discover Core Update**. AI Overviews optimization is built into the SEO layer.

---

## 🗺️ 8-Step Workflow

| Step | Stage | What Happens | Output |
|------|-------|-------------|--------|
| **1** | Brand Audit | Scrapes your homepage + audits niche, tone, audience, content gaps, GEO readiness. Extracts price range. | Strategic site profile + price range |
| **2** | Competitor Intel | Detects your niche, runs 4 targeted SERP searches, identifies top competitor, analyses their latest 5-6 blog posts | Competitive content matrix |
| **3** | Topic Architecture | Generates 10 seasonally-timed blog topics ranked by urgency and commercial relevance | Curated topic list with buyer intent |
| **4** | Keyword Research | Maps 12 high-intent keywords with difficulty scores, AI Overview eligibility, and funnel stage | Full keyword + intent table |
| **5** | Content Blueprint | Detects correct content type (Buying Guide / Educational / Gift Guide / etc.) and builds full section structure | Blog blueprint with tone and opening line |
| **6** | Blog Post | Writes 800–1,100 word blog → auto-formats → shows approval gate. Revision loop available. | Publication-ready blog post |
| **7** | SEO + GEO Layer | Packages meta title, description, URL slug, schema markup, image alt text, internal linking plan, GEO citation score | Full on-page SEO + GEO package |
| **8** | Business Report | Plain-English report explaining the blog's value to the business owner — no jargon | 10-section owner-friendly report |

---

## 🤖 AI Models

All models are powered by **Google's Generative Language API** with **dual API key rotation** (round-robin between `GEMINI_API_KEY` and `GEMINI_API_KEY_2`) for higher rate limits.

| Model | UI Label | Best For |
|-------|----------|----------|
| `gemini-2.5-flash-preview-04-17` | **Gemini 2.5 Flash** ⭐ Default | Best quality, reasoning, long outputs |
| `gemini-2.0-flash` | **Gemini 2.0 Flash** | Fast, cost-efficient |
| `gemini-1.5-pro` | **Gemini 1.5 Pro** | Long context, complex analysis |
| `gemini-1.5-flash` | **Gemini 1.5 Flash** | Fastest, lightweight tasks |

Switch models from the dropdown in the top-left header — no code changes needed.

---

## 🛠️ Technical Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | **Next.js 16.1.7** (App Router, Turbopack) | Full-stack React with API routes |
| Frontend | **React 19** + Vanilla CSS | No Tailwind — hand-crafted styles |
| State | `useReducer` + shadow refs pattern | Stable callbacks, no stale closures |
| Icons | `lucide-react` | Consistent icon system |
| Web Scraping | `cheerio` | DuckDuckGo HTML parsing for SERP + homepage scrape |
| AI | Google Generative Language REST API | `fetch`-based, no SDK bloat |
| Charts | `recharts` | Analytics and progress visualization |
| PDF Export | `jspdf` | Export blog + SEO package as PDF |
| Session | `localStorage` | 24-hour session with auto-resume |
| Deployment | **Vercel** | Production-ready, zero config |

---

## 📁 Project Structure

```
seo-agent/
├── app/
│   ├── api/
│   │   ├── scrape/route.js        # Homepage + product catalog scraper (cheerio)
│   │   ├── serp/route.js          # DuckDuckGo SERP scraper (free, no API key)
│   │   └── seo/route.js           # Main AI route — Gemini API + key rotation
│   ├── globals.css                # All styles (vanilla CSS, no Tailwind)
│   ├── layout.js                  # Root layout + fonts
│   └── page.jsx                   # Entry point
├── components/
│   ├── Header.jsx                 # Model selector dropdown + site pill
│   ├── HeroSection.jsx            # URL input + brand context fields
│   ├── StepCard.jsx               # Per-step output card with gate UI
│   ├── ExportActions.jsx          # PDF / copy export buttons
│   ├── PrivacyNotice.jsx          # Privacy notice component
│   └── ...
├── hooks/
│   └── useSEOWorkflow.js          # Core state machine — all 8 steps + gates
├── lib/
│   ├── constants.js               # All AI prompts (PROMPT_STEP1–8, FORMAT, REVISE)
│   └── qualityAssurance.js        # Blog quality validator
├── .env.local                     # API keys (gitignored)
├── next.config.js
└── package.json
```

---

## ⚙️ Environment Variables

Create a `.env.local` file in the project root:

```env
# Primary Gemini API key (required)
GEMINI_API_KEY=AIzaSy...

# Second Gemini API key for round-robin rotation (optional but recommended)
# Doubles your effective rate limit
GEMINI_API_KEY_2=AIzaSy...
```

Get your free Gemini API key at [Google AI Studio](https://aistudio.google.com/app/apikey).

> **Tip:** Adding a second key (`GEMINI_API_KEY_2`) enables automatic round-robin rotation and significantly reduces rate limit errors on long workflow runs.

---

## 🚀 Installation & Setup

### Prerequisites
- **Node.js v18+** ([download](https://nodejs.org/))
- A **Gemini API key** from [Google AI Studio](https://aistudio.google.com/app/apikey) (free tier available)

### 1. Clone the Repository

```bash
git clone https://github.com/Abhijeetsingh0022/SEO-Agent.git seo-agent
cd seo-agent
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

```bash
# Create .env.local
echo "GEMINI_API_KEY=your_key_here" > .env.local
```

### 4. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — the agent loads immediately.

### 5. Deploy to Vercel (optional)

```bash
npm install -g vercel
vercel --prod
```

Add your environment variables in the Vercel dashboard or via CLI:
```bash
vercel env add GEMINI_API_KEY
vercel env add GEMINI_API_KEY_2
```

---

## 🧑‍💻 How to Use

1. **Enter your website URL** — paste any live website URL (e.g. your Shopify / WordPress store)
2. **Add optional brand context** — fill in Business Category, Key Products, Target Audience for sharper results
3. **Select an AI model** — Gemini 2.5 Flash is recommended; switch from the dropdown anytime
4. **Click Analyse** — the agent runs all 8 steps automatically, pausing only at decision gates
5. **Choose your topic** — at Step 3, pick from 10 AI-generated topics ranked by seasonal urgency
6. **Review keywords** — approve or modify keyword targeting at Step 4
7. **Read the blog** — at Step 6, review the formatted blog. Type `approve` to continue or describe what to change
8. **Export** — download the complete blog + SEO package as PDF or copy to clipboard

---

## 🔑 Key Prompt Engineering Details

### Price Lock (prevents wrong price ranges)
- **Step 1** extracts the actual `₹min – ₹max` price range from scraped homepage data
- **Step 6** receives this as `PRICE RANGE OF THIS BRAND: ₹X – ₹Y (MAX ₹Y)` at the top of `websiteContext`
- A `💰 PRICE LOCK` section in the blog prompt enforces: every price example must be below the brand's maximum
- The SELF-CHECK block verifies price accuracy before output

### Niche Lock (prevents wrong competitor selection)
- 17-pattern regex classifier identifies your niche from scraped homepage + audit text
- Niche label is injected into PROMPT_STEP2, ensuring competitor search queries are industry-specific
- Hard rules prevent jewellery brands from being suggested for non-jewellery sites

### Product Integration (mentions real products)
- Step 6 scrapes `/collections/all`, `/shop`, `/products` from your store before writing
- Real product names are injected into `websiteContext` under `REAL PRODUCTS ON THIS WEBSITE`
- The blog prompt mandates mentioning at least 3–5 actual products by name

### Two-Pass Blog Generation
```
PROMPT_STEP6 → raw blog text
       ↓
PROMPT_STEP6_FORMAT → reformatted (proper paragraphs, no poem-style lines)
       ↓
Approval gate → user approves or requests revision
       ↓ (if revision requested)
PROMPT_STEP6_REVISE → revised blog → PROMPT_STEP6_FORMAT again → gate again
```

### Session Persistence
- Full workflow state saved to `localStorage` every time `stepData` changes
- Sessions expire after **24 hours**
- On next visit, a "Restore Session" prompt lets you continue exactly where you left off

---

## 🗺️ Roadmap

- [ ] **Shopify Integration** — auto-inject blog post directly into Shopify Blog
- [ ] **WordPress Publishing** — REST API push to WP with one click
- [ ] **Multi-language** — generate blogs in Hindi, Tamil, Bengali, and more regional languages
- [ ] **Bulk Mode** — queue multiple URLs for batch blog generation overnight
- [ ] **Internal Linking** — auto-suggest links from your existing published posts
- [ ] **Image Suggestions** — recommend Unsplash / Pexels images per section
- [ ] **Keyword Tracking** — track ranking position changes week over week
- [ ] **Export to .docx** — download blog as a formatted Word document

---

## 🤝 Contributing

Contributions are welcome!

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push to your branch: `git push origin feature/your-feature-name`
5. Open a Pull Request

Please follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages.

---

## 📄 License

MIT © 2026 [Abhijeet Singh](https://github.com/Abhijeetsingh0022)

---

<div align="center">
  <sub>Built with ☕ and too many Gemini API calls</sub>
</div>
