// ─── Vocabulary Quality Control ─────────────────────────────────────────────
// Enforces AI-tell vocabulary caps and bans across all generated blogs.
// Applied as a post-generation pass — any violation triggers a targeted fix call.

// Zero-tolerance phrases — banned entirely from the blog body
export const VOCAB_BANNED = [
  "true testament",
  "stands as a testament",
  "is a testament to",
  "serves as a testament",
  "a testament to",
  "meticulously crafted",
  "enduring style",
  "lasting appreciation",
  "tells its own story",
  "tell their own story",
  "unmatched versatility",
  "investment in lasting style",
  "deeply meaningful",
  "truly memorable",
  "elevates it beyond mere utility",
  "elevate your",
  "a touch of elegance",
  "adding a touch of",
  "in today's world",
  "in conclusion",
  "it is important to note",
  "ever wondered",
  "you're not alone",
  "most people don't realize",
  "here's the honest answer",
  "if you remember just one thing",
  "exudes confidence",
  "perfect for special occasions",
  "speaks volumes",
  "says it all",
  "worthy of",
  "that checks all the boxes",
];

// Per-blog word caps — exceeding these triggers a targeted revision call
export const VOCAB_CAPS = {
  premium:        3,
  exquisite:      1,
  elegant:        2,
  sophisticated:  2,
  timeless:       2,
  crafted:        3,
  meticulously:   1,
  luxurious:      2,
  refined:        2,
  elevated:       2,
  exceptional:    2,
  outstanding:    1,
  impeccable:     1,
};

/**
 * Scan blog text and return a list of violations.
 * @param {string} text - full blog text
 * @returns {{ violations: Array<{type,phrase,cap,count}>, wordCounts: Object }}
 */
export function scanVocab(text) {
  if (!text) return { violations: [], wordCounts: {} };
  const lower = text.toLowerCase();
  const violations = [];
  const wordCounts = {};

  // Check zero-tolerance phrases
  for (const phrase of VOCAB_BANNED) {
    if (lower.includes(phrase.toLowerCase())) {
      violations.push({ type: "banned", phrase, cap: 0, count: 1 });
    }
  }

  // Check capped words
  for (const [word, cap] of Object.entries(VOCAB_CAPS)) {
    const regex = new RegExp(`\\b${word}\\b`, "gi");
    const matches = text.match(regex) || [];
    wordCounts[word] = matches.length;
    if (matches.length > cap) {
      violations.push({ type: "capped", phrase: word, cap, count: matches.length });
    }
  }

  return { violations, wordCounts };
}

/**
 * Build a targeted Gemini revision prompt that fixes only the flagged violations.
 * @param {string} blogText
 * @param {Array} violations
 * @returns {string} prompt
 */
export function buildVocabFixPrompt(blogText, violations) {
  const instructions = violations.map(v => {
    if (v.type === "banned") {
      return `- REMOVE all occurrences of "${v.phrase}". Replace with concrete, specific language about the product, material, use case, or occasion context.`;
    }
    return `- Reduce "${v.phrase}" from ${v.count} occurrences to a maximum of ${v.cap}. Replace excess uses with specific product details, material names, use-case descriptions, or occasion context.`;
  }).join("\n");

  return `You are editing a blog post for vocabulary quality. Apply ONLY the targeted replacements listed below — do not change anything else.

REQUIRED CHANGES:
${instructions}

EDITING RULES:
- Keep ALL product names, prices, headings, FAQs, and CTAs exactly as they are.
- Replace flagged words with specific, concrete language: name the actual material (e.g. "full-grain leather"), describe the specific feature, reference the actual occasion.
- Do NOT introduce new clichés or AI-tell phrases when replacing old ones.
- Do NOT change the word count significantly, restructure sections, or alter the blog's meaning.
- Do NOT add new sentences — edit within existing ones.

Blog to edit:
${blogText}

Return the corrected blog only. No preamble. No commentary. Start directly with the blog content.`.trim();
}
