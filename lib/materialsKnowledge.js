// ─── Materials Accuracy Knowledge Base ──────────────────────────────────────
// Per-material: aging behaviour, valid/invalid claims, care instructions.
// Injected into PROMPT_STEP6 when those materials are detected in the product list.
// A blog that violates these is factually wrong — not a style issue.

export const MATERIALS_KNOWLEDGE = {
  "smooth leather": {
    aliases: ["full grain", "top grain", "genuine leather", "pebbled leather",
              "calfskin", "cowhide", "buffalo leather", "lambskin"],
    aging: "develops a patina over time — colour deepens and the surface acquires a burnished sheen with regular use",
    care: "Wipe with a damp cloth. Condition with leather balm or cream every 3–6 months. Store away from direct sunlight and humidity.",
    validClaims: ["develops patina", "ages gracefully", "conditions with leather balm",
                  "polishes to a shine", "deepens in colour", "burnished over time"],
    invalidClaims: [],
    bannedCarePhrases: [],
  },

  "suede": {
    aliases: ["suede leather", "split suede", "reverse suede"],
    aging: "does NOT develop patina. Suede has a napped surface that can flatten, stain, or discolour with use — it does not burnish or deepen in colour.",
    care: "Brush gently with a soft-bristle suede brush after each use. Apply suede protector spray before first use and seasonally. Avoid water, oil, and heat. Store in a breathable dust bag.",
    validClaims: ["soft-bristle brush", "suede protector spray", "napped surface",
                  "velvety texture", "delicate finish"],
    invalidClaims: ["develops patina", "leather balm", "leather cream", "leather conditioner",
                    "polish", "ages gracefully", "develops character", "burnished sheen",
                    "deepens in colour", "conditioning cream"],
    bannedCarePhrases: ["leather balm", "leather cream", "leather conditioner",
                        "beeswax polish", "shoe polish", "conditioning oil"],
  },

  "nubuck": {
    aliases: ["nubuck leather", "buffed leather", "brushed leather"],
    aging: "does NOT develop patina. Nubuck is top-grain leather sanded to a fine nap — it marks and scuffs easily and does not burnish.",
    care: "Use a nubuck eraser for marks. Brush with a soft nubuck brush in one direction. Apply suede/nubuck protector spray. Avoid moisture and oils.",
    validClaims: ["nubuck brush", "nubuck eraser", "suede protector spray", "napped surface"],
    invalidClaims: ["develops patina", "leather balm", "ages gracefully", "polish",
                    "burnished", "deepens in colour", "conditions with cream"],
    bannedCarePhrases: ["leather balm", "leather cream", "leather conditioner", "polish"],
  },

  "vegan leather": {
    aliases: ["PU leather", "faux leather", "synthetic leather", "vegan",
              "plant-based leather", "microfibre leather", "polyurethane leather"],
    aging: "does NOT develop patina. Vegan leather does not age like animal leather — it may crack, peel, or fade with prolonged UV or heat exposure.",
    care: "Wipe with a damp cloth and a drop of mild soap. Avoid alcohol-based cleaners and abrasive materials. Store away from direct heat and sunlight.",
    validClaims: ["wipe clean", "damp cloth", "cruelty-free", "sustainable", "eco-friendly"],
    invalidClaims: ["develops patina", "leather balm", "leather conditioner",
                    "ages gracefully", "burnished sheen", "deepens in colour",
                    "conditions with cream", "polishes to a shine"],
    bannedCarePhrases: ["leather balm", "leather conditioner", "wax polish", "conditioning oil"],
  },

  "canvas": {
    aliases: ["canvas bag", "waxed canvas", "cotton canvas", "duck canvas",
              "coated canvas", "jacquard canvas"],
    aging: "waxed canvas develops character marks and softens with use. Unwaxed canvas stays flat and can be laundered.",
    care: "Spot clean with cold water and mild soap. Air dry — never tumble dry. Re-wax waxed canvas with a wax bar seasonally.",
    validClaims: ["spot clean", "air dry", "durable", "lightweight", "re-wax", "breathable"],
    invalidClaims: ["develops patina like leather", "leather balm", "leather conditioner",
                    "polish to a shine"],
    bannedCarePhrases: ["leather balm", "leather conditioner"],
  },

  "brass": {
    aliases: ["brass hardware", "brass zip", "brass fittings", "antique brass",
              "gold-tone hardware", "gunmetal"],
    aging: "brass naturally oxidises and darkens over time, developing a warm, aged appearance. It can be polished to restore its original brightness.",
    care: "Wipe hardware with a dry or slightly damp cloth. Use brass polish sparingly to restore shine. Avoid prolonged contact with moisture to prevent green oxidation.",
    validClaims: ["oxidises", "ages warmly", "polishes to a shine", "antique patina on hardware"],
    invalidClaims: [],
    bannedCarePhrases: [],
  },

  "925 silver": {
    aliases: ["sterling silver", "925 sterling silver", "silver jewellery", ".925"],
    aging: "silver tarnishes — a dark film forms with exposure to air, moisture, and sulfur compounds. Tarnish can be fully removed with a polishing cloth.",
    care: "Store in an airtight zip-lock bag or anti-tarnish pouch. Wipe after wearing with a soft silver polishing cloth. Avoid perfume, chlorine, and saltwater.",
    validClaims: ["tarnishes", "polishes", "hypoallergenic", "925 purity", "anti-tarnish storage"],
    invalidClaims: ["develops patina like leather", "leather balm", "ages like leather"],
    bannedCarePhrases: ["leather balm", "leather conditioner"],
  },
};

