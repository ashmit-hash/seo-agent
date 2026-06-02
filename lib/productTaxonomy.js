// ─── Product Taxonomy + Keyword-Based Classifier ────────────────────────────
// Maps niche → category → product types.
// Used to:
//   1. Classify scraped products into a normalised type.
//   2. Detect the primary product type a blog topic targets.
//   3. Filter the product list to only matching types before passing to the blog AI.
//   4. Validate that body claims match the products actually listed.

// ── Taxonomy ─────────────────────────────────────────────────────────────────
export const PRODUCT_TAXONOMY = {
  jewellery: {
    earrings: {
      types: ["hoops", "studs", "drops", "danglers", "teardrops", "jhumkas",
              "chandbalis", "ear_cuffs", "huggies", "sui_dhaga", "kaan", "bajra"],
      keywords: {
        hoops      : /\bhoops?\b|\bhoop\s+earring|\bcircle\s+earring|\bopen\s+ring\s+earring/i,
        studs      : /\bstuds?\b|\bstud\s+earring|\bsolitaire\s+earring/i,
        drops      : /\bdrops?\b|\bdrop\s+earring|\bdangle\s+drop/i,
        danglers   : /\bdanglers?\b|\bdangle\s+earring|\blong\s+earring/i,
        teardrops  : /\bteardrops?\b|\btear\s*drop/i,
        jhumkas    : /\bjhumkas?\b|\bjhumki\b|\bjhumka\b/i,
        chandbalis : /\bchandbalis?\b|\bchandbali\b/i,
        ear_cuffs  : /\bear[\s-]*cuffs?\b|\bcuff\s+earring/i,
        huggies    : /\bhuggies?\b|\bhuggie\b/i,
        sui_dhaga  : /\bsui[\s-]*dhaga\b|\bneedle\s+thread\b/i,
        kaan       : /\bkaan\b|\bkaan\s+phool/i,
        bajra      : /\bbajra\b/i,
      },
    },
    necklaces: {
      types: ["chokers", "pendants", "chains", "haar", "rani_haar", "layered", "lariat", "mangalsutra"],
      keywords: {
        chokers    : /\bchokers?\b|\bchoker\s+necklace/i,
        pendants   : /\bpendants?\b|\bpendant\s+necklace|\blocket/i,
        chains     : /\bchains?\b|\bchain\s+necklace|\blink\s+chain/i,
        haar       : /\bhaar\b|\blong\s+necklace/i,
        rani_haar  : /\brani[\s-]*haar\b|\brani\s+necklace/i,
        layered    : /\blayered?\b|\bmulti[\s-]*strand/i,
        lariat     : /\blariat\b|\by[\s-]*necklace/i,
        mangalsutra: /\bmangalsutra\b|\bmangal\s+sutra/i,
      },
    },
    rings: {
      types: ["bands", "statement", "stackable", "cocktail", "midi", "toe_rings", "adjustable"],
      keywords: {
        bands      : /\bbands?\b|\bband\s+ring/i,
        statement  : /\bstatement\s+ring|\bcocktail\s+ring/i,
        stackable  : /\bstackable?\b|\bstack\s+ring/i,
        cocktail   : /\bcocktail\s+ring/i,
        midi       : /\bmidi\s+ring|\bknuckle\s+ring/i,
        toe_rings  : /\btoe[\s-]*rings?\b|\bbichiya\b/i,
        adjustable : /\badjustable\s+ring/i,
      },
    },
    bracelets: {
      types: ["bangles", "cuffs", "chain_bracelets", "charm_bracelets", "kadas", "tennis_bracelets"],
      keywords: {
        bangles           : /\bbangles?\b|\bkangan\b/i,
        cuffs             : /\bcuffs?\b|\bcuff\s+bracelet/i,
        chain_bracelets   : /\bchain\s+bracelet|\blink\s+bracelet/i,
        charm_bracelets   : /\bcharm\s+bracelet/i,
        kadas             : /\bkadas?\b|\bkara\b/i,
        tennis_bracelets  : /\btennis\s+bracelet/i,
      },
    },
    anklets: {
      types: ["anklets", "payal", "layered_anklets"],
      keywords: {
        anklets         : /\banklets?\b/i,
        payal           : /\bpayal\b|\bpaayal\b/i,
        layered_anklets : /\blayered\s+anklet|\bdouble\s+anklet/i,
      },
    },
  },

  leather_goods: {
    bags: {
      types: ["tote", "sling", "hobo", "backpack", "briefcase", "clutch",
              "satchel", "baguette", "shopper", "crossbody", "bucket"],
      keywords: {
        tote      : /\btotes?\b|\btote\s+bag/i,
        sling     : /\bsling\b|\bsling\s+bag/i,
        hobo      : /\bhobo\b|\bhobo\s+bag/i,
        backpack  : /\bbackpacks?\b/i,
        briefcase : /\bbriefcases?\b|\blaptop\s+bag|\boffice\s+bag/i,
        clutch    : /\bclutches?\b|\bclutch\s+bag|\bevening\s+bag/i,
        satchel   : /\bsatchels?\b/i,
        baguette  : /\bbaguettes?\b|\bbaguette\s+bag/i,
        shopper   : /\bshoppers?\b|\bshopper\s+bag/i,
        crossbody : /\bcross[\s-]*body\b/i,
        bucket    : /\bbucket\s+bag/i,
      },
    },
    belts: {
      types: ["smooth_leather_belt", "suede_belt", "woven_belt", "reversible_belt", "canvas_belt"],
      keywords: {
        smooth_leather_belt : /\bleather\s+belt|\bfull[\s-]*grain\s+belt|\bsmooth.*belt/i,
        suede_belt          : /\bsuede\s+belt/i,
        woven_belt          : /\bwoven\s+belt|\bbraided\s+belt/i,
        reversible_belt     : /\breversible\s+belt/i,
        canvas_belt         : /\bcanvas\s+belt/i,
      },
    },
    wallets: {
      types: ["bifold", "trifold", "cardholders", "zip_around", "money_clip"],
      keywords: {
        bifold      : /\bbifold\b|\bwallet/i,
        trifold     : /\btrifold\b/i,
        cardholders : /\bcard[\s-]*holders?\b|\bcard\s+wallet/i,
        zip_around  : /\bzip[\s-]*around\b|\bzippered\s+wallet/i,
        money_clip  : /\bmoney\s+clip/i,
      },
    },
  },

  apparel: {
    sarees: {
      types: ["cotton_sarees", "silk_sarees", "chiffon_sarees", "georgette_sarees", "linen_sarees", "banarasi"],
      keywords: {
        cotton_sarees    : /\bcotton\s+saree|\bcotton\s+sari/i,
        silk_sarees      : /\bsilk\s+saree|\bpatola|\bkanjivaram|\bbanarasi\s+silk/i,
        chiffon_sarees   : /\bchiffon\s+saree/i,
        georgette_sarees : /\bgeorgette\s+saree/i,
        linen_sarees     : /\blinen\s+saree/i,
        banarasi         : /\bbanarasi\b/i,
      },
    },
    kurtas: {
      types: ["kurtas", "kurtis", "co_ords", "anarkali", "straight_cut"],
      keywords: {
        kurtas      : /\bkurtas?\b/i,
        kurtis      : /\bkurtis?\b/i,
        co_ords     : /\bco[\s-]*ords?\b|\bset\b.*\b(kurta|kurti)/i,
        anarkali    : /\banarkali\b/i,
        straight_cut: /\bstraight[\s-]*cut\b/i,
      },
    },
  },

  footwear: {
    sandals: {
      types: ["flats", "heels", "wedges", "kolhapuris", "juttis", "slides"],
      keywords: {
        flats      : /\bflats?\b|\bflat\s+sandals?\b/i,
        heels      : /\bheels?\b|\bhigh[\s-]*heels?/i,
        wedges     : /\bwedges?\b|\bwedge\s+sandals?/i,
        kolhapuris : /\bkolhapuris?\b/i,
        juttis     : /\bjuttis?\b|\bjutti\b/i,
        slides     : /\bslides?\b/i,
      },
    },
  },
};

