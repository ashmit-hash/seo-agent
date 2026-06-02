// ─── Content Pillar Rotation ─────────────────────────────────────────────────
// Tags every topic with a primary pillar.
// Tracks per-brand pillar usage and scores candidates to penalise overused pillars.

export const CONTENT_PILLARS = [
  "education",           // What is X, How X works, Complete guide
  "occasion_gifting",    // Father's Day, Diwali, birthday gift guides
  "styling_how_to_wear", // How to wear X, outfit combos, styling tips
  "care_maintenance",    // Cleaning, storage, conditioning, how to make it last
  "buying_guide",        // How to choose X, X vs Y, best X for Y
  "trend_seasonal",      // Seasonal picks, what's new, trending in X
  "brand_story",         // Why we make X, our craft, behind the scenes
  "use_case_specific",   // X for office, X for travel, X for weddings
  "customer_problems",   // Common mistakes, why X fades, how to fix X
  "category_deep_dive",  // Types of X, materials explained, X glossary
];

// Keyword signals per pillar — used for detection from topic text
const PILLAR_SIGNALS = {
  education:           ["what is", "how does", "complete guide", "everything about", "explained", "introduction", "basics of", "101", "beginners"],
  occasion_gifting:    ["gift", "gifting", "father", "mother", "diwali", "rakhi", "birthday", "anniversary", "valentine", "christmas", "present", "eid", "onam", "navratri", "karwa", "raksha"],
  styling_how_to_wear: ["how to wear", "style", "outfit", "pair with", "styling tips", "ways to wear", "look", "fashion", "wardrobe", "ootd"],
  care_maintenance:    ["care", "clean", "maintain", "storage", "last longer", "protect", "condition", "preserve", "keep", "washing", "stain"],
  buying_guide:        ["how to choose", "buying guide", " vs ", "comparison", "best ", "which to buy", "before you buy", "checklist", "what to look for", "pick the right"],
  trend_seasonal:      ["trend", "2025", "2026", "new ", "latest", "this season", "monsoon", "summer", "winter", "spring", "collection"],
  brand_story:         ["why we", "our story", "behind", "crafted by", "made in", "artisan", "founder", "heritage", "philosophy", "values"],
  use_case_specific:   ["for office", "for travel", "for wedding", "for college", "for work", "for daily", "for gym", "for beach", "for festival", "for ethnic"],
  customer_problems:   ["mistake", "wrong", "avoid", "don't", "why your", "fix", "problem", "issue", "fading", "peeling", "cracking", "yellowing"],
  category_deep_dive:  ["types of", "materials", "glossary", "guide to", "different kinds", "varieties", "grades of", "what's the difference"],
};

/**
 * Detect the primary pillar for a given topic string.
 * @param {string} topicText
 * @returns {string} pillar key
 */
export function detectPillar(topicText) {
  if (!topicText) return "education";
  const lower = topicText.toLowerCase();

  let bestPillar = "education";
  let bestScore  = 0;

  for (const [pillar, signals] of Object.entries(PILLAR_SIGNALS)) {
    const score = signals.filter(s => lower.includes(s)).length;
    if (score > bestScore) { bestScore = score; bestPillar = pillar; }
  }
  return bestPillar;
}

/**
 * Score a candidate topic for pillar rotation quality.
 * Higher score = more desirable (underused pillar, not same as last).
 * Returns 0 if the pillar matches the immediately preceding topic's pillar (hard block).
 *
 * @param {string} pillar - candidate's detected pillar
 * @param {{ [pillar]: number }} pillarUsage - recent usage counts from topic history
 * @param {string|null} lastPillar - pillar of the most recent topic
 * @returns {number} 0–1
 */
export function getPillarRotationScore(pillar, pillarUsage = {}, lastPillar = null) {
  // Hard rule: cannot share pillar with the immediately preceding topic
  if (pillar === lastPillar) return 0;

  // Inverse-frequency: less recently used → higher score
  const recentCount = pillarUsage[pillar] || 0;
  return 1 / (recentCount + 1);  // max 1.0 when never used recently
}

/**
 * Build the pillar-constraint instruction for the brainstorm prompt.
 * @param {string|null} lastPillar
 * @param {{ [pillar]: number }} pillarUsage
 * @returns {string}
 */
export function buildPillarConstraintText(lastPillar, pillarUsage) {
  const lines = [];

  if (lastPillar) {
    lines.push(`The IMMEDIATELY PRECEDING blog for this brand was a "${lastPillar}" pillar post. Your new topic MUST use a different content pillar.`);
  }

  const overused = Object.entries(pillarUsage)
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a)
    .map(([p]) => p);

  if (overused.length) {
    lines.push(`Recently overused pillars (deprioritise these): ${overused.join(", ")}.`);
  }

  const unused = CONTENT_PILLARS.filter(p => !pillarUsage[p] && p !== lastPillar);
  if (unused.length) {
    lines.push(`Underused pillars that should be explored: ${unused.slice(0, 4).join(", ")}.`);
  }

  return lines.join(" ");
}
