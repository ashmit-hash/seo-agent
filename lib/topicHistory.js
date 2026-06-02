// ─── Per-Brand Topic History ─────────────────────────────────────────────────
// Persisted in localStorage, keyed by brand hostname.
// Written before blog generation starts so back-to-back regenerates
// immediately see a topic as "taken".

const PREFIX     = "blogiq_topic_history_";
const MAX_SIZE   = 50;                    // topics stored per brand
const YEAR_MS    = 365 * 24 * 3600_000;  // 12-month occasion lockout

// ── Key derivation ────────────────────────────────────────────────
export function brandKey(siteUrl) {
  try {
    const host = new URL(
      siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`
    ).hostname.replace(/^www\./, "");
    return `${PREFIX}${host}`;
  } catch {
    return `${PREFIX}${String(siteUrl).replace(/[^a-z0-9]/gi, "_").slice(0, 60)}`;
  }
}

// ── Read ──────────────────────────────────────────────────────────
export function getTopicHistory(siteUrl) {
  try {
    const raw = typeof localStorage !== "undefined"
      ? localStorage.getItem(brandKey(siteUrl))
      : null;
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ── Write ─────────────────────────────────────────────────────────
/**
 * Add a topic to the brand's history.
 * Call this BEFORE blog generation so the next regenerate sees it immediately.
 * @param {string} siteUrl
 * @param {{ h1, primaryKeyword, contentPillar, occasion }} topic
 * @returns the stored entry
 */
export function addToTopicHistory(siteUrl, topic) {
  try {
    const history = getTopicHistory(siteUrl);
    const entry = {
      h1            : topic.h1 || topic.recommendedTopic || "",
      primaryKeyword: topic.primaryKeyword || "",
      contentPillar : topic.contentPillar  || "education",
      occasion      : topic.occasion       || null,
      createdAt     : new Date().toISOString(),
      status        : "in_progress",
    };
    const trimmed = [entry, ...history].slice(0, MAX_SIZE);
    localStorage.setItem(brandKey(siteUrl), JSON.stringify(trimmed));
    return entry;
  } catch {
    return null;
  }
}

// ── Derived views ─────────────────────────────────────────────────

/** Last 50 topic titles for the exclusion-list prompt injection. */
export function getExclusionList(siteUrl) {
  return getTopicHistory(siteUrl)
    .map(t => t.h1 || t.primaryKeyword)
    .filter(Boolean)
    .slice(0, 50);
}

/** Count pillar uses in the last `days` days. Returns { pillar: count }. */
export function getPillarUsage(siteUrl, days = 30) {
  const cutoff = Date.now() - days * 24 * 3600_000;
  const usage  = {};
  for (const t of getTopicHistory(siteUrl)) {
    if (!t.createdAt || new Date(t.createdAt).getTime() < cutoff) continue;
    usage[t.contentPillar] = (usage[t.contentPillar] || 0) + 1;
  }
  return usage;
}

/** Primary pillar of the most recently generated topic. */
export function getLastPillar(siteUrl) {
  return getTopicHistory(siteUrl)[0]?.contentPillar || null;
}

/**
 * Occasions that already have a blog within the last 12 months for this brand.
 * These are locked out as topic anchors until the next cycle.
 */
export function getLockedOccasions(siteUrl) {
  const cutoff = Date.now() - YEAR_MS;
  return getTopicHistory(siteUrl)
    .filter(t => t.occasion && new Date(t.createdAt).getTime() >= cutoff)
    .map(t => t.occasion.toLowerCase());
}

// ── Semantic dedup (keyword-overlap Jaccard) ──────────────────────
/**
 * Lightweight semantic similarity between two topic strings.
 * Uses 4+-char word overlap (Jaccard) as a proxy for cosine similarity.
 * Calibrated: Jaccard > 0.35 ≈ cosine > 0.82 for short blog titles.
 */
export function topicSimilarity(a, b) {
  const words = s => new Set((s || "").toLowerCase().match(/\b\w{4,}\b/g) || []);
  const A = words(a);
  const B = words(b);
  const intersection = [...A].filter(w => B.has(w)).length;
  const union = new Set([...A, ...B]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Check if a candidate topic is too similar to any existing history entry.
 * Returns { isDuplicate, maxSimilarity, matchedTopic }.
 */
export function isSemanticallyDuplicate(siteUrl, candidateTopic, threshold = 0.35) {
  const history = getTopicHistory(siteUrl);
  let maxSim = 0;
  let matchedTopic = null;
  for (const t of history) {
    const sim = topicSimilarity(candidateTopic, t.h1);
    if (sim > maxSim) { maxSim = sim; matchedTopic = t.h1; }
  }
  return { isDuplicate: maxSim >= threshold, maxSimilarity: maxSim, matchedTopic };
}