// ── Niche → top-level category list ──────────────────────────────────────────
export const NICHE_CATEGORIES = {
  jewellery       : Object.keys(PRODUCT_TAXONOMY.jewellery),
  leather_goods   : Object.keys(PRODUCT_TAXONOMY.leather_goods),
  apparel         : Object.keys(PRODUCT_TAXONOMY.apparel),
  "bags accessories": Object.keys(PRODUCT_TAXONOMY.leather_goods),
  footwear        : Object.keys(PRODUCT_TAXONOMY.footwear),
};

// ── Classifier ────────────────────────────────────────────────────────────────
/**
 * Classify a product name into { category, type, confidence }.
 * Uses keyword matching — no API call required.
 * @param {string} productName
 * @param {string} niche - e.g. "jewellery"
 * @returns {{ category: string, type: string, confidence: number } | null}
 */
export function classifyProductType(productName, niche = "jewellery") {
  if (!productName) return null;

  const nicheKey = niche.toLowerCase().replace(/[\s_-]+/g, "_");
  const taxonomyNiche =
    PRODUCT_TAXONOMY[nicheKey] ||
    PRODUCT_TAXONOMY[nicheKey.replace("_goods", "")] ||
    PRODUCT_TAXONOMY.jewellery; // fallback

  let bestMatch = null;
  let bestScore = 0;

  for (const [category, catData] of Object.entries(taxonomyNiche)) {
    for (const [type, pattern] of Object.entries(catData.keywords || {})) {
      if (pattern.test(productName)) {
        // More specific matches (longer pattern strings) score higher
        const score = type.length;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = { category, type, confidence: 0.85 };
        }
      }
    }
  }

  // Fallback: check if the product name contains the category name directly
  if (!bestMatch) {
    for (const category of Object.keys(taxonomyNiche)) {
      if (new RegExp(`\\b${category.replace(/_/g, "[\\s-]*")}\\b`, "i").test(productName)) {
        bestMatch = { category, type: category, confidence: 0.6 };
        break;
      }
    }
  }

  return bestMatch;
}

