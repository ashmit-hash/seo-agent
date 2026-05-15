export const runtime = "nodejs";

import * as cheerio from "cheerio";
import { KeyRotator } from "@/lib/keys";
import { getFestivalsForMonth, getCurrentMonthIST, YEAR_SPECIFIC_FESTIVAL_DATES } from "@/lib/festivalCalendar";

// ─── PayloadCMS config (Alippo's CMS) ────────────────────────────
// Try multiple possible CMS base URLs
const CMS_BASES = [
  "https://cms.alippo.com",
  "https://admin.alippo.com",
];

// ─── Method A: PayloadCMS API ─────────────────────────────────────
async function tryPayloadCMS(domain) {
  for (const base of CMS_BASES) {
    try {
      const url = `${base}/api/blogs?where[websiteDomain][equals]=${domain}&sort=-publishedAt&limit=1&depth=0`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "SEO-Agent/1.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const post = data.docs?.[0];
      if (!post) continue;
      return {
        method: "payloadcms",
        title: post.title || "",
        slug: post.slug || "",
        publishedAt: post.publishedAt || post.createdAt || "",
        summary: post.excerpt || post.summary || post.meta?.description || "",
        primaryKeyword: post.primaryKeyword || post.seoKeyword || "",
        url: `https://${domain}/blog/${post.slug}`,
      };
    } catch {
      // try next base
    }
  }
  return null;
}

