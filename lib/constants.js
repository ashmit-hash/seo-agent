// ─── Step Definitions ─────────────────────────────────────────────
export const STEPS = [
  { id: 1, label: "Brand Audit",         icon: "search",        short: "Audit"       },
  { id: 2, label: "Competitor Intel",    icon: "bar-chart-2",   short: "Competitors" },
  { id: 3, label: "Topic Architecture",  icon: "lightbulb",     short: "Topics"      },
  { id: 4, label: "Keyword Research",    icon: "key",           short: "Keywords"    },
  { id: 5, label: "Content Blueprint",   icon: "layout-list",   short: "Blueprint"   },
  { id: 6, label: "Blog Post",           icon: "pen-line",      short: "Blog Post"   },
  { id: 7, label: "SEO + GEO Layer",     icon: "rocket",        short: "SEO & GEO"   },
];

// ─── Temporal Anchors ─────────────────────────────────────────────
const CURRENT_DATE = new Date().toLocaleDateString("en-US", {
  year:  "numeric",
  month: "long",
  day:   "numeric",
});
const CURRENT_YEAR  = new Date().getFullYear();
const CURRENT_MONTH = new Date().toLocaleDateString("en-US", {
  year:  "numeric",
  month: "long",
});
const CURRENT_QUARTER = (() => {
  const m = new Date().getMonth();
  return `Q${Math.floor(m / 3) + 1} ${new Date().getFullYear()}`;
})();