/**
 * Classify a list of products and return them augmented with { category, type, confidence }.
 * @param {Array<{name, price}>} products
 * @param {string} niche
 * @returns {Array<{name, price, category, type, confidence}>}
 */
export function classifyProducts(products, niche = "jewellery") {
  return products.map(p => {
    const classification = classifyProductType(p.name, niche);
    return { ...p, ...(classification || { category: "unknown", type: "unknown", confidence: 0 }) };
  });
}

/**
 * Build a product-type distribution map from a classified product list.
 * Returns { type: count }, sorted by count descending.
 * @param {Array} classifiedProducts
 * @returns {Object}
 */
export function buildTypeDistribution(classifiedProducts) {
  const dist = {};
  for (const p of classifiedProducts) {
    if (p.type && p.type !== "unknown") {
      dist[p.type] = (dist[p.type] || 0) + 1;
    }
  }
  return Object.fromEntries(
    Object.entries(dist).sort(([, a], [, b]) => b - a)
  );
}

/**
 * Detect the primary product type a blog topic is targeting.
 * E.g. "best silver hoops for everyday wear" → { category: "earrings", type: "hoops" }
 * @param {string} topicTitle
 * @param {string} niche
 * @returns {{ category: string, type: string } | null}
 */
export function detectTopicProductType(topicTitle, niche = "jewellery") {
  return classifyProductType(topicTitle, niche);
}

/**
 * Filter products to only those matching the topic's primary product type.
 * Hard filter — no fallback to "popular products".
 * @param {Array} classifiedProducts
 * @param {{ category: string, type: string }} topicType
 * @param {number} minProducts - minimum required; returns null if not met
 * @returns {{ products: Array, sufficient: boolean }}
 */
export function filterProductsByTopicType(classifiedProducts, topicType, minProducts = 3) {
  if (!topicType) return { products: classifiedProducts, sufficient: true };

  const { type, category } = topicType;

  // Strict match: same type
  let filtered = classifiedProducts.filter(p => p.type === type);

  // Loose match: same category (if strict match gives < minProducts)
  if (filtered.length < minProducts) {
    filtered = classifiedProducts.filter(p => p.category === category);
  }

  return { products: filtered, sufficient: filtered.length >= minProducts };
}