// ─── Method B: Sitemap XML ────────────────────────────────────────
async function trySitemap(siteUrl) {
  const sitemapPaths = [
    "/sitemap-blogs.xml",
    "/sitemap.xml",
    "/sitemap_index.xml",
    "/blog-sitemap.xml",
  ];
  const blogPathMarkers = ["/blog/", "/blogs/", "/journal/", "/stories/", "/article/", "/post/"];

  for (const path of sitemapPaths) {
    try {
      const res = await fetch(`${siteUrl.replace(/\/$/, "")}${path}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const xml = await res.text();

      // Check if this is a sitemap index (points to other sitemaps)
      const subSitemaps = [...xml.matchAll(/<loc>(https?:\/\/[^<]+sitemap[^<]*\.xml[^<]*)<\/loc>/gi)]
        .map(m => m[1]);

      let xmlToSearch = xml;
      // If there are sub-sitemaps, try to find a blog-specific one
      if (subSitemaps.length > 0) {
        const blogSitemap = subSitemaps.find(u =>
          u.includes("blog") || u.includes("post") || u.includes("article")
        );
        if (blogSitemap) {
          try {
            const subRes = await fetch(blogSitemap, {
              headers: { "User-Agent": "Mozilla/5.0" },
              signal: AbortSignal.timeout(6000),
            });
            if (subRes.ok) xmlToSearch = await subRes.text();
          } catch { /* use original */ }
        }
      }

      // Extract blog URLs
      const urlBlocks = [...xmlToSearch.matchAll(/<url>([\s\S]*?)<\/url>/g)];
      const entries = urlBlocks.map(block => {
        const locMatch = block[1].match(/<loc>(.*?)<\/loc>/);
        const lastmodMatch = block[1].match(/<lastmod>(.*?)<\/lastmod>/);
        return {
          url: locMatch?.[1]?.trim() || "",
          lastmod: lastmodMatch?.[1]?.trim() || "",
        };
      }).filter(e => e.url && blogPathMarkers.some(p => e.url.includes(p)));

      if (entries.length === 0) continue;

      // Sort by lastmod descending
      entries.sort((a, b) => (b.lastmod > a.lastmod ? 1 : -1));
      const best = entries[0];

      // Try to fetch the post content
      try {
        const postRes = await fetch(best.url, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(8000),
        });
        if (postRes.ok) {
          const html = await postRes.text();
          const $ = cheerio.load(html);
          $("script, style, noscript, nav, footer, header").remove();
          const title = $("h1").first().text().trim() || $("title").text().replace(/[\|\-].*$/, "").trim();
          const metaDesc = $("meta[name='description']").attr("content") || $("meta[property='og:description']").attr("content") || "";
          const firstPara = $("article p, main p, .post-body p, .blog-content p").first().text().trim().slice(0, 400);
          return {
            method: "sitemap",
            title,
            url: best.url,
            publishedAt: best.lastmod,
            summary: metaDesc || firstPara,
          };
        }
      } catch { /* return url-only result */ }

      // URL-only fallback
      const slug = best.url.split("/").filter(Boolean).pop() || "";
      return {
        method: "sitemap-url-only",
        title: slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        url: best.url,
        publishedAt: best.lastmod,
        summary: "",
      };
    } catch { /* try next sitemap path */ }
  }
  return null;
}

// ─── Helper: pick the most recent post from a list of candidates ──
/**
 * Fetches metadata for up to N candidates, filters out product pages,
 * sorts by publishedAt descending, and returns the most recent blog post.
 * Falls back to DOM order (first = most recent for newest-first listings).
 */
async function pickMostRecentBlog(candidates, maxCheck = 6) {
  const results = [];
  for (const candidate of candidates.slice(0, maxCheck)) {
    const meta = await fetchArticleMeta(candidate.url);
    if (!meta) continue; // product page or fetch failed — skip
    results.push({
      url: candidate.url,
      title: meta.title || candidate.title,
      publishedAt: meta.publishedAt || "",
      summary: meta.summary || "",
      method: candidate.method || "detected",
    });
  }
  if (results.length === 0) return null;

  // Sort by publishedAt descending — most recent first
  results.sort((a, b) => {
    if (a.publishedAt && b.publishedAt) return b.publishedAt.localeCompare(a.publishedAt);
    if (a.publishedAt) return -1; // a has date, b doesn't → a is more specific
    if (b.publishedAt) return 1;
    return 0; // neither has date → keep DOM order
  });

  return results[0];
}

// Product URL path patterns — reject these immediately without fetching
const PRODUCT_URL_PATTERNS = /\/(product-view|product\/|products\/|product-detail|item\/|shop\/[^/]+\/[^/]+)\//i;

// ─── Helper: fetch one page and detect if it's a blog post ───────
async function fetchArticleMeta(url) {
  try {
    // Fast reject: known product URL patterns — no need to fetch
    if (PRODUCT_URL_PATTERNS.test(url)) return null;

    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = cheerio.load(html);

    // ── Detect product page signals ────────────────────────────
    // Product pages have prices, add-to-cart buttons, or Product schema
    const htmlLower = html.toLowerCase();
    const hasAddToCart = htmlLower.includes("add to cart") || htmlLower.includes("add-to-cart") || htmlLower.includes("buy now");
    const hasPriceEl = $("[class*='price'], [itemprop='price'], [class*='product-price']").length > 0;

    let isProductPage = hasAddToCart && hasPriceEl;
    let isBlogPost = false;

    // Check JSON-LD schema
    $("script[type='application/ld+json']").each((_, el) => {
      try {
        const data = JSON.parse($(el).html() || "{}");
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item["@type"] === "Product") isProductPage = true;
          if (["BlogPosting", "Article", "NewsArticle"].includes(item["@type"])) isBlogPost = true;
        }
      } catch { /* skip */ }
    });

    // If it's a product page and not explicitly a blog post, reject it
    if (isProductPage && !isBlogPost) return null;

    $("script, style, noscript, nav, footer, header").remove();

    const publishedAt =
      $("meta[property='article:published_time']").attr("content") ||
      $("time[datetime]").first().attr("datetime") ||
      $("time").first().attr("datetime") ||
      "";

    // Having a published_time strongly confirms this is a blog post
    if (publishedAt) isBlogPost = true;

    const title =
      $("h1").first().text().trim() ||
      $("meta[property='og:title']").attr("content") ||
      $("title").text().replace(/[\|\-–].*$/, "").trim();
    const summary =
      $("meta[name='description']").attr("content") ||
      $("meta[property='og:description']").attr("content") ||
      $("article p, main p, .post-content p, .blog-post p").first().text().trim().slice(0, 400) ||
      "";

    return { title: title || "", summary, publishedAt: publishedAt.slice(0, 10), isBlogPost };
  } catch { return null; }
}

// ─── Method C: Homepage discovery (nav + article cards) ──────────
/**
 * Works for ANY platform (Alippo, WordPress, custom).
 * Strategy 1: Nav links with blog keywords → visit those pages → find posts.
 * Strategy 2: Long-slug links on homepage — blog URLs are long slugs like
 *   /the-akshaya-tritiya-style-guide-why-champagne-gold-are-2026s-power-colors
 *   whereas nav links are short (/about, /contact, /shop).
 *   Works regardless of URL depth (flat or nested).
 */
async function tryHomepageDiscovery(siteUrl) {
  const base = siteUrl.replace(/\/$/, "");
  const BLOG_KEYWORDS = /blog|article|news|journal|insight|tip|story|stories|write|post|read|resource|editorial|update|guide|fashion-class/i;
  // URL segments/paths to skip — these are shop/product/account links, not blog posts
  // Includes Alippo-specific paths: product-view, category-view, collection-view
  const SKIP_PATHS = /\/(collections|products|product-view|product|category-view|collection-view|cart|account|checkout|search|category|tag|page|pages|cdn|assets|static|media|images|fonts|css|js)\//i;
  const SKIP_EXACT = new Set(["/", "/about", "/contact", "/faq", "/terms", "/privacy", "/returns", "/shipping"]);

  function toFull(href) {
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return "";
    if (href.startsWith("http")) return href;
    return `${base}${href.startsWith("/") ? "" : "/"}${href}`;
  }

  try {
    const homeRes = await fetch(base, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!homeRes.ok) return null;
    const homeHtml = await homeRes.text();
    const $ = cheerio.load(homeHtml);

    // ── Strategy 1: Nav/footer blog index links ───────────────────
    const candidateIndexUrls = new Set();
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim();
      if (BLOG_KEYWORDS.test(href) || BLOG_KEYWORDS.test(text)) {
        const full = toFull(href);
        if (full && full.startsWith(base)) candidateIndexUrls.add(full);
      }
    });

    for (const indexUrl of candidateIndexUrls) {
      try {
        const idxRes = await fetch(indexUrl, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(7000),
        });
        if (!idxRes.ok) continue;
        const idxHtml = await idxRes.text();
        const i$ = cheerio.load(idxHtml);
        i$("script, style, noscript").remove();

        const indexPath = new URL(indexUrl).pathname;
        const articleLinks = [];

        i$("a[href]").each((_, el) => {
          const href = i$(el).attr("href") || "";
          const full = toFull(href);
          if (!full || !full.startsWith(base)) return;
          const path = full.replace(base, "");
          if (path.length > indexPath.length + 3 && path.startsWith(indexPath)) {
            const title =
              i$(el).find("h1, h2, h3, h4").first().text().trim() ||
              i$(el).closest("article, .card, [class*='blog'], [class*='post'], [class*='article']")
                .find("h1, h2, h3").first().text().trim() ||
              i$(el).text().replace(/read\s*more/gi, "").trim().slice(0, 150);
            if (title.length > 5 && !articleLinks.find(l => l.url === full)) {
              articleLinks.push({ url: full, title });
            }
          }
        });

        if (articleLinks.length > 0) {
          // Check top 6 links and pick the MOST RECENT — not just the first found
          const best = await pickMostRecentBlog(articleLinks.map(l => ({ ...l, method: "homepage-discovery" })));
          if (best) return best;
        }
      } catch { /* try next */ }
    }

    // ── Strategy 2: Long-slug links anywhere on homepage ─────────
    // Blog post URLs are long slugs (20+ chars, multiple hyphenated words).
    // Nav/product/collection links are short or contain known e-commerce paths.
    const longSlugLinks = [];

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      const full = toFull(href);
      if (!full || !full.startsWith(base)) return;

      const path = full.replace(base, "").split("?")[0].split("#")[0];
      if (!path || SKIP_EXACT.has(path) || SKIP_PATHS.test(path)) return;

      // The slug is the last path segment (or the whole path if flat URL)
      const slug = path.replace(/\/$/, "").split("/").pop() || "";

      // Blog slugs are long (many hyphenated words) — nav/collection links are short
      if (slug.length < 20) return;

      // Extra signal: blog slugs have many hyphens (multiple words)
      const hyphenCount = (slug.match(/-/g) || []).length;
      if (hyphenCount < 2) return; // skip things like "midi-skirt-dress" → actually has 2, so this won't help
      // Better filter: must have 3+ words in the slug
      if (slug.split("-").length < 4) return;

      // Extract title from: heading inside link → heading in parent card →
      // paragraph near link (Alippo puts title in <p>, not <h>) → link text minus "read more"
      const headingInLink = $(el).find("h1, h2, h3, h4").first().text().trim();
      const rawLinkText = $(el).text().trim();
      const linkTextClean = rawLinkText.replace(/read\s*more/gi, "").replace(/by\s+[A-Z][a-z]+(\s+[A-Z][a-z]+)*/g, "").replace(/\s+/g, " ").trim();

      // Walk up the DOM to find the card container, look for any nearby title text
      const parent = $(el).closest("article, section, [class*='card'], [class*='blog'], [class*='post'], [class*='item'], div, li");
      const headingInParent =
        parent.find("h1, h2, h3, h4").first().text().trim() ||
        parent.find("[class*='title'], [class*='heading'], [class*='name']").first().text().trim();

      // For Alippo: title is often in a <p> sibling of the "READ MORE" link
      const parasInParent = parent.find("p").map((_, p) => $(p).text().trim()).get()
        .filter(t => t.length > 10 && t.length < 200 && !(/read\s*more/i.test(t)));
      const paraTitle = parasInParent[0] || "";

      const title = headingInLink || headingInParent || paraTitle || (linkTextClean.length > 5 ? linkTextClean.slice(0, 150) : "");

      if (title.length > 5 && !longSlugLinks.find(l => l.url === full)) {
        longSlugLinks.push({ url: full, title, slug });
      }
    });

    if (longSlugLinks.length > 0) {
      // Sort: prefer links with more words in title (blog titles are longer than product names)
      longSlugLinks.sort((a, b) => b.title.split(" ").length - a.title.split(" ").length);

      // Try each candidate — skip product pages, return first confirmed blog post
      for (const candidate of longSlugLinks.slice(0, 5)) {
        const meta = await fetchArticleMeta(candidate.url);
        if (!meta) continue; // null = product page or fetch failed — skip
        if (meta.title && meta.title.length > 5) {
          return {
            method: "homepage-long-slug",
            title: meta.title,
            url: candidate.url,
            publishedAt: meta.publishedAt || "",
            summary: meta.summary || "",
          };
        }
      }
    }
  } catch { /* homepage fetch failed */ }
  return null;
}

// ─── Method D: Shopify Blogs JSON API ────────────────────────────
async function tryShopifyBlogsAPI(siteUrl) {
  const base = siteUrl.replace(/\/$/, "");
  try {
    const blogsRes = await fetch(`${base}/blogs.json`, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!blogsRes.ok) return null;
    const blogsData = await blogsRes.json();
    const blogs = blogsData.blogs || [];
    if (blogs.length === 0) return null;

    for (const blog of blogs) {
      try {
        const articlesRes = await fetch(
          `${base}/blogs/${blog.handle}/articles.json?limit=5&published_status=published`,
          { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(5000) }
        );
        if (!articlesRes.ok) continue;
        const { articles = [] } = await articlesRes.json();
        if (articles.length === 0) continue;
        articles.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
        const article = articles[0];
        return {
          method: "shopify-api",
          title: article.title || "",
          url: `${base}/blogs/${blog.handle}/${article.handle}`,
          publishedAt: (article.published_at || "").slice(0, 10),
          summary: (article.summary_html || article.body_html || "").replace(/<[^>]*>/g, "").trim().slice(0, 400),
        };
      } catch { /* try next blog */ }
    }
  } catch { /* not Shopify */ }
  return null;
}

// ─── Method E: Known blog paths brute-force ───────────────────────
async function tryBlogIndex(siteUrl) {
  const base = siteUrl.replace(/\/$/, "");
  const blogIndexPaths = [
    "/blog", "/blogs", "/blogs/news", "/blogs/journal",
    "/blogs/all", "/articles", "/news", "/journal", "/stories",
  ];
  const blogPathMarkers = ["/blog/", "/blogs/", "/article/", "/post/", "/news/", "/journal/", "/stories/"];

  for (const indexPath of blogIndexPaths) {
    try {
      const res = await fetch(`${base}${indexPath}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);
      $("script, style, noscript, nav, footer").remove();

      const links = [];
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href") || "";
        const fullUrl = href.startsWith("http") ? href : `${base}${href}`;
        if (
          blogPathMarkers.some(p => href.includes(p)) &&
          href.length > indexPath.length + 2 &&
          href !== indexPath &&
          !links.find(l => l.url === fullUrl)
        ) {
          const title =
            $(el).find("h1, h2, h3, h4").first().text().trim() ||
            $(el).closest("article, .card, [class*='blog'], [class*='post']")
              .find("h1, h2, h3").first().text().trim() ||
            $(el).text().trim().slice(0, 150);
          if (title.length > 3) links.push({ url: fullUrl, title });
        }
      });

      if (links.length > 0) {
        // Check top 6 and pick the MOST RECENT post
        const best = await pickMostRecentBlog(links.map(l => ({ ...l, method: "blog-index" })));
        if (best) return best;
      }
    } catch { /* try next */ }
  }
  return null;
}