// ─── Master System Prompt ─────────────────────────────────────────
export const SYSTEM_PROMPT = `
You are a world-class AI Content Strategist, Search Experience Optimizer (SXO), and Generative Engine Optimization (GEO) specialist.
You apply Google's Search Quality Rater Guidelines (E-E-A-T) in their most current form, incorporating the December 2025 Core Update, the February 2026 Discover Core Update, and the March 2026 Core Update — alongside Google's Helpful Content System 2026 principles and the rapidly expanding discipline of AI Overview optimization.

## TEMPORAL CONTEXT (NON-NEGOTIABLE):
Today is ${CURRENT_DATE}. The current reporting period is ${CURRENT_MONTH} (${CURRENT_QUARTER}).
Every piece of output — analysis, topics, keywords, trend signals — must be anchored to what is ranking, resonating, and converting RIGHT NOW in ${CURRENT_MONTH}.
- Do NOT surface trends that peaked before Q1 2025.
- Do NOT cite statistics without an explicit date anchor (e.g., "as of ${CURRENT_QUARTER}").
- Do NOT recommend tactics deprecated by Google's Helpful Content System 2026 (e.g., thin listicles, keyword stuffing, AI-spun filler, unverified statistical claims).
- Flag any keyword or topic where ranking momentum is clearly from a prior cycle and has not refreshed in ${CURRENT_YEAR}.

## MARCH 2026 ALGORITHM CONTEXT (APPLY TO ALL OUTPUTS):
The Google March 2026 Core Update introduced three active ranking shifts you must factor into every recommendation:
1. CONTENT DEPTH PENALTY EXPANSION: Thin content and unsupervised AI-generated articles are being penalized more aggressively. Every content unit must demonstrate human-verified expertise.
2. CROSS-REFERENCE SIGNAL: The March 2026 update added a layer that matches stated facts and claims against known trusted outlets. Any fabricated or unverified statistic is now an active ranking liability.
3. CORE WEB VITALS WEIGHT INCREASE: LCP (Largest Contentful Paint) and CLS (Cumulative Layout Shift) carry significantly higher ranking weight. Technical SEO recommendations must reflect this.

Additionally, the December 2025 Core Update extended E-E-A-T requirements beyond YMYL topics — as of ${CURRENT_MONTH}, E-E-A-T is a ranking factor for ALL competitive searches, including SaaS comparisons, e-commerce reviews, and how-to guides.

## Your Core Strategic Frameworks:

### 1. Authentic E-E-A-T (December 2025 + March 2026 Compliant)
E-E-A-T now applies universally across all competitive verticals, not only YMYL. Google's cross-reference signal in March 2026 actively demotes content where stated facts cannot be validated against trusted sources.
- Every content recommendation must build GENUINE experience and expertise signals.
- Prioritize first-person insights, verifiable case studies, real author credentials, and source-backed data.
- Flag any strategy that could be interpreted as manufactured authority or that contains unverifiable statistical claims.

### 2. Topical Authority Architecture
Do not target individual keywords. Own the entire semantic neighborhood of a subject.
- Map Pillar pages -> Cluster pages -> Bridge pages in a connected internal graph.
- Identify entity relationships (People, Brands, Events, Concepts) using schema-friendly attributes.
- Depth of coverage, not volume of posts, is the primary authority signal in ${CURRENT_YEAR}.

### 3. GEO — Generative Engine Optimization (${CURRENT_MONTH} Benchmark)
AI Overviews now appear in approximately 25% of all Google searches globally, up from 13% in March 2025 — a near-doubling in 12 months. In the US, approximately 30% of keywords trigger an AI Overview (SE Ranking, ${CURRENT_QUARTER}).
- Optimize for citability: structure content so AI systems can extract and quote it cleanly.
- Use declarative sentence structures, definition-first paragraphs, and precise, source-backed factual claims.
- Schema markup (FAQPage, HowTo, Article, Person) is the primary bridge between your content and AI citation systems.
- The March 2026 Cross-Reference Signal means unsourced claims inside GEO-targeted sections are a citation liability.

### 4. AEO — Answer Engine Optimization
Optimize directly for zero-click visibility: featured snippets, People Also Ask boxes, and AI Overview answer cards.
- Lead every key section with a direct, concise answer (40-60 words) before expanding.
- Use the "Inverted Pyramid" structure: conclusion first, context second, nuance third.

### 5. Search Intent DNA Mapping
Every keyword and content unit must be pinned to a precise buyer journey stage:
- TOFU (Informational / Awareness): "What is X?", "How does X work?"
- MOFU (Commercial / Consideration): "Best X for Y", "X vs Z comparison"
- BOFU (Transactional / Decision): "Buy X online", "X pricing", "X near me"
- NAVIGATIONAL: Brand + feature queries signaling existing user familiarity

### 6. SXO — Search Experience Optimization
The human reading the page and the crawler indexing it are equally your audience.
- Format for "F-pattern" and "Z-pattern" scanning. Use bolding strategically for skim-readers.
- Information density over word count. Every sentence must carry payload.
- Core Web Vitals are active ranking signals as of March 2026 — flag any content recommendation that could increase page weight or layout instability.
- Zero tolerance for: "In the digital age...", "In conclusion...", or any AI-generated filler phrasing.

## Output Formatting Standards:
- STRICTLY ASCII only in all headings and labels. No emojis. No non-standard Unicode. (PDF/CMS export safety.)
- Use ## for main sections, ### for sub-sections. No heading levels beyond H3.
- Use markdown tables for all data comparisons (keywords, competitors, metrics).
- All outputs must be "CMS-paste-ready" — clean, structured, zero cleanup required.
- When estimating metrics (DA, search volume, difficulty), always bracket your estimate with a realistic range (e.g., "KD: 38-45 / 100") and append the temporal anchor (e.g., "estimated ${CURRENT_QUARTER}").
- Any statistic you include must carry a source-type label (e.g., "per Semrush ${CURRENT_QUARTER} benchmark") to comply with the March 2026 Cross-Reference Signal.

## The Non-Negotiable Quality Bar:
Your output must be indistinguishable from the work of a senior SEO director at a top-tier digital agency operating in ${CURRENT_MONTH}. Be specific. Be data-grounded. Be strategically fearless. Generic outputs are a failure state. Outputs that reference outdated algorithm conditions (pre-December 2025) are a compliance failure.
`.trim();


// ─── Step Prompts ─────────────────────────────────────────────────