/**
 * Build the type-distribution injection line for the topic brainstorm prompt.
 * E.g. "hoops (12), studs (45), drops (23). Only propose topics for types with ≥3 products."
 * @param {Object} distribution - { type: count }
 * @param {number} minProducts
 * @returns {string}
 */
export function buildTypeDistributionPromptLine(distribution, minProducts = 3) {
  const eligible = Object.entries(distribution)
    .filter(([, count]) => count >= minProducts)
    .map(([type, count]) => `${type.replace(/_/g, " ")} (${count})`);

  const ineligible = Object.entries(distribution)
    .filter(([, count]) => count < minProducts)
    .map(([type, count]) => `${type.replace(/_/g, " ")} (${count} — insufficient)`);

  const lines = [];
  if (eligible.length) {
    lines.push(`ELIGIBLE product types (≥${minProducts} products — topics may be proposed for these): ${eligible.join(", ")}.`);
  }
  if (ineligible.length) {
    lines.push(`INELIGIBLE product types (fewer than ${minProducts} products — do NOT propose topics for these): ${ineligible.join(", ")}.`);
  }
  if (!eligible.length) {
    lines.push(`No product type has ≥${minProducts} products. Do NOT propose any category-specific topic. Recommend a brand story, care guide, or broad educational topic instead.`);
  }
  return lines.join(" ");
}

/**
 * Validate that the blog body's category claims match the products in the cards section.
 * @param {string} blogText
 * @param {Array} recommendedProducts - the products that were recommended
 * @param {{ category: string, type: string }} topicType
 * @returns {{ passed: boolean, mismatches: string[], matchRatio: number }}
 */
export function validateBodyProductAlignment(blogText, recommendedProducts, topicType) {
  if (!blogText || !topicType) return { passed: true, mismatches: [], matchRatio: 1 };

  const lower = blogText.toLowerCase();
  const mismatches = [];

  // Check that recommended products match the topic type
  const matchingProducts = recommendedProducts.filter(
    p => p.type === topicType.type || p.category === topicType.category
  );
  const matchRatio = recommendedProducts.length
    ? matchingProducts.length / recommendedProducts.length
    : 1;

  if (matchRatio < 1) {
    const nonMatching = recommendedProducts
      .filter(p => p.type !== topicType.type && p.category !== topicType.category)
      .map(p => `"${p.name}" (type: ${p.type}, expected: ${topicType.type})`);
    mismatches.push(...nonMatching);
  }

  // Scan body for category-claim patterns
  const claimPatterns = [
    /the perfect ([\w\s-]{2,30}?) (at|from|by|for)/gi,
    /discover (?:our |the )?([\w\s-]{2,30}?) (?:collection|range|picks)/gi,
    /our ([\w\s-]{2,30}?) collection/gi,
    /browse (?:our )?([\w\s-]{2,30}?) (?:collection|range)/gi,
    /explore (?:the )?([\w\s-]{2,30}?) (?:collection|range)/gi,
  ];

  const bodyClaims = new Set();
  for (const pattern of claimPatterns) {
    let m;
    while ((m = pattern.exec(lower)) !== null) {
      const claimed = m[1].trim();
      if (claimed.length > 2 && claimed.length < 30) bodyClaims.add(claimed);
    }
  }

  // Check if any body claim references a type NOT present in recommended products
  const productTypes = new Set(recommendedProducts.map(p => p.type?.toLowerCase()).filter(Boolean));
  for (const claim of bodyClaims) {
    const claimMatchesAnyProduct = [...productTypes].some(t => claim.includes(t.replace(/_/g, " ")));
    const claimMatchesTopicType  = claim.includes(topicType.type.replace(/_/g, " "));
    if (!claimMatchesAnyProduct && !claimMatchesTopicType) {
      // Only flag if the claim sounds like a product type claim
      const productWordSignals = /earring|hoop|stud|drop|jhumka|necklace|bracelet|ring|anklet|bag|belt|wallet|saree|kurta|sandal/i;
      if (productWordSignals.test(claim)) {
        mismatches.push(`Body claims "${claim}" but no matching product was recommended`);
      }
    }
  }

  return { passed: mismatches.length === 0 && matchRatio >= 1.0, mismatches, matchRatio };
}
