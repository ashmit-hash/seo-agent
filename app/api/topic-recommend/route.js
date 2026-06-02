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

// Static/policy page slug keywords — these are never blog posts
const STATIC_PAGE_SLUG = /\b(policy|policies|terms|conditions|shipping|delivery|privacy|refund|return|legal|disclaimer|cookie|about|contact|faq|help|support|sitemap|careers|press|investor)\b/i;

// Title keywords that indicate a static page (not a blog post)
const STATIC_PAGE_TITLE = /^(shipping|delivery|return|refund|privacy|terms|cookie|legal|about us|contact us|faq|careers|press release)/i;

// ─── Helper: fetch one page and detect if it's a blog post ───────
async function fetchArticleMeta(url) {
  try {
    // Fast reject: known product URL patterns — no need to fetch
    if (PRODUCT_URL_PATTERNS.test(url)) return null;
    // Fast reject: policy/static page URL slugs
    const urlPath = url.replace(/^https?:\/\/[^/]+/, "");
    if (STATIC_PAGE_SLUG.test(urlPath)) return null;

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

    // Check page title/h1 for static page signals
    const rawTitle = $("h1").first().text().trim() ||
      $("meta[property='og:title']").attr("content") || "";
    if (STATIC_PAGE_TITLE.test(rawTitle)) return null;

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
      // Skip policy/static pages by slug keywords
      if (STATIC_PAGE_SLUG.test(path)) return;

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
 * Scrape REAL products (with confirmed inventory) from the brand's website.
 * Returns objects: { name: string, price: number|null, confirmed: boolean }
 *
 * "confirmed" = true when we have a price or found the item in a structured
 * product API (not just a nav category name). Only confirmed products are
 * safe to use as blog topics — empty categories must be excluded.
 */
async function scrapeActualProducts(siteUrl) {
  const base = siteUrl.replace(/\/$/, "");

  // ── Helper: extract products from rendered HTML using ₹ price anchors ──────
  // Works for Alippo App Router sites where product names + prices are
  // rendered as plain text in the HTML (no JSON blob, no __NEXT_DATA__).
  // Strategy: split text by ₹ price markers, then grab the text immediately
  // BEFORE each price (cleaned of filler words) as the product name.
  function extractFromRenderedHtml(html) {
    const $ = cheerio.load(html);
    $("script, style, noscript, nav, footer, header, aside").remove();
    const text = $("body").text().replace(/\s+/g, " ").trim();

    const products = [];
    // Split on ₹ price occurrences — text before each ₹ has the product name
    const segments = text.split(/(₹[\d,]+)/);

    for (let i = 0; i + 1 < segments.length; i += 2) {
      const before  = segments[i];
      const priceRaw = segments[i + 1]; // e.g. "₹18,150"
      const price    = parseInt(priceRaw.replace(/[^\d]/g, ""), 10);
      if (!price || price < 50) continue;

      // Skip MRP prices — they come right after a "-38%MRP" separator text.
      // Check the CURRENT `before` segment (not the next one) to detect separators.
      // Pattern: segment looks like "-38%MRP" or ends with "MRP"
      const beforeTrimmed = before.trim();
      const isMrpEntry =
        /^[-–]\s*\d+\s*%\s*(?:off|mrp)/i.test(beforeTrimmed) ||
        /\bmrp\s*$/i.test(beforeTrimmed);
      if (isMrpEntry) continue;

      // Clean the text before the price to extract the product name
      let nameSrc = before
        .replace(/\(\s*Pack of \d+\s*\)/gi, "")   // remove "(Pack of 30)"
        .replace(/\d+\s*Options?/gi, "")            // remove "4 Options"
        .replace(/\s*-\s*\d+\s*%\s*(?:OFF|MRP)?\s*$/i, "") // trailing discount
        .replace(/\b(Filters?|Sort\s+By|Categories|Home|Shop|New|Sale|Explore\s+All|Bestsellers?|Trending|Featured|Free\s+Shipping|Cash\s+On\s+Delivery|Ships?\s+\w+)\b/gi, " ")
        .replace(/[^\w\s\-–:.'&()/]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      // Segment[0] (and sometimes others) may have a long nav/banner preamble
      // before the actual product name. Split on sentence boundaries (periods)
      // and take the LAST sentence — it's the product name text.
      const sentences = nameSrc.split(/\.+/).map(s => s.trim()).filter(Boolean);
      if (sentences.length > 1) nameSrc = sentences[sentences.length - 1];

      // Strip trailing lone digits (e.g. "4" from "Pack of 30)4")
      nameSrc = nameSrc.replace(/\s+\d{1,2}\s*$/, "").trim();

      // Take the LAST reasonable-length phrase as product name (up to 10 words)
      const words = nameSrc.split(/\s+/).filter(w => w.length > 0);
      if (words.length < 2) continue;
      const nameWords = words.slice(-10);
      const productName = nameWords.join(" ").trim();

      // Reject obvious nav/filler names
      if (/^(HOME|SHOP|ABOUT|CONTACT|FILTERS?|SORT|CATEGORIES|MRP|NEW|SALE|ALL|EXPLORE|BESTSELL|FEATURE|LEGAL|PRIVACY|RETURN|BULK)/i.test(productName)) continue;
      if (productName.length < 5 || productName.length > 120) continue;
      // Reject names with fewer than 2 meaningful words
      if (nameWords.length < 2) continue;

      products.push({ name: productName, price });
    }

    // Deduplicate by name
    const seen = new Set();
    return products.filter(p => {
      if (seen.has(p.name)) return false;
      seen.add(p.name);
      return true;
    });
  }

  const confirmed = []; // price-verified products

  // ── Priority 1: Alippo App Router — "/category-view/explore-all" ──────────
  // Alippo's "explore all" page lists EVERY product with its selling price
  // in the rendered HTML. This is the most reliable source for Alippo stores.
  const alippoProductPaths = [
    "/category-view/explore-all",
    "/category-view/bestsellers",
    "/category-view/new-arrivals",
    "/collection-view/explore-all",
    "/collection-view/all",
  ];
  for (const path of alippoProductPaths) {
    if (confirmed.length >= 5) break;
    try {
      const res = await fetch(`${base}${path}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const prods = extractFromRenderedHtml(html);
      prods.forEach(p => confirmed.push(p));
      if (confirmed.length >= 5) break;
    } catch { /* try next */ }
  }

  // ── Priority 2: Alippo category index — find populated category slugs ─────
  // Visit /category-view to get the list of categories, then visit each one
  // that has products (look for ₹ in the rendered HTML).
  if (confirmed.length === 0) {
    try {
      const indexRes = await fetch(`${base}/category-view`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(7000),
      });
      if (indexRes.ok) {
        const indexHtml = await indexRes.text();
        // Find category slugs from links like /category-view/some-category
        const slugs = [...indexHtml.matchAll(/href="(\/category-view\/[^"]+)"/g)]
          .map(m => m[1])
          .filter((v, i, a) => a.indexOf(v) === i)
          .slice(0, 8);
        for (const slug of slugs) {
          if (confirmed.length >= 5) break;
          try {
            const catRes = await fetch(`${base}${slug}`, {
              headers: { "User-Agent": "Mozilla/5.0" },
              signal: AbortSignal.timeout(7000),
            });
            if (!catRes.ok) continue;
            const catHtml = await catRes.text();
            const prods = extractFromRenderedHtml(catHtml);
            prods.forEach(p => confirmed.push(p));
          } catch { /* try next slug */ }
        }
      }
    } catch { /* skip */ }
  }

  // ── Priority 3: Shopify products.json ────────────────────────────────────
  if (confirmed.length === 0) {
    try {
      const res = await fetch(`${base}/products.json?limit=30`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        (data.products || []).slice(0, 25).forEach(p => {
          if (p.title) confirmed.push({
            name: p.title,
            price: parseFloat(p.variants?.[0]?.price ?? "0") || null,
          });
        });
      }
    } catch { /* not Shopify */ }
  }

  // ── Priority 4: WooCommerce REST API ──────────────────────────────────────
  if (confirmed.length === 0) {
    try {
      const res = await fetch(`${base}/wp-json/wc/v3/products?per_page=20&status=publish`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          data.slice(0, 20).forEach(p => {
            if (p.name) confirmed.push({
              name: p.name,
              price: parseFloat(p.price || p.regular_price || "0") || null,
            });
          });
        }
      }
    } catch { /* not WooCommerce */ }
  }

  // ── Priority 5: Generic product listing pages (Shopify / custom) ──────────
  if (confirmed.length === 0) {
    for (const path of ["/collections/all", "/shop", "/products", "/store"]) {
      if (confirmed.length >= 5) break;
      try {
        const res = await fetch(`${base}${path}`, {
          headers: { "User-Agent": "Mozilla/5.0" },
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) continue;
        const html = await res.text();
        const prods = extractFromRenderedHtml(html);
        prods.forEach(p => confirmed.push(p));
      } catch { /* try next */ }
    }
  }

  // ── Return result with reliability flag ──────────────────────────────────
  let finalProducts = confirmed
    .filter(p => p.name && p.name.length > 4)
    // Sort highest-price first so Gemini sees the most valuable products at the top
    .sort((a, b) => (b.price || 0) - (a.price || 0));

  // ── Drop bottom-tier cheap products when premium products exist ──────────
  // If the catalogue has a wide price range (e.g. ₹66,000 backpack vs ₹350 socks),
  // Gemini will still pick the cheapest item unless we filter it out.
  // Rule: if the top product is ≥10× more expensive than the cheapest item,
  // drop everything priced below (maxPrice / 12). This keeps meaningful products
  // and removes commodity filler (socks, basic caps, etc.).
  const prices = finalProducts.map(p => p.price || 0).filter(p => p > 0);
  if (prices.length >= 3) {
    const maxPrice = prices[0]; // already sorted desc
    const minPrice = prices[prices.length - 1];
    if (maxPrice >= minPrice * 10) {
      const threshold = Math.floor(maxPrice / 12); // e.g. ₹66k / 12 ≈ ₹5,500
      const filtered  = finalProducts.filter(p => !p.price || p.price >= threshold);
      // Only apply filter if we still have ≥3 products
      if (filtered.length >= 3) finalProducts = filtered;
    }
  }

  finalProducts = finalProducts.slice(0, 20);

  if (finalProducts.length > 0) {
    return {
      reliable: true,
      products: finalProducts.map(p =>
        p.price ? `${p.name} (₹${Math.round(p.price).toLocaleString("en-IN")})` : p.name
      ),
    };
  }
  return { reliable: false, products: [] };
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
  // Use stable models — 2.0 series fully retired by Google as of Jun 2026
  const modelsToTry = [
    "gemini-2.5-flash",
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
          generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0.95,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 0 },
          },
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
      // Same month — check if day has passed AND there's enough lead time to rank
      // Require at least 14 days before the festival (blog needs time to index & rank).
      if (actualMonthIdx === todayMonth) return actualDay - todayDay >= 14;
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

  // Minimum lead time: need at least 14 days before a festival to write, publish, and rank.
  const MIN_LEAD_DAYS = 14;

  // Pattern: "January 14", "February 14", etc. — fixed date
  const fixedMatch = dateStr.match(/\b(\d{1,2})\b/);
  if (fixedMatch) {
    const day = parseInt(fixedMatch[1]);
    return (day - todayDay) >= MIN_LEAD_DAYS;
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
          return (d - todayDay) >= MIN_LEAD_DAYS;
        }
      }
    }
  }

  // Pattern contains "full moon" — only recommend if ≥14 days before mid-month full moon
  if (/full moon/i.test(dateStr)) {
    return todayDay <= 1; // full moon ~day 15; need 14-day lead → only valid if today ≤ day 1
  }

  // Pattern: "varies", etc. — no year-specific data, drop conservatively if month matches today
  // If we're in the same month and no year-specific date, assume it may have passed mid-month
  if (targetMonthIdx === todayMonth && todayDay > 15) return false;
  return true;
}

// ─── Build Recommendation Prompt ─────────────────────────────────
function buildPrompt({ siteUrl, niche, brandAudit, lastBlog, isFirstBlog, festivals, targetMonth, todayString, actualProducts, productsReliable, varietySeed, avoidTopic, topicExclusions, pillarConstraintText, lockedOccasions }) {
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

  const productsSection = (() => {
    if (actualProducts && actualProducts.length > 0 && productsReliable) {
      // Best case: confirmed products with prices from database/API
      return `CONFIRMED PRODUCTS IN STOCK (scraped directly from the store database — these products definitely exist with live inventory):
${actualProducts.map(p => `• ${p}`).join("\n")}

🚨 CRITICAL PRODUCT RULES:
1. ONLY recommend a blog topic about products from the list above.
2. Every product above has a price — that is proof it exists in inventory.
3. If no festival angle applies to these specific products, skip the festival and recommend strong evergreen content about what IS in the list.
4. The recommendedTopic must be something a customer can actually BUY on this website today.
5. FOCUS ON HIGH-VALUE OR DISTINCTIVE PRODUCTS: The list is sorted by price (most expensive first). Build your topic around one of the TOP products — the expensive, specialized, or uniquely named ones. DO NOT choose the cheapest or most generic product (e.g., basic socks, plain caps) as the blog focus when premium or distinctive items are available. A blog about a ₹60,000 tactical backpack drives far more revenue than one about ₹350 socks.`;
    }

    if (actualProducts && actualProducts.length > 0 && !productsReliable) {
      // Unconfirmed: scraped from HTML — might include category labels
      return `POSSIBLE PRODUCTS (scraped from page HTML — confidence level: MEDIUM. These may include subcategory names, not just individual products):
${actualProducts.map(p => `• ${p}`).join("\n")}

🚨 STRICT RULES FOR UNCONFIRMED PRODUCT DATA:
1. Treat the above as HINTS only — they may be subcategory labels, not real products.
2. If any item looks like a generic category name (e.g. "Tactical Footwear", "Men's Shoes", "Sports Gear") — treat it as an EMPTY CATEGORY and DO NOT recommend a blog about it.
3. Only recommend a topic if you see at least one SPECIFIC product name (containing a colour, material, model name, or unique identifier).
4. If all items look like category names and none look like specific products — DO NOT recommend any product-specific blog. Instead, recommend a brand-story or educational topic that does not require specific products.`;
    }

    // Nothing found at all
    return `ACTUAL PRODUCTS: NONE CONFIRMED. The store's product catalog could not be scraped.

🚨 ABSOLUTE RULE — NO HALLUCINATION:
- Do NOT invent product names or product types that are not explicitly mentioned in the Brand Audit below.
- Do NOT recommend a topic about any specific product (boots, holsters, goggles, bags, etc.) unless the Brand Audit explicitly names that EXACT product type with clear evidence the brand sells it.
- Read the Brand Audit carefully — only recommend topics about things the brand EXPLICITLY says it sells.
- If the Brand Audit is vague or generic, recommend a brand-awareness or educational topic that does NOT name any specific product. It is better to be generic than to invent wrong products.
- EXAMPLES OF WHAT NOT TO DO: Do not recommend "belly band holsters" for a tactical gear brand unless holsters are explicitly in the Brand Audit. Do not recommend "socks" unless socks are explicitly mentioned.`;
  })();

  // Extract festival names mentioned in the last blog title so we don't repeat them
  const lastBlogTitle = (!isFirstBlog && lastBlog?.title) ? lastBlog.title.toLowerCase() : "";
  const alreadyCoveredFestivals = festivals
    .filter(f => lastBlogTitle.includes(f.name.toLowerCase().split(" ")[0]))
    .map(f => f.name);
  const alreadyCoveredNote = alreadyCoveredFestivals.length > 0
    ? `\nDO NOT REPEAT: The last blog already covered ${alreadyCoveredFestivals.join(", ")}. Do NOT recommend a topic about the same festival. Choose a different angle or festival entirely.`
    : "";

  // Regenerate: hard-exclude the previous topic
  const avoidNote = avoidTopic
    ? `\n⛔ PREVIOUS RECOMMENDATION (ALREADY REJECTED — DO NOT USE AGAIN): "${avoidTopic}"\nYou MUST suggest completely different topics — different product, different angle, different occasion.`
    : "";

  // Full topic history exclusion list (Features 2 + 6)
  const exclusionNote = (topicExclusions && topicExclusions.length > 0)
    ? `\n🚫 TOPICS ALREADY GENERATED FOR THIS BRAND — ALL 8 CANDIDATES MUST BE SUBSTANTIVELY DIFFERENT FROM EVERY ENTRY BELOW:\n${topicExclusions.slice(0, 50).map((t, i) => `${i + 1}. ${t}`).join("\n")}\nSubstantively different means: different content pillar, different product focus, different occasion, different target audience angle. Rephrasing the same idea is NOT acceptable.`
    : "";

  // Occasion lockout (Feature 6)
  const occasionLockNote = (lockedOccasions && lockedOccasions.length > 0)
    ? `\n🔒 OCCASION LOCKOUT: These occasions already have a blog this calendar year — do NOT use them as topic anchors again: ${lockedOccasions.join(", ")}.`
    : "";

  // Pillar rotation (Feature 3)
  const pillarNote = pillarConstraintText
    ? `\n📊 CONTENT PILLAR ROTATION: ${pillarConstraintText}`
    : "";

  return `You are a senior content strategist for Indian D2C brands. Generate 8 DISTINCT candidate blog topics. [ref:${varietySeed}]

TODAY'S DATE: ${todayString}

CRITICAL DATE RULE: Do NOT recommend any festival or moment that falls BEFORE today (${todayString}). Only upcoming festivals are valid.${alreadyCoveredNote}${avoidNote}${exclusionNote}${occasionLockNote}${pillarNote}

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

🚨 BRAND CATEGORY RULE: Every candidate topic MUST match the brand's ACTUAL product category AND confirmed products.
- Bags brand → bags, handbags, clutches, wallets only. NEVER jewellery.
- Jewellery brand → jewellery only. NEVER bags or apparel.
- GOLDEN RULE: If a CONFIRMED PRODUCTS list exists above, every topic MUST be about a product in that list.

DIVERSITY REQUIREMENT FOR THE 8 CANDIDATES:
- Each candidate must use a DIFFERENT content pillar from the others.
- Content pillars: education | occasion_gifting | styling_how_to_wear | care_maintenance | buying_guide | trend_seasonal | use_case_specific | customer_problems
- No two candidates may target the same occasion.
- No candidate may be a rephrasing of another.

INSTRUCTIONS FOR EACH CANDIDATE:
1. Must be a different angle, product focus, or audience from every other candidate AND from the exclusion list above.
2. Ties to an upcoming festival IF relevant — otherwise uses evergreen or trend angle.
3. Serves commercial intent — drives traffic toward the brand's product pages.
4. Has real search demand in India.

Return ONLY a valid JSON object (no markdown, no text outside JSON):
{
  "candidates": [
    {
      "recommendedTopic": "Exact, ready-to-publish blog title — specific, keyword-rich, no brackets",
      "primaryKeyword": "Main SEO keyword phrase (2-5 words, India-relevant)",
      "contentPillar": "One of: education | occasion_gifting | styling_how_to_wear | care_maintenance | buying_guide | trend_seasonal | use_case_specific | customer_problems",
      "occasion": "Festival or occasion name if applicable, otherwise null",
      "commercialIntent": "One sentence: how this drives buyers to products",
      "searchIntent": "2-3 example Google queries this blog answers"
    }
  ],
  "lastBlogReference": {
    "title": "${isFirstBlog ? "No previous blog published" : (lastBlog?.title || "").replace(/"/g, "'")}",
    "publishedAt": "${isFirstBlog ? "N/A" : (lastBlog?.publishedAt || "recent")}",
    "url": "${isFirstBlog ? "" : (lastBlog?.url || "")}"
  },
  "festivalReference": ${festivals.length > 0 ? '{"name": "festival name still upcoming", "date": "date", "significance": "one sentence"} or null' : "null"}
}`;
}

// ─── Route Handler ────────────────────────────────────────────────
export async function POST(req) {
  try {
    const {
      siteUrl, niche, brandAudit, scrapeContext, targetMonth, _salt, avoidTopic,
      topicExclusions, pillarUsage, lastPillar, lockedOccasions,
    } = await req.json();
    if (!siteUrl) {
      return Response.json({ error: "siteUrl is required" }, { status: 400 });
    }

    const resolvedMonth = targetMonth || getCurrentMonthIST();
    const todayIST    = getTodayIST();
    const todayString = getTodayISTString();

    // Filter out festivals that have already passed this month
    const allFestivals = getFestivalsForMonth(resolvedMonth);
    const todayYear    = todayIST.getFullYear();

    const festivals = allFestivals
      .filter(f => isFestivalUpcoming(f.date, resolvedMonth, todayIST, f.name))
      // Enrich generic date strings (e.g. "May (full moon day)") with the actual
      // year-specific date so Gemini and the UI always show the real calendar date.
      .map(f => {
        const yearData = YEAR_SPECIFIC_FESTIVAL_DATES[f.name]?.[todayYear];
        if (yearData) {
          return { ...f, date: `${yearData.month} ${yearData.day}, ${todayYear}` };
        }
        return f;
      });

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

    let productsReliable = false;
    if (productResult.status === "fulfilled" && productResult.value?.products?.length > 0) {
      actualProducts   = productResult.value.products;
      productsReliable = productResult.value.reliable === true;
    }

    // ── Fallback: extract product hints from client scrapeContext ──
    // If server-side scraping found NOTHING, try to extract product mentions
    // from the scrapeContext the client sent (homepage scrape from Step 1).
    // This prevents Gemini from hallucinating product types when scraping fails.
    if (actualProducts.length === 0 && scrapeContext) {
      // Extract H2/H3/mainText from the scrapeContext string
      const mainTextMatch = scrapeContext.match(/Core Content Sample:\s*([\s\S]*)/i);
      const h2Match       = scrapeContext.match(/H2s:\s*(.+)/i);
      const h3Match       = scrapeContext.match(/H3s:\s*(.+)/i);
      const mainText      = mainTextMatch?.[1]?.trim() || "";
      const h2s           = h2Match?.[1]?.trim() || "";
      const h3s           = h3Match?.[1]?.trim() || "";

      // Look for ₹ price anchors in the homepage mainText
      const combined = [mainText, h2s, h3s].join(" ");
      const segments  = combined.split(/(₹[\d,]+)/);
      const fallbackProds = [];
      const seen = new Set();
      for (let i = 0; i + 1 < segments.length; i += 2) {
        const before   = segments[i];
        const priceRaw = segments[i + 1];
        const price    = parseInt(priceRaw.replace(/[^\d]/g, ""), 10);
        if (!price || price < 50) continue;
        const beforeTrimmed = before.trim();
        if (/^[-–]\s*\d+\s*%\s*(?:off|mrp)/i.test(beforeTrimmed) || /\bmrp\s*$/i.test(beforeTrimmed)) continue;
        const words  = before.replace(/\s+/g, " ").trim().split(/\s+/).filter(w => w.length > 1);
        if (words.length < 2) continue;
        const name = words.slice(-8).join(" ").trim();
        if (name.length > 5 && name.length < 100 && !seen.has(name)) {
          seen.add(name);
          fallbackProds.push(`${name} (₹${price.toLocaleString("en-IN")})`);
        }
        if (fallbackProds.length >= 10) break;
      }

      // Also collect category names from H2s/H3s as weak hints
      const categoryHints = [h2s, h3s]
        .join(" | ")
        .split(/\s*\|\s*/)
        .map(s => s.trim())
        .filter(s => s.length > 3 && s.length < 60);

      if (fallbackProds.length > 0) {
        actualProducts   = fallbackProds;
        productsReliable = true; // price-confirmed from homepage
      } else if (categoryHints.length > 0) {
        actualProducts   = categoryHints;
        productsReliable = false; // category names only — medium confidence
      }
    }

    // ── Call Gemini for recommendation ───────────────────────────
    const apiKey = KeyRotator.getKey("gemini");
    if (!apiKey) throw new Error("No Gemini API key available. Please check environment variables.");

    // ── Build pillar constraint text from client-supplied usage data ──
    let pillarConstraintText = "";
    if (lastPillar || (pillarUsage && Object.keys(pillarUsage).length)) {
      const overused = Object.entries(pillarUsage || {})
        .filter(([, c]) => c >= 2).sort(([, a], [, b]) => b - a).map(([p]) => p);
      const lines = [];
      if (lastPillar) lines.push(`Last pillar used: "${lastPillar}" — candidates MUST use a different pillar.`);
      if (overused.length) lines.push(`Overused pillars (avoid): ${overused.join(", ")}.`);
      pillarConstraintText = lines.join(" ");
    }

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
      productsReliable,
      varietySeed: _salt || Math.random().toString(36).substring(2, 9),
      avoidTopic: avoidTopic || "",
      topicExclusions: topicExclusions || [],
      pillarConstraintText,
      lockedOccasions: lockedOccasions || [],
    });

    const rawText = await callGeminiForJSON(prompt, apiKey);

    // ── Parse JSON ───────────────────────────────────────────────
    let parsed;
    try {
      let jsonStr = rawText
        .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
        .replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "")
        .trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      const match = rawText.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("Gemini response was not valid JSON. Please try again.");
      try { parsed = JSON.parse(match[0]); }
      catch { throw new Error("Gemini response was not valid JSON. Please try again."); }
    }

    // ── Stochastic candidate selection (Feature 5) ───────────────
    // Score candidates on pillar rotation, dedup distance from history.
    // Sample from top 3 with score-weighted probability.
    const candidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [parsed];

    function scoreCandidate(c) {
      const pillar     = c.contentPillar || "education";
      const recentUse  = (pillarUsage || {})[pillar] || 0;
      const pillarScore = pillar === lastPillar ? 0 : 1 / (recentUse + 1);

      // Semantic dedup: keyword Jaccard against exclusion list
      const excl = topicExclusions || [];
      const topicWords = s => new Set((s || "").toLowerCase().match(/\b\w{4,}\b/g) || []);
      const cWords = topicWords(c.recommendedTopic);
      let maxSim = 0;
      for (const ex of excl) {
        const eWords = topicWords(ex);
        const inter = [...cWords].filter(w => eWords.has(w)).length;
        const union = new Set([...cWords, ...eWords]).size;
        const sim = union > 0 ? inter / union : 0;
        if (sim > maxSim) maxSim = sim;
      }
      const dedupScore = Math.max(0, 1 - maxSim * 2); // 0 when Jaccard ≥ 0.5

      // Occasion lockout penalty
      const occasion = (c.occasion || "").toLowerCase();
      const locked   = (lockedOccasions || []).map(o => o.toLowerCase());
      const occasionPenalty = locked.some(o => occasion.includes(o)) ? 0 : 1;

      return (pillarScore * 0.5 + dedupScore * 0.4 + occasionPenalty * 0.1);
    }

    const scored = candidates
      .map(c => ({ candidate: c, score: scoreCandidate(c) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    if (!scored.length) throw new Error("All candidates were too similar to previous topics. Please try again.");

    // Weighted random sample from top 3
    const pool   = scored.slice(0, 3);
    const total  = pool.reduce((s, { score }) => s + score, 0);
    let rand     = Math.random() * total;
    let selected = pool[0].candidate;
    for (const { candidate, score } of pool) {
      rand -= score;
      if (rand <= 0) { selected = candidate; break; }
    }

    const recommendation = {
      recommendedTopic: selected.recommendedTopic,
      primaryKeyword  : selected.primaryKeyword,
      contentPillar   : selected.contentPillar   || "education",
      occasion        : selected.occasion         || null,
      reasoning       : {
        commercialIntent : selected.commercialIntent || "",
        searchIntent     : selected.searchIntent     || "",
        festivalAngle    : parsed.festivalReference
          ? `${parsed.festivalReference.name} — ${parsed.festivalReference.significance}`
          : "No festival angle — evergreen or trend-based content",
        continuityFromLastBlog: isFirstBlog
          ? "First blog for this brand."
          : `Follows "${lastBlog?.title || "previous blog"}"`,
      },
      lastBlogReference: parsed.lastBlogReference || {},
      festivalReference: parsed.festivalReference || null,
      verdict          : `Selected from ${scored.length} candidates (rank ${pool.indexOf(pool.find(p => p.candidate === selected)) + 1} of top 3).`,
      // Diversity metadata for quality report
      _meta: {
        candidatesConsidered : candidates.length,
        candidatesScored     : scored.length,
        selectedRank         : pool.indexOf(pool.find(p => p.candidate === selected)) + 1,
        maxSimilarityRejected: scored[scored.length - 1]?.score < 0.1 ? "yes" : "no",
        pillarUsed           : selected.contentPillar,
        pillarRotationScore  : pool.find(p => p.candidate === selected)?.score?.toFixed(3),
      },
    };

    return Response.json(
      {
        recommendation,
        lastBlog: isFirstBlog ? null : lastBlog,
        festival: festivals,
        isFirstBlog,
        targetMonth: resolvedMonth,
      },
      { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } }
    );
  } catch (err) {
    console.error("[topic-recommend] Error:", err.message);
    return Response.json({ error: err.message || "Failed to generate recommendation" }, { status: 500 });
  }
}