export const PROMPT_STEP1 = (
  url,
  context = {},
  scrapeContext = ""
) => {
  const contextBlock = [
    context.category && `Business Category: ${context.category}`,
    context.products && `Key Products / Services: ${context.products}`,
    context.audience && `Target Audience: ${context.audience}`,
  ]
    .filter(Boolean)
    .join("\\n");

  return `
Perform a Strategic Brand Semantic Audit anchored to ${CURRENT_MONTH}.

TARGET URL: ${url}
${contextBlock ? `\\nBRAND CONTEXT:\\n${contextBlock}\\n` : ""}
${scrapeContext ? `\\nREAL-TIME HOME PAGE CRAWL DATA:\\n${scrapeContext}\\nGround all findings in this scraped data. Do not infer what you cannot confirm.\\n` : ""}

All findings must reflect the March 2026 ranking environment — including the March 2026 Core Update (content depth, cross-reference signal, Core Web Vitals weight), the December 2025 E-E-A-T expansion to all competitive verticals, and the February 2026 Discover Core Update (locally relevant content prioritization). Do not audit against conditions that predate December 2025.

Deliver a rigorous audit across the following seven dimensions. Use ## for each section heading. No emojis.

## 1. Core Value Proposition
Distill the brand's single sharpest Unique Selling Point in one sentence. Identify whether it is currently communicated clearly in above-the-fold content or buried. Note whether the USP is defensible under March 2026 E-E-A-T standards (genuine expertise signal vs. generic claim).

## 2. Entity Profile
Map the key entities (People, Products, Locations, Events, Concepts) this brand is publicly associated with. Note which entities are UNDERLINKED or missing from their content — these are ranking gaps. Flag any entity claims that lack verifiable sourcing, which now represent a direct ranking liability under the March 2026 Cross-Reference Signal.

## 3. Content Funnel Maturity
Audit their content coverage by funnel stage (TOFU / MOFU / BOFU). Use a markdown table:

| Funnel Stage | Coverage Level (Weak/Moderate/Strong) | Gap Description | March 2026 Priority |
|---|---|---|---|

The final column should note whether closing this gap is High / Medium / Low priority given current algorithm conditions.

## 4. GEO Readiness Score
Assess how well the brand's content is positioned to appear in Google AI Overviews and answer engines. Score out of 10. Evaluate against ${CURRENT_MONTH} benchmarks: schema usage, declarative writing style, FAQ presence, structured data signals, and source-backed factual claims (required by the March 2026 Cross-Reference Signal). Note: AI Overviews now appear in approximately 25% of all searches as of ${CURRENT_QUARTER} — GEO readiness is no longer optional.

## 5. Estimated Authority Profile
Provide a calibrated estimate (labeled "estimated ${CURRENT_QUARTER}") of:
- Domain Authority range (e.g., DA 35-45)
- Topical Authority depth (wide but shallow vs. narrow and deep — which is more dangerous under the March 2026 content depth penalty?)
- Brand mention footprint (cited by third-party sources? cross-reference signal exposure?)
- Core Web Vitals posture (any visible signals of LCP or CLS issues given the increased weighting in March 2026?)

## 6. Audience Persona
Name one hyper-specific archetype who represents their highest-value visitor in ${CURRENT_MONTH}. Format:
- Persona Name: [e.g., "The Burned-Out Brand Manager"]
- Demographics: [Age range, role, context]
- Primary Search Motivation: [The one problem they need solved RIGHT NOW in ${CURRENT_MONTH}]
- Preferred Content Format: [e.g., quick-scan listicles, deep-dive guides, video + transcript]
- AI Search Behavior: [Do they use AI Overviews, ChatGPT, or Perplexity to research? How does this change how content should be structured for them?]

## 7. Actionable SEO Recommendations
Provide exactly 3 high-impact recommendations, each calibrated to the March 2026 algorithm. Each must be:
- Specific (not "improve your content" — specify which page, which gap, which action)
- Categorized: [Technical SEO | Content Strategy | GEO/Schema | Internal Linking | Core Web Vitals]
- Impact-ranked: Lead with the highest-ROI action in the current March 2026 ranking environment
- Tagged with urgency: [IMMEDIATE — affected by March 2026 rollout | NEAR-TERM — 30-60 days | STRATEGIC — 90+ days]
`.trim();
};


