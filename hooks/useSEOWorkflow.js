"use client";

import {
  useState, useRef, useEffect,
  useCallback, useMemo, useReducer,
} from "react";
import { QualityAssurance } from "@/lib/qualityAssurance";
import {
  STEPS, SYSTEM_PROMPT,
  PROMPT_STEP1, PROMPT_STEP3,
  PROMPT_STEP4, PROMPT_STEP5, PROMPT_STEP6, PROMPT_STEP6_FORMAT,
  PROMPT_STEP6_REVISE, PROMPT_STEP7, PROMPT_STEP8, PROMPT_TIGHTEN,
  PROMPT_VALIDATE_SYSTEM, PROMPT_VALIDATE, PROMPT_POST_VALIDATE,
} from "@/lib/constants";
import { scanVocab, buildVocabFixPrompt } from "@/lib/vocabularyCaps";
import { detectMaterials, buildMaterialConstraints, scanMaterialViolations } from "@/lib/materialsKnowledge";
import {
  getExclusionList, getPillarUsage, getLastPillar, getLockedOccasions,
  addToTopicHistory, isSemanticallyDuplicate,
} from "@/lib/topicHistory";
import { detectPillar } from "@/lib/contentPillars";
import {
  classifyProducts, filterProductsByTopicType, detectTopicProductType,
  validateBodyProductAlignment,
} from "@/lib/productTaxonomy";

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
    brandName: "", category: "", products: "", audience: "",
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
  const runStep9 = useCallback(async () => {
    stepInputsRef.current[8] = {};
    patchStep(8, { status: "loading" });
    try {
      // Gather context from previous steps
      const topic       = stepInputsRef.current[6]?.topic
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
      patchStep(8, { status: "done", text: d8.text, canRetry: false });
      setPhase("done");
      clearSession();
    } catch (e) {
      patchStep(8, { status: "error", error: e.message, canRetry: true });
    }
  }, [callSEO, patchStep]);

  // ── Step 7 → now Step 6 — SEO + GEO Layer ───────────────────
  const runStep8 = useCallback(async () => {
    stepInputsRef.current[7] = {};
    patchStep(7, { status: "loading" });
    try {
      const d7 = await callSEO(PROMPT_STEP7());
      patchStep(7, { status: "done", text: d7.text, canRetry: false });
    } catch (e) {
      patchStep(7, { status: "error", error: e.message, canRetry: true });
    }
  }, [callSEO, patchStep]);

  // ── Step 6 ───────────────────────────────────────────────────
  // ── Step 6 Revision ─────────────────────────────────────────
  const runStep6Revise = useCallback(async (feedback) => {
    patchStep(6, { status: "loading", gate: null });
    try {
      const inp            = stepInputsRef.current[6];
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

      patchStep(6, {
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
              patchStep(6, { gate: null, status: "done" });
            } else {
              runStep6Revise(ans);
            }
          },
        },
      });
    } catch (e) {
      patchStep(6, { status: "error", error: e.message, canRetry: true });
    }
  }, [callSEO, patchStep]);

  // ── Step 5 — Validation Checkpoint ─────────────────────────────
  const runStep5Validate = useCallback(async (topicChoice, outlineAnswer, blueprintTextDirect = null) => {
    patchStep(5, { status: "loading", text: null, error: null });
    stepInputsRef.current[5] = { topicChoice, outlineAnswer };

    try {
      const auditText   = stepDataRef.current[1]?.text ?? "";
      const scrapeCtx   = stepInputsRef.current[1]?.scrapeContext ?? "";
      const siteUrl     = siteUrlRef.current ?? "";
      // Use directly-passed blueprint text to avoid stepDataRef timing lag
      const blueprintText = blueprintTextDirect || stepDataRef.current[4]?.text || "";
      const resolvedTopic = resolveTopicChoice(topicChoice, stepDataRef.current[2]?.text);

      // Topic history for batch_history
      const batchHistory = (() => {
        try { return JSON.parse(localStorage.getItem(`blogiq_topic_history_${new URL(siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`).hostname.replace(/^www\./, "")}`) || "[]").slice(0, 10); }
        catch { return []; }
      })();

      // Build a lightweight product catalog JSON from scrapeCtx for the validator
      const prodLines = scrapeCtx.match(/• .+ — ₹[\d,]+/g) || [];
      const catalogForValidator = prodLines.map((line, i) => {
        const name  = line.replace(/^• /, "").replace(/ — ₹.*$/, "").trim();
        const price = (line.match(/₹([\d,]+)/) || [])[1] || "";
        return { id: `p${i}`, name, price: `₹${price}`, handle: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") };
      });

      // Extract brand name and config
      const brandName = brandContextRef.current.brandName || "";
      const priceFormat = "₹{amount}";

      // ── Fast-pass: skip Gemini validation when catalog is empty ──
      // The blueprint at this stage is a structural outline — it never contains
      // product names. Gemini keeps blocking on "insufficient_catalog_match"
      // because it cannot distinguish a structure outline from a draft.
      // Product validation happens POST-generation on the actual blog text.
      // Only run Gemini validation when we have a real product catalog to check.
      if (catalogForValidator.length === 0) {
        patchStep(5, {
          status: "done",
          text: "## Validation Checkpoint — PASSED\n\nNo product catalog available at blueprint stage — product validation will run automatically after blog generation.\n\nProceeding to blog post generation...",
          canRetry: false,
          validationStatus: "fast-pass",
          lockedSnapshot: null,
        });
        runStep6(topicChoice, outlineAnswer, null);
        return;
      }

      // Detect if blueprint is a structure outline (no product names yet)
      // Products are injected during blog generation — Block A must be a warning, not a block
      const blueprintHasProducts = catalogForValidator.length > 0 &&
        catalogForValidator.some(p => p.name && blueprintText.toLowerCase().includes(p.name.toLowerCase().slice(0, 8)));
      const blockAMode = blueprintHasProducts ? "block" : "warn";

      const validationPrompt = PROMPT_VALIDATE({
        brandName,
        brandTone:    auditText.match(/tone[:\s]+([^\n.]+)/i)?.[1]?.trim() || "warm and helpful",
        brandVoice:   [],
        bannedPhrases: [],
        priceFormat,
        allowsHinglish: true,
        productCatalog: catalogForValidator,
        approvedTopic:  resolvedTopic,
        targetKeyword:  stepInputsRef.current[2]?.primaryKeyword || resolvedTopic,
        blueprintText,
        batchHistory,
        festivalContext: [],
        currentDate: new Date().toISOString().split("T")[0],
        blockAMode, // "warn" when blueprint is a structure outline (products added later in blog step)
      });

      // Call with JSON mode via callSEO (adds to conversation, uses Gemini)
      const dValidate = await callSEO(validationPrompt, 4096, true);
      let validationResult = null;
      try {
        const cleaned = (dValidate.text || "")
          .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
          .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "")
          .trim();
        validationResult = JSON.parse(cleaned);
      } catch {
        const m = (dValidate.text || "").match(/\{[\s\S]*\}/);
        if (m) { try { validationResult = JSON.parse(m[0]); } catch { /* */ } }
      }

      if (!validationResult) {
        // If parsing fails, treat as a soft pass and proceed
        console.warn("[Validate] Could not parse validation JSON — treating as soft pass");
        validationResult = { status: "pass", validation_summary: { blocks_passed: [], warnings: [] }, locked_snapshot: null };
      }

      // Store validation result and locked_snapshot for blog step
      stepInputsRef.current[5].validationResult = validationResult;
      stepInputsRef.current[5].lockedSnapshot   = validationResult.locked_snapshot || null;

      // Safety net: if the only failures are catalog-related (Block A),
      // auto-convert to pass — catalog checks run post-generation instead.
      // This prevents Gemini's ambiguous catalog logic from permanently blocking.
      const CATALOG_ONLY_FAILURE_TYPES = [
        "insufficient_catalog_match", "product_overused",
        "product_class_mismatch", "missing_price", "insufficient_links",
        "floating_price",
      ];
      if (validationResult.status === "block") {
        const failures = validationResult.failures || [];
        const nonCatalogFailures = failures.filter(
          f => !CATALOG_ONLY_FAILURE_TYPES.includes(f.failure_type)
        );
        if (nonCatalogFailures.length === 0 && failures.length > 0) {
          // All failures are catalog-related — demote to warnings and proceed
          console.log("[Validate] All block failures are catalog-related — auto-pass, will check post-gen");
          validationResult = {
            ...validationResult,
            status: "pass",
            validation_summary: {
              blocks_passed: ["B", "C", "F"],
              warnings: [
                ...(validationResult.warnings || []),
                ...failures.map(f => ({ block: f.block, type: f.failure_type, detail: f.detail + " (deferred to post-generation check)" })),
              ],
            },
          };
        }
      }

      if (validationResult.status === "block") {
        // Hard block — show failures, stop here
        patchStep(5, {
          status   : "waiting",
          text     : `## Validation Checkpoint — BLOCKED\n\nThe following issues must be resolved before the blog can be generated:\n\n${
            (validationResult.failures || []).map(f =>
              `**${f.block} — ${f.failure_type}**: ${f.detail}\n> Affected: ${f.affected_text || "—"}\n> Fix: ${f.remediation || "—"}`
            ).join("\n\n")
          }${
            validationResult.warnings?.length
              ? `\n\n### Warnings (non-blocking):\n${validationResult.warnings.map(w => `- ${w.block}: ${w.type} — ${w.detail}`).join("\n")}`
              : ""
          }`,
          canRetry : true,
          validationStatus: "block",
          failures : validationResult.failures || [],
          warnings : validationResult.warnings || [],
          gate: {
            type: "text",
            prompt: "Validation blocked. Review the issues above, then type 'retry' to re-run validation or 'skip' to proceed anyway (not recommended).",
            placeholder: "retry or skip...",
            onSubmit: (ans) => {
              if (ans.toLowerCase().includes("skip")) {
                patchStep(5, { gate: null, status: "done", validationStatus: "skipped" });
                runStep6BlogPost(topicChoice, outlineAnswer, null);
              } else {
                runStep5Validate(topicChoice, outlineAnswer);
              }
            },
          },
        });
      } else {
        // Pass or warn — proceed to blog generation
        const warnings = validationResult.warnings || [];
        patchStep(5, {
          status : "done",
          text   : `## Validation Checkpoint — ${warnings.length ? "PASSED WITH WARNINGS" : "PASSED"}\n\n${
            validationResult.validation_summary
              ? `Blocks passed: ${(validationResult.validation_summary.blocks_passed || []).join(", ") || "A, B, C, D, E, F"}`
              : "All checks passed."
          }${
            warnings.length
              ? `\n\n### Warnings:\n${warnings.map(w => `- ${w.block}: ${w.type} — ${w.detail}`).join("\n")}`
              : ""
          }\n\nProceeding to blog generation...`,
          canRetry: false,
          validationStatus: "pass",
          lockedSnapshot: validationResult.locked_snapshot || null,
        });
        // Immediately proceed to blog post
        runStep6BlogPost(topicChoice, outlineAnswer, validationResult.locked_snapshot || null);
      }
    } catch (e) {
      // Validation step error — don't block blog, just log and proceed
      console.warn("[Validate] Step error:", e.message);
      patchStep(5, { status: "done", text: `Validation skipped (${e.message}) — proceeding to blog generation.`, canRetry: false });
      runStep6BlogPost(topicChoice, outlineAnswer, null);
    }
  }, [callSEO, patchStep]);

  // ── Step 6 — Blog Post (renamed from runStep6) ──────────────────
  const runStep6BlogPost = useCallback(async (topicChoice, outlineAnswer, lockedSnapshot) => {
    // Alias for internal use — the gate still calls runStep6 below
    return runStep6(topicChoice, outlineAnswer, lockedSnapshot);
  }, []);

  const runStep6 = useCallback(async (topicChoice, outlineAnswer, lockedSnapshot = null) => {
    const outNote = !["approve", "yes"].includes((outlineAnswer || "approve").toLowerCase())
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

    stepInputsRef.current[6] = { topic: resolvedTopic, outNote, contentType, blueprintStructure, targetReader, corePromise };
    patchStep(6, { status: "loading" });
    try {
      const ragRes    = await fetchSERP(resolvedTopic);
      const ragContext = ragRes ? JSON.stringify(ragRes.organic?.slice(0, 4) ?? []) : "";
      stepInputsRef.current[6].ragContext = ragContext;

      // ── Build website context from Step 1 audit ───────────────
      const auditText   = stepDataRef.current[1]?.text ?? "";
      const scrapeCtx   = stepInputsRef.current[1]?.scrapeContext ?? "";
      const siteUrl     = siteUrlRef.current ?? "";

      // ── Brand name — ONLY from the user-provided input variable ──
      // Never derived from HTML title, meta tags, H1, or any scraped element.
      // If the user did not provide a brand name, or provided a generic
      // platform default, the blog generation will be blocked by the prompt.
      const GENERIC_BRAND_WORDS = /^(jewellery\s+website|silver\s+jewellery|fashion\s+store|online\s+store|my\s+store|our\s+store|e-?commerce\s+store|store|shop|website|brand|company|business)$/i;
      const rawBrandName = (brandContextRef.current.brandName || "").trim();
      const extractedBrandName = GENERIC_BRAND_WORDS.test(rawBrandName) ? "" : rawBrandName;
      stepInputsRef.current[6].brandName = extractedBrandName;

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

      // ── Category detection — hoisted above try so it's accessible after ──
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
      const detectedCategory = CATEGORY_SLUG_MAP.find(c =>
        c.keywords.some(kw => resolvedTopic.toLowerCase().includes(kw))
      ) ?? null;

      try {
        const baseUrl = siteUrl.replace(/\/+$/, "");

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
            productContext = `PRODUCT CATEGORIES FROM WEBSITE (category names only — no confirmed products with prices):\n${[h2s, h3s].filter(Boolean).join("\n")}`;
          }
        }
      } catch (prodErr) {
        console.log("[Products] Fetch skipped:", prodErr.message);
      }

      // ── Hard gate: track whether real products with prices were found ──
      // If productContext has no confirmed prices (• Name — ₹Price format),
      // the AI has no real product list and WILL hallucinate product names.
      const hasConfirmedProducts = /^• .+ — ₹[\d,]+/m.test(productContext || "");
      const emptyProductWarning = !hasConfirmedProducts
        ? `\n⚠️ NO CONFIRMED PRODUCTS WITH PRICES FOUND: The product scraper could not extract real products with prices from this website. This means:\n1. Do NOT write about any specific product by name — you have no confirmed product names.\n2. Do NOT invent product names like "Sandal Bloom Toner" or "Silk Repair Cream" from your training knowledge.\n3. Write a general educational blog without naming specific SKUs in the body.\n4. In the product recommendations section, describe what to LOOK FOR when choosing from this brand's category, rather than naming specific products.\n5. Include a note: "Visit [Brand]'s website to browse current products and pricing."\nThis constraint overrides all other product-related instructions.`
        : "";

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

      // ── Catalog-driven tier map (Feature 1) ──────────────────
      // Build price tiers from real SKUs so the AI never creates phantom tier H2s.
      let tierMap = "";
      if (allExtractedPrices.length >= 2) {
        const sorted = [...allExtractedPrices].sort((a, b) => a - b);
        const lo = sorted[0], hi = sorted[sorted.length - 1];
        const spread = hi - lo;
        if (spread < 1000 || sorted.length < 4) {
          // All products in one tier — no price-tier framing needed
          tierMap = `Single tier: all products ₹${lo.toLocaleString("en-IN")}–₹${hi.toLocaleString("en-IN")}. Use a single "${extractedBrandName || "Brand"} picks" section. Do NOT create price-tier H2 headings.`;
        } else {
          // Split into at most 2 natural tiers based on median
          const mid = sorted[Math.floor(sorted.length / 2)];
          const tier1 = sorted.filter(p => p <= mid);
          const tier2 = sorted.filter(p => p > mid);
          const lines = [];
          if (tier1.length >= 2) lines.push(`Tier 1 (₹${tier1[0].toLocaleString("en-IN")}–₹${tier1[tier1.length-1].toLocaleString("en-IN")}): ${tier1.length} products`);
          if (tier2.length >= 2) lines.push(`Tier 2 (₹${tier2[0].toLocaleString("en-IN")}–₹${tier2[tier2.length-1].toLocaleString("en-IN")}): ${tier2.length} products`);
          tierMap = lines.length ? lines.join("\n") : "";
        }
      }

      // ── Material detection + constraints (Feature 3) ──────────
      const detectedMaterials = detectMaterials(productContext + " " + scrapeCtx);
      const materialConstraints = buildMaterialConstraints(detectedMaterials);

      // ── Occasion urgency (Feature 7) ─────────────────────────
      // Detect if this is a gifting/occasion blog and compute order-by date.
      let urgencyLine = "";
      const OCCASION_PATTERNS = [
        { re: /father'?s\s*day/i,    days: 14 },
        { re: /mother'?s\s*day/i,    days: 14 },
        { re: /diwali/i,             days: 10 },
        { re: /raksha\s*bandhan|rakhi/i, days: 7 },
        { re: /eid/i,                days: 7  },
        { re: /christmas/i,          days: 10 },
        { re: /valentine'?s/i,       days: 7  },
        { re: /anniversary/i,        days: 5  },
        { re: /birthday/i,           days: 5  },
        { re: /navratri/i,           days: 5  },
        { re: /onam/i,               days: 5  },
        { re: /pongal/i,             days: 5  },
      ];
      for (const { re, days } of OCCASION_PATTERNS) {
        if (re.test(resolvedTopic)) {
          const orderBy = new Date();
          orderBy.setDate(orderBy.getDate() + Math.max(0, days - 3));
          const orderByStr = orderBy.toLocaleDateString("en-IN", { day: "numeric", month: "long" });
          urgencyLine = `Order by ${orderByStr} for delivery before the occasion.`;
          break;
        }
      }

      // ── Policy page scraping for brand-specific FAQ (Feature 8) ──
      let policyContext = "";
      try {
        const baseUrl = siteUrl.replace(/\/+$/, "");
        const policyPaths = ["/shipping-policy", "/refund-policy", "/care-guide",
                             "/shipping", "/returns", "/faq", "/about-us"];
        const policyTexts = [];
        for (const path of policyPaths.slice(0, 4)) { // cap at 4 pages
          const pRes = await fetch("/api/scrape", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: baseUrl + path }),
          }).then(r => r.json()).catch(() => null);
          if (pRes?.mainText && pRes.mainText.length > 80 && !pRes.error) {
            policyTexts.push(`[${path}]: ${pRes.mainText.slice(0, 400)}`);
          }
        }
        if (policyTexts.length) policyContext = policyTexts.join("\n\n");
      } catch (_) { /* policy scraping is best-effort */ }

      // ── Product type classification + topic-aligned filtering ────
      // Classify every scraped product into its normalised type (hoops, studs, etc.)
      // then hard-filter to only products matching the blog topic.
      // This is the fix for: "hoops topic → stud/drop products recommended"
      const niche = extractNicheFromAudit(auditText, scrapeCtx);
      let filteredProductContext = productContext;
      let topicProductType = null;
      let productTypeFilterApplied = false;
      let topicCategoryAvailable = true;

      try {
        if (productContext) {
          // Parse product names from the formatted product context string
          const rawProdLines = productContext.match(/^• (.+?) — ₹/gm) || [];
          const rawProds = rawProdLines.map(line => ({
            name: line.replace(/^• /, "").replace(/ — ₹.*$/, "").trim(),
          }));

          if (rawProds.length > 0) {
            const classified = classifyProducts(rawProds, niche);
            topicProductType = detectTopicProductType(resolvedTopic, niche);

            if (topicProductType) {
              const { products: filtered, sufficient } = filterProductsByTopicType(
                classified, topicProductType, 3
              );
              topicCategoryAvailable = sufficient;

              if (sufficient && filtered.length > 0) {
                // Rebuild product context with only matching products
                const matchingNames = new Set(filtered.map(p => p.name));
                const filteredLines = productContext
                  .split("\n")
                  .filter(line => {
                    if (!line.startsWith("• ")) return true; // keep headers
                    const name = line.replace(/^• /, "").replace(/ — ₹.*$/, "").trim();
                    return matchingNames.has(name);
                  })
                  .join("\n");
                filteredProductContext = filteredLines;
                productTypeFilterApplied = true;
                console.log(`[TopicFilter] ${niche} topic "${resolvedTopic}" → type: ${topicProductType.type}. Filtered ${rawProds.length} → ${filtered.length} products.`);
              } else if (!sufficient) {
                console.warn(`[TopicFilter] Insufficient products for type "${topicProductType?.type}" — ${filtered.length} found, 3 required.`);
              }
            }
          }
        }
      } catch (filterErr) {
        console.log("[TopicFilter] Classification skipped:", filterErr.message);
      }

      // ── Theme-level keyword extraction ────────────────────────
      // Extracts the specific variant/character from the topic title.
      // "Dinosaur Money Bank Painting Kits" → theme = "Dinosaur"
      // This is separate from category (painting kits) — it filters
      // within a category by the specific variant named in the topic.
      const GENERIC_PRODUCT_WORDS = new Set([
        'kit', 'kits', 'set', 'sets', 'pack', 'packs', 'combo', 'collection',
        'guide', 'best', 'top', 'how', 'for', 'and', 'with', 'the', 'a',
        'painting', 'drawing', 'craft', 'activity', 'money', 'bank', 'box',
        'bag', 'jewellery', 'jewelry', 'saree', 'blog', 'tips', 'ideas',
      ]);
      const topicTokens = resolvedTopic.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3 && !GENERIC_PRODUCT_WORDS.has(w));
      // The first significant token is likely the theme/variant word
      const detectedThemeKeyword = topicTokens[0] || null;

      // ── Category filter annotation ────────────────────────────
      const topicCategoryConstraint = topicProductType
        ? `\nTOPIC CATEGORY CONSTRAINT: This blog is specifically about "${topicProductType.type.replace(/_/g, " ")}" (category: ${topicProductType.category}). Every product you recommend MUST be of this exact type. If a product name does not match — REJECT it. Do NOT recommend ${topicProductType.category === "earrings" ? "studs, drops, teardrops, jhumkas, or any other earring type" : "adjacent product types"} when the topic is specifically about ${topicProductType.type.replace(/_/g, " ")}.`
        : "";

      // ── Theme keyword constraint ──────────────────────────────
      // If the topic has a specific variant/theme (Dinosaur, Unicorn, Chocolate, etc.)
      // enforce that ONLY products containing that keyword are recommended.
      const themeConstraint = detectedThemeKeyword
        ? `\nTHEME FILTER: The blog topic is specifically about "${detectedThemeKeyword}" — NOT the broader product category. ONLY recommend products whose name contains "${detectedThemeKeyword}". Products in the same category but different theme (e.g., Unicorn, Astronaut, Car when topic is Dinosaur) are DIFFERENT products — DO NOT include them. If fewer than 2 products match "${detectedThemeKeyword}", expand the scope to the full category and note that in the introduction.`
        : "";

      const categoryFilterNote = detectedCategory
        ? `\nCATEGORY FILTER ACTIVE: Blog topic = "${resolvedTopic}". Prefer products whose names contain: [${detectedCategory.keywords.join(" | ")}]. If fewer than 3 matching products exist, use the closest available products from the same category. Never output an error message — always write a complete blog with whatever products are available.`
        : "";

      // ── Brand name label ──────────────────────────────────────
      const brandNameLine = extractedBrandName
        ? `Brand Name: ${extractedBrandName}`
        : "";

      // ── Product URLs for internal linking ────────────────────
      // Construct best-guess product URLs from product names so the AI
      // can generate real internal links instead of placeholder text.
      const productUrlMap = (() => {
        const lines = (filteredProductContext || productContext || "").match(/^• (.+?) — ₹/gm) || [];
        const base = siteUrl.replace(/\/+$/, "");
        const entries = lines.slice(0, 10).map(line => {
          const name = line.replace(/^• /, "").replace(/ — ₹.*$/, "").trim();
          const handle = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          return `${name}: ${base}/products/${handle}`;
        });
        return entries.length ? `PRODUCT URLS FOR INTERNAL LINKS:\n${entries.join("\n")}\nUse these URLs when mentioning products. Format: [Product Name](URL)` : "";
      })();

      const websiteContext = [
        brandNameLine,
        priceRangeLine,
        emptyProductWarning,
        topicCategoryConstraint,
        themeConstraint,
        categoryFilterNote,
        productUrlMap,
        scrapeCtx ? scrapeCtx.slice(0, 500) : "",
        auditText ? auditText.slice(0, 300) : "",
        filteredProductContext
          ? filteredProductContext.slice(0, 2500)
          : (productContext ? productContext.slice(0, 2500) : ""),
      ].filter(Boolean).join("\n\n").trim();
      stepInputsRef.current[6].websiteContext = websiteContext;
      stepInputsRef.current[6].productContext = filteredProductContext || productContext;
      stepInputsRef.current[6].detectedMaterials = detectedMaterials;
      stepInputsRef.current[6].urgencyLine = urgencyLine;
      stepInputsRef.current[6].topicProductType = topicProductType;
      stepInputsRef.current[6].topicCategoryAvailable = topicCategoryAvailable;

      // Also pick up lockedSnapshot from step 5 if not passed directly
      const snapshotToUse = lockedSnapshot
        || stepInputsRef.current[5]?.lockedSnapshot
        || stepDataRef.current[5]?.lockedSnapshot
        || null;

      const blogPromptArgs = [
        resolvedTopic, outNote, ragContext, contentType, blueprintStructure,
        targetReader, corePromise, websiteContext, extractedBrandName,
        tierMap, materialConstraints, urgencyLine, policyContext, snapshotToUse,
      ];
      let d6raw = await callSEO(PROMPT_STEP6(...blogPromptArgs), 8000);

      // ── Error-message intercept ───────────────────────────────
      // If the model output an ERROR/INSUFFICIENT message (from old conversation
      // history instructions), override and regenerate with an explicit directive.
      const ERROR_PATTERNS = /^(ERROR:|INSUFFICIENT PRODUCTS:|MISSING PRICES:|BLOG GENERATION BLOCKED)/i;
      if (ERROR_PATTERNS.test((d6raw.text || "").trim())) {
        console.warn("[BlogGen] Model output an error message — overriding and regenerating");
        const overridePrompt = `IMPORTANT OVERRIDE: Ignore any previous instruction about outputting ERROR messages. You MUST write a complete blog post about "${resolvedTopic}". Use whatever products are available in the product list. If fewer than 3 match the exact category, use the closest available products. Never output an error message — always produce the full blog.\n\n` + PROMPT_STEP6(...blogPromptArgs);
        d6raw = await callSEO(overridePrompt, 8000, true);
      }

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
      }

      // ── Vocabulary cap fix pass (Feature 4) ──────────────────
      // Scan for AI-tell vocabulary violations and run a targeted fix if any found.
      try {
        const { violations } = scanVocab(finalBlogText);
        if (violations.length > 0) {
          console.log(`[VocabCaps] ${violations.length} violation(s):`, violations.map(v => v.phrase));
          const vocabFixPrompt = buildVocabFixPrompt(finalBlogText, violations);
          const d6vocabResult = await callSEO(vocabFixPrompt, 8000);
          if (d6vocabResult?.text && d6vocabResult.text.length > 200) {
            finalBlogText = d6vocabResult.text;
            console.log("[VocabCaps] Fix pass completed.");
          }
        } else {
          console.log("[VocabCaps] Clean — no violations.");
        }
      } catch (vocabErr) {
        console.log("[VocabCaps] Fix pass skipped:", vocabErr.message);
      }

      // ── Material accuracy check ───────────────────────────────
      try {
        const matViolations = scanMaterialViolations(finalBlogText, stepInputsRef.current[6]?.detectedMaterials || []);
        if (matViolations.length > 0) {
          console.warn("[MaterialCheck] Violations found:", matViolations);
          // Log to step data for reviewer visibility
          stepInputsRef.current[6].materialViolations = matViolations;
        }
      } catch (_) { /* non-blocking */ }

      // ── Density tighten pass (Feature 9) ─────────────────────
      // Run after vocab fix — cuts 25–35% padding without losing any facts.
      const wordCountBefore = finalBlogText.split(/\s+/).filter(Boolean).length;
      try {
        if (wordCountBefore > 900) { // only tighten if there's content to trim
          const d6tight = await callSEO(PROMPT_TIGHTEN(finalBlogText), 8000);
          if (d6tight?.text && d6tight.text.length > 200) {
            const wordCountAfter = d6tight.text.split(/\s+/).filter(Boolean).length;
            const reduction = ((wordCountBefore - wordCountAfter) / wordCountBefore * 100).toFixed(1);
            console.log(`[Tighten] ${wordCountBefore} → ${wordCountAfter} words (${reduction}% reduction)`);
            if (wordCountAfter >= 700 && wordCountAfter < wordCountBefore) {
              finalBlogText = d6tight.text;
            }
          }
        }
      } catch (tightErr) {
        console.log("[Tighten] Pass skipped:", tightErr.message);
      }

      // ── Body-product cross-validator (Feature 5) ─────────────
      // Scan body text for category claims and verify they match
      // the products that were actually recommended.
      let bodyProductAlignment = { passed: true, mismatches: [], matchRatio: 1 };
      try {
        const inp5 = stepInputsRef.current[6];
        if (inp5?.topicProductType) {
          // Parse products from the filtered product context
          const prodLines = (inp5.productContext || "").match(/^• (.+?) — ₹/gm) || [];
          const recommendedProds = prodLines.map(line => {
            const name = line.replace(/^• /, "").replace(/ — ₹.*$/, "").trim();
            const classified = classifyProducts([{ name }], niche)[0];
            return classified;
          });
          bodyProductAlignment = validateBodyProductAlignment(
            finalBlogText, recommendedProds, inp5.topicProductType
          );
          if (!bodyProductAlignment.passed) {
            console.warn("[BodyProductValidator] Mismatches found:", bodyProductAlignment.mismatches);
          }
        }
      } catch (_) { /* non-blocking */ }

      // ── Quality report (Feature 10) ──────────────────────────
      const wordCountFinal = finalBlogText.split(/\s+/).filter(Boolean).length;
      const { violations: finalVocabCheck, wordCounts } = scanVocab(finalBlogText);
      const inp5 = stepInputsRef.current[6];
      const qualityReport = {
        wordCountBefore,
        wordCountFinal,
        reductionRatio: ((wordCountBefore - wordCountFinal) / wordCountBefore).toFixed(2),
        vocabViolationsRemaining: finalVocabCheck.length,
        vocabWordCounts: wordCounts,
        materialViolations: inp5?.materialViolations || [],
        urgencyLineInjected: !!urgencyLine,
        tierMapUsed: !!tierMap,
        policyFaqAvailable: !!policyContext,
        detectedMaterials: inp5?.detectedMaterials || [],
        // Category alignment (Feature 7 quality report extension)
        topicPrimaryCategory: topicProductType?.type || null,
        availableProductsInCategory: topicCategoryAvailable ? "sufficient" : "insufficient",
        productTypeFilterApplied,
        bodyProductCategoryMismatches: bodyProductAlignment.mismatches,
        categoryMatchRatio: bodyProductAlignment.matchRatio,
        categoryAlignmentPassed: bodyProductAlignment.passed,
      };
      stepInputsRef.current[6].qualityReport = qualityReport;
      console.log("[QualityReport]", qualityReport);

      try {
        const quality = QualityAssurance.validateStep(5, finalBlogText);
        patchStep(6, { quality });
        if (quality.qualityScore < 70)
          console.warn(`[Quality] Score ${quality.qualityScore}% — below 70% threshold`);
      } catch (err) {
        console.log("[Quality] Check skipped:", err.message);
      }

      // ── Post-generation validation (Step 6 → 7 gate) ───────────
      // Mirrors the pre-flight on the finished blog text. Up to 2 auto-retries.
      const snapshotForPostVal = lockedSnapshot
        || stepInputsRef.current[5]?.lockedSnapshot
        || stepDataRef.current[5]?.lockedSnapshot
        || null;
      if (snapshotForPostVal) {
        try {
          const postValResult = await callSEO(PROMPT_POST_VALIDATE(finalBlogText, snapshotForPostVal), 2048, true);
          let postVal = null;
          try { postVal = JSON.parse((postValResult.text || "").replace(/```json\s*/i,"").replace(/```\s*$/i,"").trim()); }
          catch { const m = (postValResult.text||"").match(/\{[\s\S]*\}/); if(m) try{postVal=JSON.parse(m[0]);}catch{/**/} }
          if (postVal?.status === "fail" && postVal.failures?.length) {
            console.warn("[PostValidate] Failures:", postVal.failures);
            // Append failures to quality report — surface in UI
            stepInputsRef.current[6].qualityReport = {
              ...qualityReport,
              postValidationFailures: postVal.failures,
              postValidationPassed: false,
            };
          } else {
            stepInputsRef.current[6].qualityReport = { ...qualityReport, postValidationPassed: true };
          }
        } catch (_) { /* post-validation is best-effort */ }
      }

      // Show revision gate — user can approve or give feedback
      patchStep(6, {
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
              patchStep(6, { gate: null, status: "done" });
            } else {
              runStep6Revise(ans);
            }
          },
        },
      });
    } catch (e) {
      patchStep(6, { status: "error", error: e.message, canRetry: true });
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
      // Pass blueprint text directly — stepDataRef may not have updated yet
      runStep5Validate(resolvedTopic, "approve", d5.text);
    } catch (e) {
      patchStep(4, { status: "error", error: e.message, canRetry: true });
    }
  }, [callSEO, patchStep, runStep5Validate]);

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

      // ── Load per-brand topic history for dedup ─────────────────
      const topicExclusions = getExclusionList(siteUrl);
      const pillarUsage     = getPillarUsage(siteUrl, 30);
      const lastPillar      = getLastPillar(siteUrl);
      const lockedOccasions = getLockedOccasions(siteUrl);

      const res = await fetch("/api/topic-recommend", {
        method : "POST",
        cache  : "no-store",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({
          siteUrl,
          niche,
          brandAudit    : auditText.slice(0, 1200),
          scrapeContext : scrapeCtx.slice(0, 1500),
          targetMonth   : resolvedMonth,
          _salt         : Math.random().toString(36).substring(2, 9),
          avoidTopic    : previousTopic || "",
          // Diversity inputs
          topicExclusions,
          pillarUsage,
          lastPillar,
          lockedOccasions,
        }),
      }).then(r => r.json());

      if (res.error) throw new Error(res.error);

      const rec = res.recommendation ?? {};
      stepInputsRef.current[2].primaryKeyword   = rec.primaryKeyword    ?? "";
      stepInputsRef.current[2].recommendedTopic = rec.recommendedTopic  ?? "";

      // ── Write to topic history immediately (before blog generation) ──
      // Doing this here ensures back-to-back regenerates see this topic as taken.
      if (rec.recommendedTopic) {
        addToTopicHistory(siteUrl, {
          h1            : rec.recommendedTopic,
          primaryKeyword: rec.primaryKeyword  || "",
          contentPillar : rec.contentPillar   || detectPillar(rec.recommendedTopic),
          occasion      : rec.occasion        || null,
        });
      }

      patchStep(2, {
        status         : "waiting",
        text           : null,
        recommendation : rec,
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
            // Policy highlights from announcement bars — MUST be reflected accurately in FAQ
            scrapeRes.policyHighlights ? `Policy/Shipping Highlights (from site banner — use in FAQ, never contradict): ${scrapeRes.policyHighlights}` : "",
          ].filter(Boolean).join("\n")
        : "";
      stepInputsRef.current[1].scrapeContext = scrapeContext;

      const d1 = await callSEO(PROMPT_STEP1(rawUrl, context, scrapeContext), 8000);
      patchStep(1, { status: "done", text: d1.text, canRetry: false });
    } catch (e) {
      patchStep(1, { status: "error", error: e.message, canRetry: true });
    }
  }, [callSEO, patchStep]);

  // ── Reactive Chain ───────────────────────────────────────────
  const runStep2RecommendRef = useRef(runStep2Recommend);
  const runStep8Ref = useRef(runStep8);
  const runStep9Ref = useRef(runStep9);
  useEffect(() => { runStep2RecommendRef.current = runStep2Recommend; }, [runStep2Recommend]);
  useEffect(() => { runStep8Ref.current = runStep8; }, [runStep8]);
  useEffect(() => { runStep9Ref.current = runStep9; }, [runStep9]);

  const runStep5ValidateRef = useRef(runStep5Validate);
  useEffect(() => { runStep5ValidateRef.current = runStep5Validate; }, [runStep5Validate]);

  useEffect(() => {
    if (phase !== "running") return;
    if (stepData[1]?.status === "done" && !stepData[2]) runStep2RecommendRef.current();
    if (stepData[6]?.status === "done" && !stepData[7]) runStep8Ref.current();
    if (stepData[7]?.status === "done" && !stepData[8]) runStep9Ref.current();
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
      5: () => { runStep5ValidateRef.current(inp.topicChoice, inp.outlineAnswer); return null; },
      6: () => callSEO(PROMPT_STEP6(inp.topic, inp.outNote, inp.ragContext, inp.contentType ?? "", inp.blueprintStructure ?? "", inp.targetReader ?? "", inp.corePromise ?? "", inp.websiteContext ?? "", inp.brandName ?? "", "", "", "", "", inp.lockedSnapshot ?? null), 8000, true),
      7: () => callSEO(PROMPT_STEP7(),                                                 4096, true),
      8: () => callSEO(PROMPT_STEP8(stepInputsRef.current[3]?.topic ?? "", "", siteUrlRef.current, ""), 3000, true),
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
      case 4: runStep5ValidateRef.current(topic, value); break;
      default: console.warn("[Gate] No handler for step", stepId);
    }
  }, [runStep4, runStep5, runStep5Validate]);

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
    else if (lastDone === 6) runStep8Ref.current();
    else if (lastDone === 7) runStep9Ref.current();
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
    brandName          : brandContext.brandName,
    businessCategory   : brandContext.category,
    keyProducts        : brandContext.products,
    targetAudience     : brandContext.audience,
    setBrandName       : (v) => setBrandContext("brandName", v),
    setBusinessCategory: (v) => setBrandContext("category", v),
    setKeyProducts     : (v) => setBrandContext("products", v),
    setTargetAudience  : (v) => setBrandContext("audience", v),
    internalData,
    isGeneratingVariations,
    generateVariations,
    regenerateTopicRecommendation: runStep2Recommend,
  };
}