// ─── Product/Collection Scraper ───────────────────────────────────
/**
 * Scrape actual product names from the brand's website.
 * Tries common e-commerce paths to extract real product names.
 * Returns a list of product/category names found on the site.
 */
async function scrapeActualProducts(siteUrl) {
  const base = siteUrl.replace(/\/$/, "");
  const pathsToTry = [
    "/collections/all",
    "/shop",
    "/products",
    "/store",
    "/collections",
    "/category/all",
    "/categories",
    "/",
  ];

  const productNames = new Set();

  for (const path of pathsToTry) {
    try {
      const res = await fetch(`${base}${path}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);
      $("script, style, noscript, nav, footer, header").remove();

      // Shopify / WooCommerce / generic product cards
      const selectors = [
        ".product-card__title",
        ".product-title",
        ".product__title",
        ".product-name",
        ".woocommerce-loop-product__title",
        "h2.title",
        "h3.title",
        ".card__heading",
        ".grid-product__title",
        "[class*='product'] h2",
        "[class*='product'] h3",
        "[class*='product'] h4",
        ".collection-grid__item h2",
        ".collection-grid__item h3",
        // JSON-LD structured data
      ];

      for (const sel of selectors) {
        $(sel).each((_, el) => {
          const name = $(el).text().trim();
          if (name.length > 2 && name.length < 120) productNames.add(name);
        });
      }

      // Also look for JSON-LD product data
      $("script[type='application/ld+json']").each((_, el) => {
        try {
          const json = JSON.parse($(el).html() || "{}");
          const items = Array.isArray(json) ? json : [json];
          for (const item of items) {
            if (item["@type"] === "Product" && item.name) productNames.add(item.name);
            if (item["@type"] === "ItemList" && Array.isArray(item.itemListElement)) {
              item.itemListElement.forEach(e => { if (e.name) productNames.add(e.name); });
            }
          }
        } catch { /* skip malformed JSON-LD */ }
      });

      // Also try Shopify's products.json endpoint
      if (path === "/collections/all" || path === "/") {
        try {
          const jsonRes = await fetch(`${base}/collections/all/products.json?limit=30`, {
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(5000),
          });
          if (jsonRes.ok) {
            const jsonData = await jsonRes.json();
            (jsonData.products || []).forEach(p => {
              if (p.title) productNames.add(p.title);
              // Also collect product types/tags
              if (p.product_type) productNames.add(p.product_type);
            });
          }
        } catch { /* no products.json */ }
      }

      if (productNames.size >= 5) break; // enough products found
    } catch { /* try next path */ }
  }

  return [...productNames].slice(0, 40); // cap at 40 product names
}

// ─── Master Blog Detector ─────────────────────────────────────────
async function detectLastBlog(siteUrl) {
  let domain = siteUrl;
  try { domain = new URL(siteUrl).hostname; } catch { /* use as-is */ }

  // Method A: PayloadCMS (Alippo-specific CMS API)
  const payloadResult = await tryPayloadCMS(domain);
  if (payloadResult) return payloadResult;

  // Method B: Sitemap XML (works for most platforms if sitemap has blog URLs)
  const sitemapResult = await trySitemap(siteUrl);
  if (sitemapResult) return sitemapResult;

  // Method C: Homepage navigation discovery (works for ANY platform — Alippo, WP, custom, etc.)
  // Crawls the site's own nav to find the blog section, then finds the latest post
  const homepageResult = await tryHomepageDiscovery(siteUrl);
  if (homepageResult) return homepageResult;

  // Method D: Shopify JSON API (Shopify-specific)
  const shopifyResult = await tryShopifyBlogsAPI(siteUrl);
  if (shopifyResult) return shopifyResult;

  // Method E: Brute-force known blog index paths
  const indexResult = await tryBlogIndex(siteUrl);
  if (indexResult) return indexResult;

  // No blog found
  return { method: "none", isFirstBlog: true };
}

// ─── Gemini Direct Call ───────────────────────────────────────────
async function callGeminiForJSON(prompt, apiKey) {
  // Use stable models only — preview models get deprecated without notice
  const modelsToTry = [
    "gemini-2.0-flash",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
  ];

  let lastErr;
  for (const model of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 2048, temperature: 0.75 },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
          ],
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        const err = await res.text();
        // 404 = model not found, try next
        if (res.status === 404) { lastErr = new Error(`${model} not found`); continue; }
        throw new Error(`Gemini ${res.status}: ${err.slice(0, 300)}`);
      }

      const data = await res.json();
      if (data.promptFeedback?.blockReason) throw new Error(`Gemini blocked: ${data.promptFeedback.blockReason}`);
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (!text) { lastErr = new Error(`${model} returned empty`); continue; }
      return text;
    } catch (e) {
      if (e.message?.includes("not found")) { lastErr = e; continue; }
      throw e;
    }
  }
  throw lastErr || new Error("All Gemini models failed");
}


// ─── Date helpers ─────────────────────────────────────────────────
function getTodayIST() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

function getTodayISTString() {
  const d = getTodayIST();
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
}

/**
 * Estimate if a festival is still upcoming given today's date.
 * Uses the festival's date string (e.g. "Second Sunday of May", "January 14", "May (varies)")
 * Returns true if the festival MIGHT still be upcoming (conservative — keep if unsure).
 */
function isFestivalUpcoming(festivalDate, targetMonthName, todayIST, festivalName) {
  const year  = todayIST.getFullYear();
  const todayDay = todayIST.getDate();
  const todayMonth = todayIST.getMonth(); // 0-indexed

  const MONTH_INDEX = {
    January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
    July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
  };
  const targetMonthIdx = MONTH_INDEX[targetMonthName] ?? -1;

  // ── Year-specific lookup for "varies" festivals ───────────────
  // Check the actual date for this year before falling back to string parsing
  if (festivalName && YEAR_SPECIFIC_FESTIVAL_DATES[festivalName]) {
    const yearData = YEAR_SPECIFIC_FESTIVAL_DATES[festivalName][year];
    if (yearData) {
      const actualMonthIdx = MONTH_INDEX[yearData.month] ?? -1;
      const actualDay = yearData.day;
      // If the festival actually falls in a DIFFERENT month this year, it's not in targetMonth
      if (actualMonthIdx !== targetMonthIdx) return false;
      // Same month — check if day has passed
      if (actualMonthIdx === todayMonth) return actualDay >= todayDay;
      if (actualMonthIdx > todayMonth) return true;
      return false; // actualMonth < todayMonth → already passed
    }
  }

  // If target month is in the future → all festivals are upcoming
  if (targetMonthIdx > todayMonth) return true;
  // If target month is in the past → all festivals have passed
  if (targetMonthIdx < todayMonth) return false;

  // Same month — check approximate day
  const dateStr = festivalDate || "";

  // Pattern: "January 14", "February 14", etc. — fixed date
  const fixedMatch = dateStr.match(/\b(\d{1,2})\b/);
  if (fixedMatch) {
    const day = parseInt(fixedMatch[1]);
    return day >= todayDay;
  }

  // Pattern: "Second Sunday of May", "Third Sunday of June" etc.
  const nthDayMatch = dateStr.match(/\b(First|Second|Third|Fourth|Last)\s+(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)/i);
  if (nthDayMatch) {
    const ordinal = { first: 1, second: 2, third: 3, fourth: 4, last: -1 }[nthDayMatch[1].toLowerCase()] || 2;
    const dayName = nthDayMatch[2];
    const DAY_MAP = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
    const targetDay = DAY_MAP[dayName] ?? 0;
    let count = 0;
    for (let d = 1; d <= 31; d++) {
      const dt = new Date(year, targetMonthIdx, d);
      if (dt.getMonth() !== targetMonthIdx) break;
      if (dt.getDay() === targetDay) {
        count++;
        if (count === ordinal || ordinal === -1) {
          return d >= todayDay;
        }
      }
    }
  }

  // Pattern contains "full moon" — check year-specific; else if past ~15th assume passed
  if (/full moon/i.test(dateStr)) {
    return todayDay <= 14;
  }

  // Pattern: "varies", etc. — no year-specific data, drop conservatively if month matches today
  // If we're in the same month and no year-specific date, assume it may have passed mid-month
  if (targetMonthIdx === todayMonth && todayDay > 15) return false;
  return true;
}

// ─── Build Recommendation Prompt ─────────────────────────────────
function buildPrompt({ siteUrl, niche, brandAudit, lastBlog, isFirstBlog, festivals, targetMonth, todayString, actualProducts }) {
  const lastBlogSection = isFirstBlog
    ? `LAST PUBLISHED BLOG: None found — this appears to be a new store or a brand that has not started blogging yet. Base recommendation on niche + festival only.`
    : `LAST PUBLISHED BLOG:
Title: "${lastBlog.title}"
URL: ${lastBlog.url}
Published: ${lastBlog.publishedAt || "recently"}
Summary: ${lastBlog.summary || "(no summary available — infer from title)"}`;

  const festivalSection =
    festivals.length > 0
      ? `UPCOMING FESTIVALS / MOMENTS IN ${targetMonth.toUpperCase()} (that have NOT yet passed as of today):
${festivals.map(f => `- ${f.name} (${f.date})
  Significance: ${f.significance}
  D2C content angles: ${f.d2cAngles.join(" | ")}`).join("\n\n")}`
      : `FESTIVALS IN ${targetMonth.toUpperCase()}: No upcoming festivals remain in this month (all have already passed, or there are none). Base the recommendation on evergreen niche content or a commercial intent angle instead. Set festivalReference to null.`;

  const auditSnippet = (brandAudit || "").slice(0, 600);

  const productsSection = actualProducts && actualProducts.length > 0
    ? `ACTUAL PRODUCTS ON THIS WEBSITE (scraped directly — these are the ONLY products that exist):
${actualProducts.map(p => `• ${p}`).join("\n")}

CRITICAL PRODUCT RULE: You MUST ONLY recommend blog topics about products and categories that are explicitly listed above. If the list above contains knee supports, compression socks, and back belts — write about THOSE products only. Do NOT invent, assume, or hallucinate any product that is not in this list. If you cannot find a relevant festival angle for these exact products, skip the festival and recommend an evergreen topic for the listed products instead.`
    : `ACTUAL PRODUCTS: Could not be scraped automatically. Use the Brand Audit and Niche to infer products, but be conservative — only mention product types that are clearly implied by the brand niche.`;

  // Extract festival names mentioned in the last blog title so we don't repeat them
  const lastBlogTitle = (!isFirstBlog && lastBlog?.title) ? lastBlog.title.toLowerCase() : "";
  const alreadyCoveredFestivals = festivals
    .filter(f => lastBlogTitle.includes(f.name.toLowerCase().split(" ")[0]))
    .map(f => f.name);
  const alreadyCoveredNote = alreadyCoveredFestivals.length > 0
    ? `\nDO NOT REPEAT: The last blog already covered ${alreadyCoveredFestivals.join(", ")}. Do NOT recommend a topic about the same festival. Choose a different angle or festival entirely.`
    : "";

  return `You are a senior content strategist for Indian D2C brands. Your task: recommend ONE blog topic.

TODAY'S DATE: ${todayString}

CRITICAL DATE RULE: Do NOT recommend any festival or moment that falls BEFORE today (${todayString}). If a festival has already passed this month, it is irrelevant — treat it as if it does not exist. Only recommend a festival angle for something that is still upcoming from today's date.${alreadyCoveredNote}

---
BRAND:
- Website: ${siteUrl}
- Niche / Category: ${niche}
- Brand Audit Highlights: ${auditSnippet || "(not available)"}

${productsSection}

${lastBlogSection}

${festivalSection}

TARGET PUBLISH MONTH: ${targetMonth}
---

INSTRUCTIONS:
Recommend exactly ONE blog topic that:
1. Builds on or naturally complements the last blog (different angle, not a rehash) — or is the best first post if no blog exists
2. Ties to a festival or commercial moment still UPCOMING in ${targetMonth} (after ${todayString}) IF relevant to this niche. If no upcoming festival is relevant, skip the festival angle entirely and recommend strong evergreen content instead.
3. Serves commercial intent — drives traffic toward the brand's product/collection pages
4. Has real search demand in India (the kind of query a real person types into Google)

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation outside the JSON):
{
  "recommendedTopic": "The exact, ready-to-publish blog title — specific, keyword-rich, no brackets",
  "primaryKeyword": "The main SEO keyword phrase people search for (2-5 words, India-relevant)",
  "reasoning": {
    "continuityFromLastBlog": "Why this is the right follow-up to the last blog, or why it is the ideal first post",
    "festivalAngle": "Which upcoming festival this ties to and exactly how — OR 'No upcoming festival this month — recommendation is based on evergreen niche and commercial intent' if none apply",
    "commercialIntent": "How this specific blog drives buyers to the brand's products or collections — be concrete",
    "searchIntent": "What Indian users are typing into Google that this blog answers — include 2-3 example search queries"
  },
  "lastBlogReference": {
    "title": "${isFirstBlog ? "No previous blog published" : (lastBlog?.title || "").replace(/"/g, "'")}",
    "publishedAt": "${isFirstBlog ? "N/A" : (lastBlog?.publishedAt || "recent")}",
    "url": "${isFirstBlog ? "" : (lastBlog?.url || "")}"
  },
  "festivalReference": ${festivals.length > 0 ? '{"name": "festival name that is still upcoming", "date": "date of festival", "significance": "one sentence on why this festival is relevant to this niche"} or null if no upcoming festival applies' : "null"},
  "verdict": "One to two sentences starting with: This topic is a strong choice because..."
}`;
}

// ─── Route Handler ────────────────────────────────────────────────
export async function POST(req) {
  try {
    const { siteUrl, niche, brandAudit, scrapeContext, targetMonth } = await req.json();
    if (!siteUrl) {
      return Response.json({ error: "siteUrl is required" }, { status: 400 });
    }

    const resolvedMonth = targetMonth || getCurrentMonthIST();
    const todayIST    = getTodayIST();
    const todayString = getTodayISTString();

    // Filter out festivals that have already passed this month
    const allFestivals = getFestivalsForMonth(resolvedMonth);
    const festivals    = allFestivals.filter(f => isFestivalUpcoming(f.date, resolvedMonth, todayIST, f.name));

    // ── Detect last blog + scrape products in parallel ───────────
    let lastBlog = null;
    let isFirstBlog = false;
    let actualProducts = [];

    const [blogResult, productResult] = await Promise.allSettled([
      detectLastBlog(siteUrl),
      scrapeActualProducts(siteUrl),
    ]);

    if (blogResult.status === "fulfilled") {
      const detected = blogResult.value;
      if (detected.isFirstBlog) {
        isFirstBlog = true;
      } else {
        lastBlog = detected;
      }
    } else {
      isFirstBlog = true; // graceful fallback
    }

    if (productResult.status === "fulfilled" && productResult.value.length > 0) {
      actualProducts = productResult.value;
    }

    // ── Call Gemini for recommendation ───────────────────────────
    const apiKey = KeyRotator.getKey("gemini");
    if (!apiKey) throw new Error("No Gemini API key available. Please check environment variables.");

    const prompt = buildPrompt({
      siteUrl,
      niche: niche || "D2C brand",
      brandAudit: brandAudit || scrapeContext || "",
      lastBlog,
      isFirstBlog,
      festivals,
      targetMonth: resolvedMonth,
      todayString,
      actualProducts,
    });

    const rawText = await callGeminiForJSON(prompt, apiKey);

    // ── Parse JSON ───────────────────────────────────────────────
    let recommendation;
    try {
      // responseMimeType: application/json should give clean JSON, but strip fences just in case
      const jsonStr = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      recommendation = JSON.parse(jsonStr);
    } catch (parseErr) {
      // Try to extract JSON object if there's surrounding text
      const match = rawText.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Gemini response was not valid JSON. Please try again.");
      recommendation = JSON.parse(match[0]);
    }

    return Response.json({
      recommendation,
      lastBlog: isFirstBlog ? null : lastBlog,
      festival: festivals,
      isFirstBlog,
      targetMonth: resolvedMonth,
    });
  } catch (err) {
    console.error("[topic-recommend] Error:", err.message);
    return Response.json({ error: err.message || "Failed to generate recommendation" }, { status: 500 });
  }
}