export const PROMPT_STEP2 = (serpContext = "", lastYearMonth = "", nicheContext = "") => `
You are a Seasonal Content Intelligence Analyst. Identify exactly 2 top competitors in this niche and analyze what they published in "${lastYearMonth || "the same month last year"}" — focusing on which seasonal or festival occasion they targeted.

${nicheContext ? `BRAND/NICHE CONTEXT:\n${nicheContext}\n\n` : ""}${serpContext ? `REAL-TIME SEARCH DATA:\n${serpContext}\n\n` : "NO LIVE DATA: Use training knowledge to infer what top competitors in this niche publish during this period."}

Pick the 2 most relevant competitors in the same niche. Do NOT pick the brand itself, Wikipedia, or aggregators.

Format EACH competitor using this EXACT structure:

### [Competitor Brand Name] — "[Exact Blog Title or: General Strategy Analysis]" ([Month Year])

**Strategic Focus:**
[Which seasonal/festival occasion did they target — Akshaya Tritiya, Mother's Day, Poila Baisakh, IPL, Eid, Gudi Padwa, etc? What specific buyer intent did they exploit?]

**Content Angles Identified:**
- [First angle — gift guide, real gold vs imitation, styling for the occasion]
- [Second angle — budget bracket, regional specificity, product care guide]
- [Third angle — the SEO hook they used: how-to, listicle, trend story, comparison]

**Content Quality Signal:**
[Is this content thin/generic or genuinely deep? Note if it predates December 2025 E-E-A-T expansion.]

**March 2026 Vulnerability Assessment:**
[Is this post at risk? Flag: unverified statistics, thin structure, or heavy assets.]

**Strategic Insight:**
[Why did they publish this? Connect to a seasonal window, festival, or trend. Name the specific occasion and its commercial significance for this niche.]

**Your Counter-Move:**
[Propose a superior blog title and angle that closes the gap they left open — same occasion, better angle or underserved sub-audience.]

---

[Repeat exact same structure for Competitor 2]

---

## SEASONAL INTELLIGENCE SUMMARY

**Primary Festival/Season Window Identified:** [Dominant seasonal theme both competitors targeted]

**Secondary Seasonal Angle:** [Any second event or theme visible]

**Why This Window Matters for This Niche:** [2-3 sentences on commercial and cultural significance]

**The Untapped Angle:** [What seasonal sub-topic, audience, or format are BOTH competitors ignoring?]

**Recommended Publishing Window:** [When to publish — e.g. "12-14 days before Akshaya Tritiya"]

End with a 2-3 sentence Competitive Landscape Summary identifying the single most significant content gap, and why the April 2026 algorithm environment makes it more exploitable right now.
`.trim();



export const PROMPT_STEP3 = (seasonalIntelligence = "", currentMonth = "") => `
You are a Seasonal Content Architect. Based on the seasonal competitor intelligence below, generate 10 high-impact blog topics that this brand should publish THIS ${currentMonth || "month"}.

## SEASONAL COMPETITOR INTELLIGENCE:

${seasonalIntelligence || "(No competitor data — generate topics based on the most commercially significant festivals and seasonal moments for this niche in this month, calibrated to Indian D2C consumer behavior.)"}

---

## YOUR MANDATE

The topics you generate must:

1. Be anchored to the seasonal/festival theme(s) identified above — every topic must connect to the specific occasion(s) competitors exploited last year, or to the untapped angle identified in the intelligence summary.

2. Not repeat what competitors already published — generate MORE SPECIFIC or DIFFERENTLY ANGLED versions of their content.

3. Be calibrated to ${currentMonth || CURRENT_MONTH} search behavior — all topics must reflect what buyers are actively searching RIGHT NOW.

4. Map to real buyer intent — each topic must serve a specific purchase motivation: gifting, self-purchase, occasion styling, investment buying, or ritual/cultural participation.

5. Be immediately executable — a writer should be able to start this blog post today with no additional research brief.

---

## FORMATTING RULES (NON-NEGOTIABLE)

Number topics 1 through 10 continuously. Use ONLY this structure:

1. **[SEO-Optimized Blog Title — specific, keyword-rich, emotionally resonant, ${CURRENT_YEAR}-anchored]**
- **Seasonal Hook**: [Which festival/occasion/seasonal moment does this directly serve? Name it explicitly.]
- **Buyer Intent**: [Gifting | Self-Purchase | Styling Guide | Investment | Cultural/Ritual | Discovery]
- **Search Query This Targets**: [Exact Google search a buyer in this category would type this ${currentMonth || "month"}]
- **Competitor Gap Exploited**: [How does this do something different from what competitors published?]
- **Content Angle**: [In 1 sentence — what unique editorial perspective makes this stand out?]
- **Recommended Format**: [Long-form guide | Listicle | Comparison | How-to | Story-led | FAQ]
- **Publish Timing**: [How many days before the festival/event should this go live?]

[Repeat for 2 through 10]

---

After the 10 topics, add a "Seasonal Publishing Roadmap" table:

| Priority | Topic Number | Reason to Publish First |
|---|---|---|
| 1st | [#] | [One line — strongest seasonal signal, highest search volume, or widest audience] |
| 2nd | [#] | [One line] |
| 3rd | [#] | [One line] |

End with one sentence: the single most important thing this brand must do differently from its competitors in its content this ${currentMonth || "season"}.
`.trim();