/**
 * Detect materials mentioned in product names/descriptions or blog text.
 * @param {string} text
 * @returns {string[]} array of matched material keys
 */
export function detectMaterials(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const detected = new Set();

  for (const [material, data] of Object.entries(MATERIALS_KNOWLEDGE)) {
    const terms = [material, ...(data.aliases || [])];
    if (terms.some(t => lower.includes(t.toLowerCase()))) {
      detected.add(material);
    }
  }
  return [...detected];
}

/**
 * Build hard material constraint rules for injection into the generation prompt.
 * @param {string[]} detectedMaterials
 * @returns {string}
 */
export function buildMaterialConstraints(detectedMaterials) {
  if (!detectedMaterials || !detectedMaterials.length) return "";

  const rules = detectedMaterials.map(mat => {
    const d = MATERIALS_KNOWLEDGE[mat];
    if (!d) return null;
    const lines = [
      `MATERIAL — ${mat.toUpperCase()}:`,
      `  Aging behaviour: ${d.aging}`,
      `  Correct care: ${d.care}`,
    ];
    if (d.invalidClaims.length) {
      lines.push(`  NEVER claim: ${d.invalidClaims.map(c => `"${c}"`).join(", ")}.`);
    }
    if (d.bannedCarePhrases.length) {
      lines.push(`  BANNED care advice: ${d.bannedCarePhrases.map(c => `"${c}"`).join(", ")}.`);
    }
    return lines.filter(Boolean).join("\n");
  }).filter(Boolean);

  return `MATERIAL ACCURACY RULES — violations = factual error, blog rejected:\n\n${rules.join("\n\n")}`;
}

/**
 * Scan blog text for material accuracy violations.
 * @param {string} blogText
 * @param {string[]} detectedMaterials
 * @returns {Array<{material, invalidClaim}>}
 */
export function scanMaterialViolations(blogText, detectedMaterials) {
  if (!blogText || !detectedMaterials || !detectedMaterials.length) return [];
  const lower = blogText.toLowerCase();
  const violations = [];

  for (const mat of detectedMaterials) {
    const d = MATERIALS_KNOWLEDGE[mat];
    if (!d) continue;
    for (const claim of d.invalidClaims) {
      if (lower.includes(claim.toLowerCase())) {
        violations.push({ material: mat, invalidClaim: claim });
      }
    }
  }
  return violations;
}
