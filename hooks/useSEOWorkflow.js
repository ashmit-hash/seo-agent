"use client";

import {
  useState, useRef, useEffect,
  useCallback, useMemo, useReducer,
} from "react";
import { QualityAssurance } from "@/lib/qualityAssurance";
import {
  STEPS, SYSTEM_PROMPT,
  PROMPT_STEP1, PROMPT_STEP3,
  PROMPT_STEP4, PROMPT_STEP5, PROMPT_STEP6, PROMPT_STEP6_FORMAT, PROMPT_STEP6_REVISE, PROMPT_STEP7, PROMPT_STEP8,
} from "@/lib/constants";

// ─── Step Reducer ─────────────────────────────────────────────────
function stepReducer(state, action) {
  switch (action.type) {
    case "PATCH":
      return { ...state, [action.id]: { ...(state[action.id] ?? {}), ...action.patch } };
    case "RESET":
      return {};
    default:
      return state;
  }
}

// ─── Constants ────────────────────────────────────────────────────
const STORAGE_KEY    = "seo-agent-session";
const MAX_HISTORY_TOKENS = 8000;
const SESSION_TTL_MS = 86_400_000; // 24 hours

// ─── Pure Helpers ─────────────────────────────────────────────────
function buildSummarizedHistory(history) {
  const totalChars = history.reduce((n, m) => n + String(m.content).length, 0);
  if (totalChars / 4 < MAX_HISTORY_TOKENS) return history;

  const recent   = history.slice(-4);
  const earlier  = history.slice(0, -4);
  const summary  = earlier
    .filter(m => m.role === "assistant")
    .map((m, i) => `[Step ${i + 1} summary]: ${String(m.content).slice(0, 800)}…`)
    .join("\n\n");

  return [
    { role: "user", content: `Context from earlier steps:\n${summary}\n\nContinue from here.` },
    ...recent,
  ];
}