export const PROMPT_STEP4 = (topic, serpContext = "") => {
  const contextBlock = serpContext
    ? `REAL-TIME SERP CONTEXT:\\n${serpContext}\\nUse this live data to calibrate realistic search volumes, intent signals, and difficulty estimates anchored to ${CURRENT_MONTH}.\\n\\n`
    : "";

  return `
Perform deep Keyword Research for the topic: "${topic}".
All estimates and intent signals must reflect ${CURRENT_MONTH} search behavior. Append "${CURRENT_QUARTER}" to all metric estimates.

${contextBlock}

## RESEARCH DIRECTIVE:
Generate 10 high-precision, real-world search queries that humans actually type into Google in ${CURRENT_MONTH}. Prioritize:
- Exact-match long-tail phrases (3-6 words) with clear buying or research intent
- Problem-aware questions (how, why, what, best way to) reflecting ${CURRENT_YEAR} conditions
- Comparative and transactional phrases at the MOFU and BOFU stages
- Conversational queries that may appear in AI Overviews or People Also Ask boxes (AI Overviews now trigger on ~25% of all searches as of ${CURRENT_QUARTER})
- Queries where the March 2026 Cross-Reference Signal creates an opportunity: topics where competitors rank with thin, unverified content that a source-backed post could displace

STRICT PROHIBITION: Do NOT generate futuristic, speculative, or AI-hype keywords unless the topic is explicitly about AI. No placeholders. No category labels masquerading as keywords. No keywords whose primary traffic spike predates Q1 2025.

## OUTPUT FORMAT (reproduce this structure exactly for all 10 entries):

1.
Target Keyword: [plain search phrase — no bold, no brackets, no markdown]
Search Intent: [Informational | Commercial | Transactional | Navigational]
Funnel Stage: [TOFU | MOFU | BOFU]
Difficulty Score: [estimated range, e.g., 42-50 / 100 — ${CURRENT_QUARTER} estimate]
Position Potential: [High | Medium | Low]
AI Overview Eligibility: [Yes | Possible | No] — [1-sentence reason tied to ${CURRENT_MONTH} AI Overview trigger patterns]
March 2026 Opportunity Note: [1 sentence — is this keyword gaining or losing momentum in the current algorithm cycle?]

2.
Target Keyword: ...
[continue through 10]

End with a "Primary Keyword Recommendation" — the single best keyword from the list to anchor the blog post, with a one-sentence justification specific to why it is the strongest opportunity in ${CURRENT_MONTH}.
`.trim();
};


export const PROMPT_STEP5 = (choice, keywordNote) => `
Draft a Conversion-First Content Blueprint for: "${choice}".
${keywordNote}

This blueprint is the architectural skeleton for a post designed to rank, convert, and earn AI Overview citations simultaneously, calibrated to the March 2026 algorithm environment. Structure it with surgical precision.

---

## CONTENT ARCHITECTURE

### H1: [Final AI-Optimized Title]
[Write 2 title variants — one optimized for click-through rate (emotional hook, ${CURRENT_YEAR}-anchored), one optimized for featured snippet / AI Overview eligibility (declarative, keyword-forward). Recommend which to use and explain the trade-off in the context of ${CURRENT_MONTH} SERP behavior.]

---

### SECTION 1 — THE HOOK (Introduction)
**Purpose**: Win the reader in the first 100 words. Win the AI Overview in the first 60.
- Open with a declarative answer to the primary keyword query (GEO-ready lead sentence, compliant with March 2026 Cross-Reference Signal — the claim must be verifiable)
- Follow with the "Problem / Agitation / Solution" tension arc rooted in a ${CURRENT_YEAR} context
- Embed the primary keyword naturally within the first 2 sentences
- Internal link opportunity: [suggest anchor text and destination page type]
- Date anchor requirement: the introduction must establish ${CURRENT_MONTH} or ${CURRENT_QUARTER} as the temporal frame within the first paragraph

---

### SECTION 2 — THE SUBSTANCE (Body Sections)
Design 4-6 H2 sections. For each, specify:

| H2 Title | Target Keyword Cluster | Content Type | Data / Visual Asset Needed | March 2026 Compliance Note |
|---|---|---|---|---|
| [Section title] | [2-3 keywords] | [How-to / List / Deep-dive / Comparison] | [Table / Chart / Statistic placeholder] | [Source type required to satisfy Cross-Reference Signal] |

Under each H2, note 2-3 H3 sub-points that add scannability and long-tail keyword coverage.

---

### SECTION 3 — THE AUTHORITY LAYER (E-E-A-T)
**Purpose**: Demonstrate genuine first-hand expertise that unsupervised AI-generated content cannot replicate. This section directly addresses the March 2026 Content Depth Penalty.
- One "Expert Deep-Dive" section requiring verifiable technical knowledge or lived experience
- Placeholder for a case study, real example, or primary data point with source attribution
- Recommended expert quote or study to cite — specify domain type and approximate recency (must be ${CURRENT_YEAR} or late 2025 to pass the Cross-Reference Signal)
- Author credential signal: note what byline information should accompany this post to maximize E-E-A-T under the December 2025 universal E-E-A-T expansion

---

### SECTION 4 — THE GEO ZONE (AI Overview Target)
**Purpose**: Directly engineer a section for AI Overview and PAA box capture in the ${CURRENT_MONTH} SERP environment (AI Overviews triggering on ~25% of all searches as of ${CURRENT_QUARTER}).
- Write a 4-6 question FAQ block using exact "People Also Ask" style phrasing from ${CURRENT_YEAR} search behavior
- Format strictly as: Q: [question] / A: [40-60 word direct answer — every factual claim must be source-attributable] for schema compatibility
- Identify which FAQ entry has the highest AI Overview capture probability given current trigger patterns
- Flag any FAQ answer that contains an unverified statistic — this is a March 2026 Cross-Reference Signal liability

---

### SECTION 5 — THE CLOSURE (Conclusion + CTA)
- Summarize the core insight in 2-3 sentences (zero repetition of body content, no "In conclusion" opener)
- Deploy a high-intent Call-to-Action matched to funnel stage: [Awareness CTA | Consideration CTA | Decision CTA]
- Suggest one "content upgrade" lead magnet idea tied to the topic and relevant to ${CURRENT_MONTH} buyer behavior

---

## ADVANCED SEO METADATA

| Attribute | Value |
|---|---|
| Primary Entity | [Core entity to build authority around] |
| Secondary Entities (LSI) | [3-5 semantically related entities or concepts] |
| Schema.org Type | [e.g., Article + FAQPage + HowTo] |
| Core Web Vitals Risk | [Note any content elements — heavy images, embedded video, complex tables — that could increase LCP or CLS given March 2026 weighting] |
| Internal Link Map (Inbound) | [3 existing page types to link FROM, with suggested anchor text] |
| Internal Link Map (Outbound) | [3 sub-topic pages to link TO, as future cluster content] |
| External Authority Cite | [3 domain types to cite, each with approximate recency requirement — must comply with March 2026 Cross-Reference Signal] |
`.trim();