async function callAPI(
  messages,
  systemPrompt,
  maxTokens,
  provider,
  noCache = false
) {
  const res = await fetch("/api/seo", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({
      messages: buildSummarizedHistory(messages),
      systemPrompt, maxTokens, provider, noCache,
      _salt: Math.random().toString(36).substring(7),
    }),
  });

  if (!res.ok) {
    let errText;
    try { errText = await res.text(); } catch { errText = `HTTP ${res.status}`; }
    throw new Error(`API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  if (data.error)  throw new Error(data.error);
  if (!data.text)  throw new Error("Empty response from server. Please try again.");
  return data;
}

async function fetchSERP(query, options = {}) {
  try {
    const res  = await fetch("/api/serp", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ query, ...options }),
    });
    const data = await res.json();
    return data.error ? null : data;
  } catch { return null; }
}

// ─── Session Helpers ──────────────────────────────────────────────
function saveSession(payload) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...payload, savedAt: Date.now() })); }
  catch { /* quota errors are non-fatal */ }
}

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - data.savedAt > SESSION_TTL_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return data;
  } catch { return null; }
}

function clearSession() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
}

// ─── Keyword Extraction ───────────────────────────────────────────
function extractKeywords(text) {
  if (!text) return [];

  const isValid = (kw) => {
    if (!kw || kw.length < 4 || kw.length > 120) return false;
    if (/^(high|med|medium|low|yes|no)$/i.test(kw))  return false;
    if (/^\d{1,3}$/.test(kw))                        return false;
    if (/problem.aware|solution.aware|informational|navigational|transactional|commercial/i.test(kw)) return false;
    if (/^(\*\*|##|--|\[|\()/.test(kw))              return false;
    if (!/[a-zA-Z]{2,}/.test(kw))                    return false;
    return true;
  };

  // Strategy 1: **Target Keyword:** value
  const bold = Array.from(text.matchAll(/\*\*\s*Target Keyword\s*:\s*\*\*\s*(.+)/gi));
  if (bold.length > 0) {
    const r = bold.map(m => m[1].replace(/\*\*/g, "").trim()).filter(isValid).slice(0, 10);
    if (r.length >= 3) return r;
  }

  // Strategy 2: Target Keyword: value  (plain)
  const plain = Array.from(text.matchAll(/^\s*(?:\d+\.\s*)?Target Keyword\s*:\s*(.+)$/gim));
  if (plain.length > 0) {
    const r = plain.map(m => m[1].replace(/\*\*/g, "").trim()).filter(isValid).slice(0, 10);
    if (r.length >= 3) return r;
  }

  // Strategy 3: Numbered multi-word items
  const numbered = Array.from(text.matchAll(/^\s*\d+\.\s+\*{0,2}([^\n*:]{8,80})\*{0,2}\s*$/gim));
  if (numbered.length > 0) {
    const r = numbered
      .map(m => m[1].trim())
      .filter(isValid)
      .filter(kw => kw.split(/\s+/).length >= 2)
      .slice(0, 10);
    if (r.length >= 3) return r;
  }

  return [];
}

// ─── Topic Resolver ───────────────────────────────────────────────
function resolveTopicChoice(choice, step3Text) {
  if (!/^\s*([Tt]opic\s*)?\d+\s*$/i.test(choice) || !step3Text) return choice;

  const numMatch = choice.match(/\d+/);
  if (!numMatch) return choice;
  const num = numMatch[0];
  const lines = step3Text.split("\n");

  for (const line of lines) {
    if (new RegExp(`^\\s*\\**${num}[\\.\\):]`, "i").test(line) && line.length > 5) {
      const resolved = line
        .replace(/^\s*\**\d+[\.\):]?\**\s*/, "")
        .replace(/###/g, "")
        .replace(/\[Number\]/g, "")
        .replace(/\*\*SEO Title(?:[:\-—])?\**\s*/i, "")
        .replace(/\*\*/g, "")
        .split(/[-—:]/)[0]
        .trim();
      return resolved.length >= 5 ? resolved : choice;
    }
  }
  return choice;
}

// ─── Main Hook ────────────────────────────────────────────────────
export function useSEOWorkflow() {

  // ── Core State ──────────────────────────────────────────────
  const [provider,    setProvider]   = useState("gemini");
  const [url,         setUrl]        = useState("");
  const [urlError,    setUrlError]   = useState("");
  const [phase,       setPhase]      = useState("idle");
  const [siteUrl,     setSiteUrl]    = useState("");
  const [stepData,    dispatchStep]  = useReducer(stepReducer, {});
  const [hasSession,  setHasSession] = useState(false);
  const [brandContext, setBrandContextState] = useState({
    category: "", products: "", audience: "",
  });
  const [internalData, setInternalData] = useState({
    radar: null, velocity: 0, rankings: [],
  });
  const [isGeneratingVariations, setIsGeneratingVariations] = useState(false);

  // ── Stable Refs ──────────────────────────────────────────────
  const conversationRef  = useRef([]);
  const stepInputsRef    = useRef({});
  const bottomRef        = useRef(null);

  // Shadow refs — keep latest values accessible inside stable callbacks
  const siteUrlRef      = useRef(siteUrl);
  const stepDataRef     = useRef(stepData);
  const providerRef     = useRef(provider);
  const brandContextRef = useRef(brandContext);

  useEffect(() => { siteUrlRef.current      = siteUrl;       }, [siteUrl]);
  useEffect(() => { stepDataRef.current     = stepData;      }, [stepData]);
  useEffect(() => { providerRef.current     = provider;      }, [provider]);
  useEffect(() => { brandContextRef.current = brandContext;  }, [brandContext]);

  // ── Atomic Step Patch ────────────────────────────────────────
  const patchStep = useCallback((id, patch) => {
    dispatchStep({ type: "PATCH", id, patch });
  }, []);

  const setBrandContext = useCallback(
    (field, value) =>
      setBrandContextState(prev => ({ ...prev, [field]: value })),
    []
  );

  // ── Auto-scroll ──────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [stepData]);

  // ── Session Persistence ──────────────────────────────────────
  useEffect(() => {
    if (phase === "idle") return;
    saveSession({ url, siteUrl, phase, stepData, conversation: conversationRef.current, provider, brandContext });
  }, [stepData, phase, url, siteUrl, provider, brandContext]);

  // ── Load Session Flag on Mount ───────────────────────────────
  useEffect(() => {
    const session = loadSession();
    if (session?.phase && session.phase !== "idle") setHasSession(true);
  }, []);

  // ── Core AI Call ─────────────────────────────────────────────
  const callSEO = useCallback(
    async (userMessage, maxTokens = 4096, noCache = false) => {
      conversationRef.current.push({ role: "user", content: userMessage });
      try {
        const data = await callAPI(
          conversationRef.current, SYSTEM_PROMPT,
          maxTokens, providerRef.current, noCache
        );
        conversationRef.current.push({ role: "assistant", content: data.text });
        return data;
      } catch (e) {
        conversationRef.current.pop(); // rollback on failure to prevent broken turn pairs
        throw e;
      }
    },
    [] // stable — reads provider via ref
  );

  // ── Rank Checker ─────────────────────────────────────────────
  const checkRankings = useCallback(async (targetUrl, keywords) => {
    if (!targetUrl || !keywords.length) return;
    let hostname = targetUrl;
    try { hostname = new URL(targetUrl).hostname; } catch { /* fallback */ }

    const settled = await Promise.allSettled(
      keywords.slice(0, 3).map(async (kw) => {
        const res = await fetchSERP(kw);
        const position = res?.organic?.find(
          (o) => o.link.includes(hostname)
        )?.position ?? "100+";
        return { keyword: kw, position, change: 0 };
      })
    );

    const rankings = settled
      .filter((r) => r.status === "fulfilled")
      .map(r => r.value);

    setInternalData(prev => ({ ...prev, rankings }));
  }, []);

  // ── Content Variations ───────────────────────────────────────
  const generateVariations = useCallback(async () => {
    const mainContent = stepDataRef.current[6]?.text;
    if (!mainContent) return;
    setIsGeneratingVariations(true);
    try {
      const prompt = `Based on this article, generate 3 professional content variations as a JSON object:
1. "social": A Twitter/LinkedIn snippet.
2. "email": A short promo email body.
3. "recap": A 2-sentence TL;DR.
Content: ${mainContent.slice(0, 3000)}…`;

      const res  = await callAPI(
        [{ role: "user", content: prompt }],
        `Always respond with STRICT JSON ONLY. Keys required: 'social', 'email', 'recap'.`,
        1500, "openrouter"
      );
      const json = JSON.parse(res.text.match(/\{[\s\S]*\}/)?.[0] ?? res.text);
      setInternalData(prev => ({ ...prev, variations: json }));
    } catch (e) {
      console.error("[Variations] Failed:", e);
    } finally {
      setIsGeneratingVariations(false);
    }
  }, []);

  // ── Step 7 ───────────────────────────────────────────────────

// ── Niche detector — reads Step 1 scrape & audit text ────────
function extractNicheFromAudit(auditText, scrapeContext) {
  const combined = ((scrapeContext || "") + " " + (auditText || "")).toLowerCase();

  const nichePatterns = [
    // ── Check specific product categories FIRST (before generic terms) ──
    // Tactical / military / outdoor — check BEFORE bags so "tactical backpack" doesn't bleed into "bags accessories"
    { pattern: /tactical|military|army|combat|defence|defense|shooting|camo|camouflage|ops|soldier|paramilitary|force|ammo|firearm|holster|molle|airsoft|gun belt|duty belt/i, label: "tactical military gear" },
    // Bags / accessories — check before jewellery because "gold clasp" / "silver buckle" on bags
    // would otherwise trigger the jewellery pattern incorrectly.
    { pattern: /handbag|hand bag|sling bag|shoulder bag|crossbody|clutch bag|tote bag|laptop bag|bag brand|bag collection|bag store|leather bag|canvas bag|wallet|purse brand/i, label: "bags accessories" },
    { pattern: /footwear|shoe brand|sandal|sneaker|boot brand/i,                   label: "footwear" },
    { pattern: /watch brand|timepiece|wrist watch/i,                               label: "watches" },
    // Jewellery — requires explicit jewellery terms, not just metal colours
    { pattern: /jewel(?:ler)?y|jewellery brand|jewellery store|diamond jewel|pendant|necklace|bangles|earring|ring.*gold|gold.*ring|kundan|meenakari|polki|mangalsutra/i, label: "jewellery" },
    { pattern: /skincare|cosmetic|makeup|serum|moisturizer|face wash|beauty brand|sunscreen|spf|toner|cleanser|lip balm/i, label: "beauty skincare" },
    { pattern: /kurta|saree|ethnic wear|lehenga|salwar|dupatta|fashion brand|apparel brand|clothing brand/i, label: "fashion apparel" },
    { pattern: /home decor|scented candle|diffuser|cushion cover|wall art|decor brand/i, label: "home decor" },
    { pattern: /tiffin|meal delivery|home food|dabba|lunch box service/i,          label: "tiffin food delivery" },
    { pattern: /food|snack|chocolate|mithai|health food|organic food/i,            label: "food snacks" },
    { pattern: /kids|children|baby|toy|school supply|toddler|infant|nursery|board game|puzzle/i, label: "kids baby products" },
    { pattern: /wellness|supplement|vitamin|protein|ayurved|healthcare|medicine|pharmacy|fitness|nutrition|herbal/i, label: "health wellness" },
    { pattern: /lifestyle|gifting|gift brand|curated gift|artisan|handcraft/i,     label: "lifestyle gifting" },
    { pattern: /stationery|notebook|pen|planner|journal/i,                         label: "stationery" },
    { pattern: /saas|software|app|platform|tool|dashboard/i,                       label: "SaaS software" },
    { pattern: /furniture|sofa|chair|mattress|bed/i,                               label: "furniture" },
    { pattern: /plant|garden|nursery|seeds/i,                                      label: "plants gardening" },
    { pattern: /pet|dog|cat|pet food|pet care/i,                                   label: "pet care" },
  ];

  for (const { pattern, label } of nichePatterns) {
    if (pattern.test(combined)) return label;
  }

  // Fallback: extract brand description from scrape Title/H1/Desc
  const titleMatch  = (scrapeContext || "").match(/Title:\s*(.+)/i);
  const h1Match     = (scrapeContext || "").match(/H1:\s*(.+)/i);
  const descMatch   = (scrapeContext || "").match(/Desc:\s*(.+)/i);

  // Use the most descriptive available field
  const fallback = descMatch?.[1] || h1Match?.[1] || titleMatch?.[1] || "";
  if (fallback.length > 5) return fallback.slice(0, 80).trim();

  return "D2C brand";
}

  // ── Step 8 → now Step 7 — Business Report ───────────────────
  const runStep8 = useCallback(async () => {
    stepInputsRef.current[7] = {};
    patchStep(7, { status: "loading" });
    try {
      // Gather context from previous steps
      const topic       = stepInputsRef.current[5]?.topic
                        ?? stepInputsRef.current[4]?.topic
                        ?? stepInputsRef.current[3]?.topic
                        ?? "";
      const siteUrl     = siteUrlRef.current;

      // Extract keywords from Step 3 (new) output
      const step3Text   = stepDataRef.current[3]?.text ?? "";
      const kwMatches   = [...step3Text.matchAll(/Target Keyword:\s*(.+)/gi)];
      const keywords    = kwMatches
        .map(m => m[1].replace(/\*\*/g, "").trim())
        .filter(k => k.length > 3)
        .slice(0, 6)
        .join(", ");

      // Use first 300 chars of blog as summary context
      const blogSummary = (stepDataRef.current[5]?.text ?? "").slice(0, 300);

      const d8 = await callSEO(
        PROMPT_STEP8(topic, keywords || "keywords from keyword research", siteUrl, blogSummary),
        3000
      );
      patchStep(7, { status: "done", text: d8.text, canRetry: false });
      setPhase("done");
      clearSession();
    } catch (e) {
      patchStep(7, { status: "error", error: e.message, canRetry: true });
    }
  }, [callSEO, patchStep]);

  // ── Step 7 → now Step 6 — SEO + GEO Layer ───────────────────
  const runStep7 = useCallback(async () => {
    stepInputsRef.current[6] = {};
    patchStep(6, { status: "loading" });
    try {
      const d7 = await callSEO(PROMPT_STEP7());
      patchStep(6, { status: "done", text: d7.text, canRetry: false });
    } catch (e) {
      patchStep(6, { status: "error", error: e.message, canRetry: true });
    }
  }, [callSEO, patchStep]);

  // ── Step 6 ───────────────────────────────────────────────────
  // ── Step 6 Revision ─────────────────────────────────────────
  const runStep6Revise = useCallback(async (feedback) => {
    patchStep(5, { status: "loading", gate: null });
    try {
      const inp            = stepInputsRef.current[5];
      const existingBlog   = stepDataRef.current[5]?.text ?? "";
      const d6r = await callSEO(
        PROMPT_STEP6_REVISE(
          inp.topic ?? "",
          inp.contentType ?? "",
          inp.blueprintStructure ?? "",
          existingBlog,
          feedback
        ),
        8000
      );

      // ── Re-run formatter after revision ──────────────────────
      let revisedText = d6r.text;
      try {
        const d6rfmt = await callSEO(PROMPT_STEP6_FORMAT(d6r.text), 8000);
        if (d6rfmt?.text && d6rfmt.text.length > 200) revisedText = d6rfmt.text;
      } catch (e) { /* fallback to unformatted */ }

      patchStep(5, {
        status  : "waiting",
        text    : revisedText,
        canRetry: false,
        gate    : {
          type       : "text",
          prompt     : "Happy with this revised blog?",
          hint       : "Type 'approve' to continue to SEO optimisation, or describe more changes.",
          placeholder: "approve, or describe changes…",
          onSubmit   : (ans) => {
            if (["approve", "yes", "looks good", "perfect"].some(w => ans.toLowerCase().includes(w))) {
              patchStep(5, { gate: null, status: "done" });
            } else {
              runStep6Revise(ans);
            }
          },
        },
      });
    } catch (e) {
      patchStep(5, { status: "error", error: e.message, canRetry: true });
    }
  }, [callSEO, patchStep]);

  const runStep6 = useCallback(async (topicChoice, outlineAnswer) => {
    patchStep(4, { gate: null, status: "done" });
    const outNote = !["approve", "yes"].includes(outlineAnswer.toLowerCase())
      ? `\n\nNote: Blueprint changes requested: "${outlineAnswer}". Please incorporate.`
      : "";
    const resolvedTopic = resolveTopicChoice(topicChoice, stepDataRef.current[2]?.text);

    // ── Extract content type and blueprint from Step 4 (new) output ──
    const step5Text = stepDataRef.current[4]?.text ?? "";

    const contentTypeMatch = step5Text.match(/\*\*Selected Type:\*\*\s*(.+)/i)
      ?? step5Text.match(/Selected Type:\s*(.+)/i)
      ?? step5Text.match(/Content Type:\s*(.+)/i);
    const contentType = contentTypeMatch?.[1]?.replace(/\*\*/g, "").trim() ?? "";

    // Extract the full blueprint structure section
    const blueprintMatch = step5Text.match(/Recommended Structure:([\s\S]*?)(?=\*\*Tone:|\*\*Writing Style:|\*\*Opening Line|$)/i);
    const blueprintStructure = blueprintMatch?.[1]?.trim() ?? "";

    const targetReaderMatch = step5Text.match(/\*\*Target Reader:\*\*\s*(.+)/i)
      ?? step5Text.match(/Target Reader:\s*(.+)/i);
    const targetReader = targetReaderMatch?.[1]?.replace(/\*\*/g, "").trim() ?? "";

    const corePromiseMatch = step5Text.match(/\*\*Core Promise:\*\*\s*(.+)/i)
      ?? step5Text.match(/Core Promise:\s*(.+)/i);
    const corePromise = corePromiseMatch?.[1]?.replace(/\*\*/g, "").trim() ?? "";

    stepInputsRef.current[5] = { topic: resolvedTopic, outNote, contentType, blueprintStructure, targetReader, corePromise };
    patchStep(5, { status: "loading" });
    try {
      const ragRes    = await fetchSERP(resolvedTopic);
      const ragContext = ragRes ? JSON.stringify(ragRes.organic?.slice(0, 4) ?? []) : "";
      stepInputsRef.current[5].ragContext = ragContext;

      // ── Build website context from Step 1 audit ───────────────
      const auditText   = stepDataRef.current[1]?.text ?? "";
      const scrapeCtx   = stepInputsRef.current[1]?.scrapeContext ?? "";
      const siteUrl     = siteUrlRef.current ?? "";

      // ── Extract brand name explicitly ─────────────────────────
      // Try multiple sources in priority order.
      // This value is passed directly to the prompt so the AI has a
      // confirmed, non-empty brand name variable before it starts writing.
      const extractedBrandName = (
        // 1. Audit text: "Brand Name: Samika" or "Brand: Samika"
        auditText.match(/Brand(?:\s*Name)?:\s*([^\n|–\-]{2,40})/i)?.[1]?.trim() ||
        // 2. Scrape title: "Samika | Jewellery Store" → take part before pipe/dash
        scrapeCtx.match(/Title:\s*([^\n|–\-]+)/i)?.[1]?.split(/[\|\-–]/)[0]?.trim() ||
        // 3. H1 tag from scrape
        scrapeCtx.match(/H1:\s*([^\n]{2,50})/i)?.[1]?.trim() ||
        // 4. Domain name as last resort (e.g. samika.co → Samika)
        (() => {
          try {
            const host = new URL(siteUrl).hostname.replace(/^www\./, "");
            const name = host.split(".")[0];
            return name.charAt(0).toUpperCase() + name.slice(1);
          } catch { return ""; }
        })()
      ) || "";
      stepInputsRef.current[5].brandName = extractedBrandName;

      // ── Fetch real product catalog with prices ────────────────
      // Priority order: Alippo (__NEXT_DATA__) → Shopify → WooCommerce → HTML scrape
      let productContext = "";
      const allExtractedPrices = [];

      // Helper — converts a [{name, price}] array to a formatted bullet list
      function formatProductList(prods, source) {
        const lines = prods
          .filter(p => p.name && p.name.length > 1)
          .slice(0, 25)
          .map(p => {
            if (p.price && p.price > 0) {
              allExtractedPrices.push(p.price);
              return `• ${p.name} — ₹${Math.round(p.price).toLocaleString("en-IN")}`;
            }
            return `• ${p.name}`;
          });
        if (lines.length === 0) return "";
        return `REAL PRODUCTS FROM THIS STORE — USE THESE EXACT NAMES AND PRICES IN THE BLOG:\n${lines.join("\n")}\n(Source: ${source})`;
      }

      try {
        const baseUrl = siteUrl.replace(/\/+$/, "");

        // ── Category detection — maps blog topic to collection slug ──
        // Used by Strategy 0 below to scrape the RIGHT tab, not the default one.
        const CATEGORY_SLUG_MAP = [
          { keywords: ["toe ring", "toe-ring", "toe_ring"], slugs: ["toe-rings", "toe_rings", "toerings", "rings"] },
          { keywords: ["mangalsutra"],                       slugs: ["mangalsutras", "mangalsutra"] },
          { keywords: ["anklet"],                            slugs: ["anklets", "anklet"] },
          { keywords: ["bracelet", "bangle"],                slugs: ["bracelets", "bangles", "bracelet"] },
          { keywords: ["earring", "stud", "dangler", "hoop"], slugs: ["earrings", "earring", "studs"] },
          { keywords: ["necklace", "chain", "pendant"],      slugs: ["necklaces", "chains", "pendants", "necklace"] },
          { keywords: ["ring"],                              slugs: ["rings", "ring"] },
          { keywords: ["saree", "sari"],                     slugs: ["sarees", "saris", "saree"] },
          { keywords: ["kurta"],                             slugs: ["kurtas", "kurta"] },
          { keywords: ["bag", "handbag", "clutch"],          slugs: ["bags", "handbags", "clutches"] },
        ];
        const topicLower = resolvedTopic.toLowerCase();
        const detectedCategory = CATEGORY_SLUG_MAP.find(c =>
          c.keywords.some(kw => topicLower.includes(kw))
        ) ?? null;

        // ── Strategy 0: Category-specific collection URL ──────────
        // For blogs about a specific product category (bracelets, anklets, etc.),
        // scrape the category-specific URL FIRST. This prevents the scraper from
        // pulling products from the default active tab (e.g., Anklets) when the
        // blog is actually about Bracelets.
        // Works for: Shopify (/collections/[slug]), generic (/category/[slug]), etc.
        if (!productContext && detectedCategory) {
          for (const slug of detectedCategory.slugs) {
            if (productContext) break;
            const catUrls = [
              `${baseUrl}/collections/${slug}`,
              `${baseUrl}/category/${slug}`,
              `${baseUrl}/${slug}`,
              `${baseUrl}/shop/${slug}`,
            ];
            for (const catUrl of catUrls) {
              if (productContext) break;
              const catRes = await fetch("/api/scrape", {
                method : "POST",
                headers: { "Content-Type": "application/json" },
                body   : JSON.stringify({ url: catUrl }),
              }).then(r => r.json()).catch(() => null);

              if (catRes?.products?.length >= 2) {
                const built = formatProductList(catRes.products, `${slug} collection (category tab)`);
                if (built) { productContext = built; break; }
              }
            }
          }
        }

        // ── Strategy 1: Alippo / Next.js __NEXT_DATA__ ───────────
        // Alippo stores are Next.js apps. Next.js embeds ALL server-side page
        // props as JSON in a <script id="__NEXT_DATA__"> tag — this includes
        // Alippo App Router stores render products + prices in HTML on the
        // "explore-all" or "bestsellers" pages. Try these first.
        const alippoPaths = [
          "/category-view/explore-all",  // ALL products with prices (most reliable)
          "/category-view/bestsellers",  // bestsellers
          "/category-view/new-arrivals", // new arrivals
          "/collection-view/explore-all",
          "/collection-view/all",
          "/category-view",              // category listing (has subcategory slugs)
          "/collection-view",
          "/",                           // homepage fallback
        ];

        for (const path of alippoPaths) {
          if (productContext) break;
          const scrapeRes = await fetch("/api/scrape", {
            method : "POST",
            headers: { "Content-Type": "application/json" },
            body   : JSON.stringify({ url: baseUrl + path }),
          }).then(r => r.json()).catch(() => null);

          if (scrapeRes?.products && scrapeRes.products.length > 0) {
            const built = formatProductList(scrapeRes.products, `Alippo ${path}`);
            if (built) { productContext = built; break; }
          }
          // Also check raw mainText for ₹ prices (rendered HTML fallback)
          if (!productContext && scrapeRes?.mainText) {
            const priceHits = (scrapeRes.mainText.match(/₹[\d,]+/g) || []).length;
            if (priceHits >= 3) {
              // Has prices — use mainText directly
              (scrapeRes.mainText.match(/(?:₹)\s*[\d,]+/g) || []).forEach(p => {
                const n = parseInt(p.replace(/[^\d]/g, ""));
                if (n > 50) allExtractedPrices.push(n);
              });
              productContext = `REAL PRODUCTS ON THIS WEBSITE (from ${baseUrl}${path}):\n${scrapeRes.mainText.slice(0, 2500)}`;
              break;
            }
          }
        }

        // ── Strategy 2: Alippo PayloadCMS products API ───────────
        // Alippo uses PayloadCMS at cms.alippo.com — try their products collection
        if (!productContext) {
          try {
            let domain = baseUrl;
            try { domain = new URL(baseUrl).hostname; } catch { /* keep as-is */ }
            for (const cmsBase of ["https://cms.alippo.com", "https://admin.alippo.com"]) {
              const cmsRes = await fetch(
                `${cmsBase}/api/products?where[websiteDomain][equals]=${domain}&limit=25&depth=1`,
                { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000) }
              ).catch(() => null);
              if (!cmsRes || !cmsRes.ok) continue;
              const cmsData = await cmsRes.json();
              const docs = cmsData.docs || [];
              if (docs.length > 0) {
                const built = formatProductList(docs.map(p => ({
                  name : p.title || p.name || p.productName || "",
                  price: parseFloat(p.price || p.sellingPrice || p.mrp || "0") || null,
                })), "Alippo CMS");
                if (built) { productContext = built; break; }
              }
            }
          } catch (_) { /* CMS not reachable */ }
        }

        // ── Strategy 3: Shopify products.json ────────────────────
        if (!productContext) {
          try {
            const shopRes = await fetch("/api/scrape", {
              method : "POST",
              headers: { "Content-Type": "application/json" },
              body   : JSON.stringify({ url: baseUrl + "/products.json?limit=30" }),
            }).then(r => r.json()).catch(() => null);
            // products.json returns raw JSON text — parse it from mainText
            if (shopRes?.mainText) {
              try {
                const shopData = JSON.parse(shopRes.mainText.replace(/\.\.\.$/,""));
                const prods = (shopData.products || []).slice(0, 25);
                if (prods.length > 0) {
                  const built = formatProductList(prods.map(p => ({
                    name : p.title || "",
                    price: parseFloat(p.variants?.[0]?.price ?? "0") || null,
                  })), "Shopify");
                  if (built) productContext = built;
                }
              } catch (_) { /* not JSON */ }
            }
          } catch (_) { /* not Shopify */ }
        }

        // ── Strategy 4: WooCommerce REST API ─────────────────────
        if (!productContext) {
          try {
            const wooScrape = await fetch("/api/scrape", {
              method : "POST",
              headers: { "Content-Type": "application/json" },
              body   : JSON.stringify({ url: baseUrl + "/wp-json/wc/v3/products?per_page=20&status=publish" }),
            }).then(r => r.json()).catch(() => null);
            if (wooScrape?.mainText) {
              try {
                const wooProds = JSON.parse(wooScrape.mainText.replace(/\.\.\.$/,""));
                if (Array.isArray(wooProds) && wooProds.length > 0) {
                  const built = formatProductList(wooProds.map(p => ({
                    name : p.name || "",
                    price: parseFloat(p.price || p.regular_price || "0") || null,
                  })), "WooCommerce");
                  if (built) productContext = built;
                }
              } catch (_) { /* not JSON */ }
            }
          } catch (_) { /* not WooCommerce */ }
        }

        // ── Strategy 5: Generic page scrape with __NEXT_DATA__ ───
        // Try remaining common e-commerce paths via our scrape API
        if (!productContext) {
          for (const path of ["/shop", "/products", "/collections/all", "/collections"]) {
            const prodRes = await fetch("/api/scrape", {
              method : "POST",
              headers: { "Content-Type": "application/json" },
              body   : JSON.stringify({ url: baseUrl + path }),
            }).then(r => r.json()).catch(() => null);

            if (prodRes?.products?.length > 0) {
              const built = formatProductList(prodRes.products, path);
              if (built) { productContext = built; break; }
            }
            // Fallback to mainText raw content
            if (prodRes?.mainText && prodRes.mainText.length > 100) {
              (prodRes.mainText.match(/(?:₹|Rs\.?)\s*[\d,]+(?:\.\d{2})?/g) || []).forEach(p => {
                const n = parseInt(p.replace(/[^\d]/g, ""));
                if (n > 50) allExtractedPrices.push(n);
              });
              productContext = `REAL PRODUCTS ON THIS WEBSITE (from ${baseUrl}${path}):\n${prodRes.mainText.slice(0, 2000)}`;
              break;
            }
          }
        }

        // ── Last resort: use heading categories from homepage scrape ──
        if (!productContext && scrapeCtx) {
          const h2s = (scrapeCtx.match(/H2s:\s*(.+)/) || [])[1] ?? "";
          const h3s = (scrapeCtx.match(/H3s:\s*(.+)/) || [])[1] ?? "";
          if (h2s || h3s) {
            productContext = `PRODUCT CATEGORIES FROM WEBSITE:\n${[h2s, h3s].filter(Boolean).join("\n")}`;
          }
        }
      } catch (prodErr) {
        console.log("[Products] Fetch skipped:", prodErr.message);
      }

      // ── Build price range from ALL sources ────────────────────
      const priceMatches = (scrapeCtx + " " + auditText).match(/₹\s*[\d,]+(?:\s*[-–to]+\s*₹?\s*[\d,]+)?/g) || [];
      const numericPrices = [
        ...priceMatches.map(p => parseInt(p.replace(/[₹,\s]/g, "").match(/\d+/)?.[0] || "0")),
        ...allExtractedPrices,
      ].filter(n => n > 50);
      const maxPrice = numericPrices.length ? Math.max(...numericPrices) : null;
      const minPrice = numericPrices.length ? Math.min(...numericPrices) : null;
      const priceRangeLine = maxPrice
        ? `PRICE RANGE OF THIS BRAND: ₹${minPrice?.toLocaleString("en-IN")} – ₹${maxPrice.toLocaleString("en-IN")} (MAX ₹${maxPrice.toLocaleString("en-IN")}). NEVER write any price above ₹${maxPrice.toLocaleString("en-IN")} in the blog.`
        : "";

      // ── Category filter annotation ────────────────────────────
      // Tell the blog AI which category keywords to enforce for product validation.
      // This is the guard that prevents bracelet blogs from using anklet products
      // even if the raw product list contains both.
      const categoryFilterNote = detectedCategory
        ? `\nCATEGORY FILTER ACTIVE: Blog topic = "${resolvedTopic}". ONLY use products whose names contain at least one of these keywords: [${detectedCategory.keywords.join(" | ")}]. Any product whose name does NOT contain one of these keywords → REJECT it, do not include it in the blog.\nIf fewer than 3 valid products remain after filtering → stop and output: "ERROR: No [topic category] products found. Please supply ${detectedCategory.keywords[0]} product names and prices manually."`
        : "";

      // ── Brand name label ──────────────────────────────────────
      const brandNameLine = extractedBrandName
        ? `Brand Name: ${extractedBrandName}`
        : "";

      const websiteContext = [
        brandNameLine,
        priceRangeLine,
        categoryFilterNote,
        scrapeCtx ? scrapeCtx.slice(0, 500) : "",
        auditText ? auditText.slice(0, 300) : "",
        productContext ? productContext.slice(0, 2500) : "",
      ].filter(Boolean).join("\n\n").trim();
      stepInputsRef.current[5].websiteContext = websiteContext;
      stepInputsRef.current[5].productContext = productContext;

      const d6raw = await callSEO(PROMPT_STEP6(resolvedTopic, outNote, ragContext, contentType, blueprintStructure, targetReader, corePromise, websiteContext, extractedBrandName), 8000);

      // ── Auto-format into paragraphs before showing to user ───
      let finalBlogText = d6raw.text;

      // ── Post-processing scrubs (before format step) ───────────
      // 1. Strip "Alippo" anywhere — it's the platform name, not the client brand
      finalBlogText = finalBlogText.replace(/\bAlippo\b/gi, (match) => {
        // Try to extract the brand name from scrapeCtx title or auditText
        const brandMatch =
          scrapeCtx.match(/Title:\s*([^\n|–\-]+)/i)?.[1]?.split(/[\|\-–]/)[0]?.trim() ||
          auditText.match(/Brand(?:\s*Name)?:\s*([^\n]+)/i)?.[1]?.trim() ||
          "our brand";
        return brandMatch;
      });

      // 2. Strip prompt-artifact H2/H3 headings that leaked into output
      // These look like: "## Modified Keyword Integration" or "## SEO Section"
      const ARTIFACT_HEADING_PATTERN = /^#{1,3}\s+(?:Modified\s+Keyword\s+Integration|Keyword\s+Integration|SEO\s+Section|Step\s+\d+|Section\s+\d+|Prompt\s+\w+|Blueprint\s+\w+)\b.*/gim;
      finalBlogText = finalBlogText.replace(ARTIFACT_HEADING_PATTERN, "")
        .replace(/\n{3,}/g, "\n\n"); // collapse extra blank lines left behind
      try {
        const d6fmt = await callSEO(PROMPT_STEP6_FORMAT(finalBlogText), 8000);
        if (d6fmt?.text && d6fmt.text.length > 200) {
          finalBlogText = d6fmt.text;
          // Re-apply scrubs — format AI can re-introduce artifacts
          finalBlogText = finalBlogText
            .replace(/\bAlippo\b/gi, () =>
              scrapeCtx.match(/Title:\s*([^\n|–\-]+)/i)?.[1]?.split(/[\|\-–]/)[0]?.trim() ||
              auditText.match(/Brand(?:\s*Name)?:\s*([^\n]+)/i)?.[1]?.trim() || "our brand"
            )
            .replace(ARTIFACT_HEADING_PATTERN, "")
            .replace(/\n{3,}/g, "\n\n");
        }
      } catch (fmtErr) {
        console.log("[Format] Paragraph formatting skipped:", fmtErr.message);
        // fallback: use original blog text
      }

      try {
        const quality = QualityAssurance.validateStep(5, finalBlogText);
        patchStep(5, { quality });
        if (quality.qualityScore < 70)
          console.warn(`[Quality] Score ${quality.qualityScore}% — below 70% threshold`);
      } catch (err) {
        console.log("[Quality] Check skipped:", err.message);
      }

      // Show revision gate — user can approve or give feedback
      patchStep(5, {
        status  : "waiting",
        text    : finalBlogText,
        canRetry: false,
        gate    : {
          type       : "text",
          prompt     : "Happy with this blog? Approve or request changes.",
          hint       : "Type 'approve' to move to SEO optimisation, or describe what to change.",
          placeholder: "approve, or describe what to improve…",
          onSubmit   : (ans) => {
            if (["approve", "yes", "looks good", "perfect", "proceed"].some(w => ans.toLowerCase().includes(w))) {
              patchStep(5, { gate: null, status: "done" });
            } else {
              runStep6Revise(ans);
            }
          },
        },
      });
    } catch (e) {
      patchStep(5, { status: "error", error: e.message, canRetry: true });
    }
  }, [callSEO, patchStep]);

  // ── Step 5 → now Step 4 ──────────────────────────────────────
  const runStep5 = useCallback(async (topicChoice, keywordAnswer) => {
    // Always resolve — topicChoice may still be a number if called from retry
    const resolvedTopic = resolveTopicChoice(topicChoice, stepDataRef.current[2]?.text);
    patchStep(3, { gate: null, status: "done" });
    const kwNote = !["proceed", "yes"].includes(keywordAnswer.toLowerCase())
      ? `\n\nNote: Keyword modifications requested: "${keywordAnswer}". Please adjust accordingly.`
      : "";
    stepInputsRef.current[4] = { topic: resolvedTopic, kwNote };
    patchStep(4, { status: "loading" });
    try {
      const d5 = await callSEO(PROMPT_STEP5(resolvedTopic, kwNote));
      // Auto-proceed — blueprint is shown but no approval gate needed
      // Approval happens after the blog is generated (Step 5)
      patchStep(4, { status: "done", text: d5.text, canRetry: false });
      // Immediately trigger Step 6 (now Step 5)
      runStep6(resolvedTopic, "approve");
    } catch (e) {
      patchStep(4, { status: "error", error: e.message, canRetry: true });
    }
  }, [callSEO, patchStep, runStep6]);

  // ── Step 4 → now Step 3 ──────────────────────────────────────
  const runStep4 = useCallback(async (topicChoice, primaryKeyword) => {
    // Step 2 now always provides the full resolved title — no number-parsing needed
    const resolvedTopic = topicChoice || resolveTopicChoice(topicChoice, "");
    const serpQuery = primaryKeyword || resolvedTopic;
    stepInputsRef.current[3] = { topic: resolvedTopic, originalChoice: topicChoice, primaryKeyword: primaryKeyword || "" };
    patchStep(2, { gate: null, status: "done" });
    patchStep(3, { status: "loading" });
    try {
      const serpRes    = await fetchSERP(serpQuery);
      const serpDataStr = serpRes ? JSON.stringify(serpRes.organic ?? []) : "";
      stepInputsRef.current[3].serpDataStr = serpDataStr;

      const d4      = await callSEO(PROMPT_STEP4(resolvedTopic, serpDataStr), 4096, true);
      const keywords = extractKeywords(d4.text);
      if (keywords.length) checkRankings(siteUrlRef.current, keywords);

      patchStep(3, {
        status: "waiting", text: d4.text, serpData: serpRes, canRetry: false,
        gate: {
          type       : "text",
          prompt     : "Proceed with these keywords, or modify them?",
          hint       : "Type 'proceed' to continue, or describe modifications.",
          placeholder: "proceed, or describe changes…",
          onSubmit   : (ans) => runStep5(resolvedTopic, ans),
        },
      });
    } catch (e) {
      patchStep(3, { status: "error", error: e.message, canRetry: true });
    }
  }, [callSEO, patchStep, checkRankings, runStep5]);

  // ── Step 2 — Smart Topic Recommendation ─────────────────────
  const runStep2Recommend = useCallback(async (targetMonth) => {
    // Capture the previously recommended topic BEFORE resetting step data
    // so we can tell the API "don't suggest this again"
    const previousTopic = stepDataRef.current[2]?.recommendation?.recommendedTopic ?? "";

    stepInputsRef.current[2] = {};
    patchStep(2, { status: "loading", recommendation: null, text: null });
    try {
      const auditText = stepDataRef.current[1]?.text ?? "";
      const scrapeCtx = stepInputsRef.current[1]?.scrapeContext ?? "";
      const siteUrl   = siteUrlRef.current;
      const niche     = extractNicheFromAudit(auditText, scrapeCtx);

      const resolvedMonth = targetMonth || new Date().toLocaleString("en-US", {
        month: "long", timeZone: "Asia/Kolkata",
      });

      stepInputsRef.current[2] = { niche, targetMonth: resolvedMonth };

      const res = await fetch("/api/topic-recommend", {
        method : "POST",
        cache  : "no-store",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({
          siteUrl,
          niche,
          brandAudit  : auditText.slice(0, 1200),
          scrapeContext: scrapeCtx.slice(0, 1500),
          targetMonth : resolvedMonth,
          _salt       : Math.random().toString(36).substring(2, 9),
          // Tell the API which topic was previously shown — forces a fresh suggestion
          avoidTopic  : previousTopic || "",
        }),
      }).then(r => r.json());

      if (res.error) throw new Error(res.error);

      stepInputsRef.current[2].primaryKeyword = res.recommendation?.primaryKeyword ?? "";
      stepInputsRef.current[2].recommendedTopic = res.recommendation?.recommendedTopic ?? "";

      patchStep(2, {
        status         : "waiting",
        text           : null,
        recommendation : res.recommendation,
        lastBlog       : res.lastBlog,
        festival       : res.festival,
        isFirstBlog    : res.isFirstBlog,
        targetMonth    : res.targetMonth,
        canRetry       : false,
        gate           : { type: "topic-recommendation" },
      });
    } catch (e) {
      patchStep(2, { status: "error", error: e.message, canRetry: true });
    }
  }, [patchStep]);


  // ── Step 1 ───────────────────────────────────────────────────
  const runWorkflow = useCallback(async (rawUrl, context) => {
    stepInputsRef.current[1] = { url: rawUrl, ...context };
    patchStep(1, { status: "loading" });
    try {
      const scrapeRes = await fetch("/api/scrape", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ url: rawUrl }),
      }).then(r => r.json()).catch(() => null);

      const scrapeContext = scrapeRes && !scrapeRes.error
        ? [
            `Title: ${scrapeRes.title}`,       `Desc: ${scrapeRes.description}`,
            `Canonical: ${scrapeRes.canonical}`, `Robots: ${scrapeRes.robots}`,
            `H1: ${scrapeRes.h1}`,               `H2s: ${scrapeRes.h2s}`,
            `H3s: ${scrapeRes.h3s}`,             `Core Content Sample: ${scrapeRes.mainText}`,
          ].join("\n")
        : "";
      stepInputsRef.current[1].scrapeContext = scrapeContext;

      const d1 = await callSEO(PROMPT_STEP1(rawUrl, context, scrapeContext));
      patchStep(1, { status: "done", text: d1.text, canRetry: false });
    } catch (e) {
      patchStep(1, { status: "error", error: e.message, canRetry: true });
    }
  }, [callSEO, patchStep]);

  // ── Reactive Chain ───────────────────────────────────────────
  const runStep2RecommendRef = useRef(runStep2Recommend);
  const runStep7Ref = useRef(runStep7);
  const runStep8Ref = useRef(runStep8);
  useEffect(() => { runStep2RecommendRef.current = runStep2Recommend; }, [runStep2Recommend]);
  useEffect(() => { runStep7Ref.current = runStep7; }, [runStep7]);
  useEffect(() => { runStep8Ref.current = runStep8; }, [runStep8]);

  useEffect(() => {
    if (phase !== "running") return;
    if (stepData[1]?.status === "done" && !stepData[2]) runStep2RecommendRef.current();
    if (stepData[5]?.status === "done" && !stepData[6]) runStep7Ref.current();
    if (stepData[6]?.status === "done" && !stepData[7]) runStep8Ref.current();
  }, [phase, stepData]);

  // ── Retry ────────────────────────────────────────────────────
  const retryStep = useCallback(async (stepId) => {
    const inp = stepInputsRef.current[stepId];
    if (!inp) return;
    patchStep(stepId, { status: "loading", error: null });

    const handlers = {
      1: () => callSEO(PROMPT_STEP1(inp.url, inp, inp.scrapeContext), 4096, true),
      2: () => runStep2RecommendRef.current(stepInputsRef.current[2]?.targetMonth),
      3: () => callSEO(PROMPT_STEP4(inp.topic, inp.serpDataStr),                      4096, true),
      4: () => callSEO(PROMPT_STEP5(inp.topic, inp.kwNote ?? ""),                     4096, true),
      5: () => callSEO(PROMPT_STEP6(inp.topic, inp.outNote, inp.ragContext, inp.contentType ?? "", inp.blueprintStructure ?? "", inp.targetReader ?? "", inp.corePromise ?? "", inp.websiteContext ?? "", inp.brandName ?? ""), 8000, true),
      6: () => callSEO(PROMPT_STEP7(),                                                 4096, true),
      7: () => callSEO(PROMPT_STEP8(stepInputsRef.current[3]?.topic ?? "", "", siteUrlRef.current, ""), 3000, true),
    };

    try {
      const result = await handlers[stepId]?.();
      if (result) patchStep(stepId, { status: "done", text: result.text, canRetry: false });
    } catch (e) {
      patchStep(stepId, { status: "error", error: e.message, canRetry: true });
    }
  }, [callSEO, patchStep]);

  // ── Gate Handler ─────────────────────────────────────────────
  const handleGateSubmit = useCallback((stepId, value) => {
    const topic = stepInputsRef.current[3]?.topic ?? "";
    switch (stepId) {
      case 2: {
        // value = the recommended (or user-confirmed) topic title
        const primaryKw = stepInputsRef.current[2]?.primaryKeyword ?? "";
        runStep4(value, primaryKw);
        break;
      }
      case 3: runStep5(topic, value); break;
      case 4: runStep6(topic, value); break;
      default: console.warn("[Gate] No handler for step", stepId);
    }
  }, [runStep4, runStep5, runStep6]);

  // ── Session Restore ──────────────────────────────────────────
  function restoreSession() {
    const session = loadSession();
    if (!session) return;

    setUrl(session.url ?? "");
    setSiteUrl(session.siteUrl ?? "");
    siteUrlRef.current = session.siteUrl ?? "";
    setPhase(session.phase ?? "idle");
    dispatchStep({ type: "RESET" });
    Object.entries(session.stepData ?? {}).forEach(([id, data]) =>
      dispatchStep({ type: "PATCH", id: Number(id), patch: data })
    );
    setProvider(session.provider ?? "gemini");
    if (session.brandContext) setBrandContextState(session.brandContext);
    conversationRef.current = session.conversation ?? [];
    setHasSession(false);

    if (session.phase === "running") {
      const lastDone = Math.max(
        0,
        ...Object.entries(session.stepData ?? {})
          .filter(([, d]) => d.status === "done")
          .map(([id]) => parseInt(id))
      );
      setTimeout(() => resumeWorkflow(session.siteUrl, lastDone), 800);
    }
  }

  async function resumeWorkflow(targetUrl, lastDone) {
    siteUrlRef.current = targetUrl;
    if (lastDone === 0) runWorkflow(targetUrl, brandContextRef.current);
    else if (lastDone === 1) runStep2RecommendRef.current();
    else if (lastDone === 5) runStep7();
    else if (lastDone === 6) runStep8();
  }

  function dismissSession() {
    clearSession();
    setHasSession(false);
  }

  // ── Start / Reset ────────────────────────────────────────────
  function start() {
    if (!url.trim()) return;
    let clean = url.trim();
    setUrlError("");
    try {
      if (!clean.startsWith("http")) clean = `https://${clean}`;
      const parsed = new URL(clean);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Invalid protocol");
      if (clean.length > 2048)                             throw new Error("URL too long");
      clean = parsed.href;
    } catch {
      setUrlError("Invalid URL format. Please enter a valid website URL.");
      return;
    }
    conversationRef.current = [];
    stepInputsRef.current   = {};
    dispatchStep({ type: "RESET" });
    setSiteUrl(clean);
    siteUrlRef.current = clean;
    setPhase("running");
    runWorkflow(clean, brandContext);
  }

  function reset() {
    setPhase("idle");
    setUrl(""); setUrlError(""); setSiteUrl("");
    dispatchStep({ type: "RESET" });
    setBrandContextState({ category: "", products: "", audience: "" });
    conversationRef.current = [];
    stepInputsRef.current   = {};
    setInternalData({ radar: null, velocity: 0, rankings: [] });
    clearSession();
    setHasSession(false);
  }

  // ── Derived Values ───────────────────────────────────────────
  const renderedSteps = useMemo(
    () => STEPS.filter(s => stepData[s.id]),
    [stepData]
  );

  const allDone = useMemo(
    () => STEPS.every(s => stepData[s.id]?.status === "done"),
    [stepData]
  );

  const progressPct = useMemo(() => {
    const done = STEPS.filter(s => stepData[s.id]?.status === "done").length;
    return Math.round((done / STEPS.length) * 100);
  }, [stepData]);

  const activeStepId = useMemo(() => {
    const active = STEPS.find(
      s => stepData[s.id]?.status === "loading" || stepData[s.id]?.status === "waiting"
    );
    if (active) return active.id;
    const doneIds = STEPS.filter(s => stepData[s.id]?.status === "done").map(s => s.id);
    if (!doneIds.length) return 1;
    const lastDone = Math.max(...doneIds);
    return STEPS.find(s => s.id === lastDone + 1)?.id ?? lastDone;
  }, [stepData]);

  // ── Public API ───────────────────────────────────────────────
  return {
    url, setUrl, urlError,
    provider, setProvider,
    phase, siteUrl,
    stepData, renderedSteps, allDone,
    start, reset, retryStep, handleGateSubmit,
    bottomRef,
    steps: STEPS,
    hasSession, restoreSession, dismissSession,
    progressPct, activeStepId,
    brandContext,
    businessCategory : brandContext.category,
    keyProducts      : brandContext.products,
    targetAudience   : brandContext.audience,
    setBusinessCategory: (v) => setBrandContext("category", v),
    setKeyProducts     : (v) => setBrandContext("products", v),
    setTargetAudience  : (v) => setBrandContext("audience", v),
    internalData,
    isGeneratingVariations,
    generateVariations,
    regenerateTopicRecommendation: runStep2Recommend,
  };
}