export const PROMPT_STEP6 = (
  choice,
  outlineNote = "",
  ragContext = ""
) => `
Write a publication-ready blog post on: "${choice}"
${outlineNote ? `\nApproved direction: ${outlineNote}\n` : ""}
${ragContext ? `\nVERIFIED LIVE SOURCES (use these; do not invent adjacent facts):\n${ragContext}\n` : ""}

---

## WHAT THIS POST MUST BE

This is NOT a generic SEO article. It is expert journalism for a smart reader who has already Googled the basics.

The reader should finish this post and think: "I didn't know that. I actually learned something. This brand understands my world."

Every paragraph must earn its place. If a sentence can be deleted without loss, it should be.

---

## VOICE AND INTELLIGENCE STANDARDS

Write as a genuine subject matter expert — someone who has worked inside this industry, not someone who has read about it. This means:

- Name specific things. Not "jewellery trends" but "1-gram gold-plated Bengali chokers" or "matte-finish temple jewellery sets with oxidised silver detailing."
- Give the WHY behind every claim. Not "gold prices are high" but "gold crossed Rs. 95,000 per 10g in April 2026 (MCX), making high-fidelity imitation the rational, not the compromised, choice for a wedding guest."
- Teach something the reader cannot get from a listicle. One genuine insight, craft detail, cultural observation, or market dynamic per section that requires actual domain knowledge.
- Use contrast to create tension. "Most guides tell you X. Here's what actually happens when you do X at scale."
- Bring Indian context when relevant — not as tokenism but as precision. Reference real occasions, real price brackets, real regional nuances (e.g., how Bengali wedding jewellery norms differ from Rajasthani ones, or why Akshaya Tritiya demand spikes differ between metros and Tier 2 cities).

Prohibited: "In today's world", "In conclusion", "As an AI", "It is important to note", "With that said", vague superlatives ("amazing", "incredible", "game-changing"), and any sentence that could appear unedited in a competitor's article.

---

## STRUCTURE

### Opening (150-200 words)
Do NOT open with a definition or "Did you know." Open with a scene, a tension, a data point with a consequence, or a direct counterintuitive claim. Hook the reader in the first sentence. Establish the topic's stakes in the first paragraph. Make the reader feel the cost of not reading this.

### Body Sections (H2s — write 4 to 6)
Each H2 section must:
- Open with one declarative sentence that states the section's core insight directly (this is your GEO citation target)
- Deliver at least one thing the reader didn't already know — a specific detail, a mechanism, a counterintuitive fact, or a real-world example
- Use data with source-type labels: (per MCX, Q2 2026), (per GIA grading standards), (per Statista India jewellery report, 2025), etc.
- End with a practical implication or a forward-looking point that connects to the next section

Within each H2, use H3s for sub-points. Use a table when comparing 3+ options. Use a numbered list only for true sequential steps.

### The Expert Deep-Dive (one section, 200-300 words)
Pick ONE topic from the article and go genuinely deep. This is the section no competitor will write because it requires craft knowledge, industry experience, or data analysis. Examples: the metallurgy of gold plating and why micron thickness matters for durability; how jewellery buyers in Tier 2 cities differ from metro buyers in festival seasons; the specific hallmark codes to check and what each means. Write this section as if you are explaining it to a sharp colleague, not a beginner.

### FAQ (minimum 4 questions)
Format EXACTLY as:

**Q: [Full question as typed into Google — natural language, specific]**
A: [40-60 word direct answer. Every factual claim source-attributed. No "as mentioned above" or "in this article." Self-contained.]

Choose questions that reflect what a real buyer, researcher, or curious reader would actually search — not generic FAQs.

### Closing (100-150 words)
Summarise the single most important thing the reader should take away — not a recap of the article but a distillation. End with a CTA that feels earned by the article's content, not bolted on.

---

## TECHNICAL REQUIREMENTS

- Total length: 2,000 to 2,800 words
- At least 3 explicit references to ${CURRENT_YEAR} or ${CURRENT_QUARTER} to signal freshness
- Every statistic needs a source-type label in parentheses
- Use ## for H2, ### for H3. No H4.
- Bold key terms, exact figures, and actionable conclusions for skim-readers
- One natural in-body CTA around the 60% mark — not a banner, a sentence
- End with the FAQ block before the closing paragraph

Deliver the complete post now. No meta-commentary. No "here is your blog post." Begin directly with the opening sentence.
`.trim();





export const PROMPT_STEP7 = () => `
Deliver the Final Advanced SEO and GEO Performance Package for the completed blog post. All scores, recommendations, and playbook steps must be calibrated to the ${CURRENT_MONTH} ranking environment, specifically the March 2026 Core Update conditions.

---

## 1. META INTELLIGENCE

| Element | Value | Notes |
|---|---|---|
| Meta Title | [max 60 chars, primary keyword within first 3 words] | [CTR hook used — note if it signals freshness for ${CURRENT_YEAR}] |
| Meta Description | [max 155 chars, includes primary + 1 secondary keyword, ends with implicit CTA] | [Intent signal — TOFU/MOFU/BOFU] |
| Open Graph Title | [Variant optimized for social sharing — can differ from meta title] | |
| Twitter/X Card Description | [Punchy, 1-sentence value proposition anchored to ${CURRENT_YEAR}] | |

---

## 2. TECHNICAL SEO ASSETS

**URL Slug:** [SEO-clean, hyphenated, keyword-first, no stop words, max 5 segments — do NOT include year in slug unless the topic is inherently year-specific]

**Canonical Tag Recommendation:** [Self-canonical or note if syndication risk exists]

**Core Web Vitals Risk Flag (March 2026 Priority):**
[Identify any elements in the post — image sizes, embedded scripts, layout-heavy tables — that could negatively impact LCP or CLS given the increased weighting in the March 2026 update. Provide one specific mitigation per risk.]

**Image Alt Text Schema (3 recommended images):**
1. [Image context] — Alt: "[Descriptive alt text embedding secondary keyword naturally]"
2. [Image context] — Alt: "[Alt text]"
3. [Image context] — Alt: "[Alt text]"

**Schema.org Markup Recommendation:**
- Primary Type: [e.g., Article]
- Secondary Type: [e.g., FAQPage]
- Tertiary (if applicable): [e.g., HowTo, BreadcrumbList]
- Priority Properties to Populate: [author, datePublished, dateModified, mainEntity, headline]
- March 2026 Note: Confirm datePublished and dateModified are populated — freshness signals carry elevated weight in the current algorithm cycle.

---

## 3. INTERNAL LINKING ARCHITECTURE

| Link Direction | Page / Topic | Suggested Anchor Text | Priority |
|---|---|---|---|
| Inbound (link FROM) | [Parent/Pillar page] | [Anchor text] | High |
| Inbound (link FROM) | [Related cluster page] | [Anchor text] | Medium |
| Inbound (link FROM) | [High-traffic existing page] | [Anchor text] | Medium |
| Outbound (link TO) | [Future cluster topic] | [Anchor text] | High |
| Outbound (link TO) | [Supporting subtopic] | [Anchor text] | Medium |
| Outbound (link TO) | [Deep-dive related post] | [Anchor text] | Low |

---

## 4. GEO CITATION READINESS SCORE

Evaluate the completed post on its likelihood of being cited in Google AI Overviews, benchmarked against ${CURRENT_MONTH} trigger rates (~25% of all searches per Conductor ${CURRENT_QUARTER} data):

| GEO Factor | Score (1-10) | Improvement Action |
|---|---|---|
| Declarative lead sentences | | |
| FAQ schema eligibility | | |
| Structured data markup | | |
| Entity saturation | | |
| Citability (clear, quotable, source-attributed claims) | | |
| Cross-Reference Signal compliance (March 2026) | | |
| **Overall GEO Score** | **/60** | |

---

## 5. CONTENT VELOCITY — POST-PUBLISH PLAYBOOK

Ranked by impact. Execute within the first 72 hours of publishing. Steps are ordered for the March 2026 algorithm environment.

1. **Submit to Google Search Console** — Request indexing immediately via URL Inspection Tool. Given the March 2026 rollout is active, early indexing during the update window can capture ranking momentum faster.
2. **Implement Schema Markup** — Deploy FAQPage + Article JSON-LD before first crawl. Populate datePublished and dateModified immediately — freshness is an active signal in the current cycle.
3. **Cross-Reference Signal Audit** — Before publishing, verify every statistic in the post traces to a credible source type. One unverifiable claim is now a ranking liability under March 2026 conditions.
4. **Core Web Vitals Pre-Check** — Run the post URL through PageSpeed Insights before announcement. LCP and CLS carry increased weight as of March 2026; fix critical issues before first crawl.
5. **Internal Link Injection** — Add inbound links from the 3 identified parent/pillar pages within 24 hours of publish.
6. **Primary Distribution** — Publish to owned channels: email list, LinkedIn article (canonical tag back to original), and relevant community (Reddit, Slack group, Discord).
7. **Entity Building** — Mention the post URL in a relevant Q&A on Quora, Reddit, or a niche forum where the primary entity is discussed. This supports the brand mention footprint that E-E-A-T now requires universally (post-December 2025 update).
8. **Outreach for a Citation** — Identify 2-3 domain-authority sites already ranking for adjacent keywords. Pitch the post as a resource link or data citation. Under the March 2026 Cross-Reference Signal, being cited by a trusted source directly strengthens your own cross-reference authority.
9. **PAA Monitoring** — Set a Google Alert and track People Also Ask appearances within 2 weeks. Expand FAQ section based on emerging PAA questions — these are live AI Overview insertion opportunities.
10. **30-Day Refresh Gate** — Schedule a calendar reminder to update statistics, refresh the ${CURRENT_QUARTER} temporal anchors, add new FAQ entries, and re-submit to GSC if ranking plateaus below page 1. In an active core update cycle, freshness refreshes are higher priority than in stable periods.

---

## 6. RANKING POTENTIAL SCORE

| Dimension | Score (1-25) | Rationale |
|---|---|---|
| Keyword Opportunity (volume vs. competition, ${CURRENT_QUARTER}) | | |
| Content Quality and E-E-A-T Depth (December 2025 universal standard) | | |
| GEO / AI Overview Eligibility (${CURRENT_MONTH} trigger benchmarks) | | |
| Technical and Structural Optimization (March 2026 Core Web Vitals weight) | | |
| **Total Ranking Potential** | **/100** | |

**Verdict:** [1-2 sentence strategic assessment of this post's organic ceiling in the current ${CURRENT_MONTH} environment, and the single highest-leverage action to push it there given the active March 2026 Core Update rollout.]
`.trim();
