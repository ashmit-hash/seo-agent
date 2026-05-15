export const runtime = "nodejs";

import * as cheerio from "cheerio";
import { KeyRotator } from "@/lib/keys";
import { getFestivalsForMonth, getCurrentMonthIST } from "@/lib/festivalCalendar";

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

// ─── Method C: Blog Index Page scrape ────────────────────────────
async function tryBlogIndex(siteUrl) {
  const blogIndexPaths = ["/blogs", "/blog", "/journal", "/stories", "/articles", "/news"];
  const blogPathMarkers = ["/blog/", "/blogs/", "/journal/", "/stories/", "/article/", "/post/"];

  for (const indexPath of blogIndexPaths) {
    try {
      const indexUrl = `${siteUrl.replace(/\/$/, "")}${indexPath}`;
      const res = await fetch(indexUrl, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);
      $("script, style, noscript, nav, footer").remove();

      // Find blog post links
      const links = [];
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href") || "";
        if (blogPathMarkers.some(p => href.includes(p)) && href !== indexPath && href !== indexPath + "/") {
          const fullUrl = href.startsWith("http") ? href : `${siteUrl.replace(/\/$/, "")}${href}`;
          const titleEl = $(el).find("h2, h3, h4").first();
          const title = titleEl.text().trim() || $(el).text().trim().slice(0, 150);
          if (title.length > 3 && !links.find(l => l.url === fullUrl)) {
            links.push({ url: fullUrl, title });
          }
        }
      });

      if (links.length > 0) {
        const first = links[0];
        return {
          method: "blog-index",
          title: first.title,
          url: first.url,
          publishedAt: null,
          summary: "",
        };
      }
    } catch { /* try next */ }
  }
  return null;
}

// ─── Master Blog Detector ─────────────────────────────────────────
async function detectLastBlog(siteUrl) {
  let domain = siteUrl;
  try { domain = new URL(siteUrl).hostname; } catch { /* use as-is */ }

  // Method A: PayloadCMS
  const payloadResult = await tryPayloadCMS(domain);
  if (payloadResult) return payloadResult;

  // Method B: Sitemap
  const sitemapResult = await trySitemap(siteUrl);
  if (sitemapResult) return sitemapResult;

  // Method C: Blog index
  const indexResult = await tryBlogIndex(siteUrl);
  if (indexResult) return indexResult;

  // Method D: No blog found
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


// ─── Build Recommendation Prompt ─────────────────────────────────
function buildPrompt({ siteUrl, niche, brandAudit, lastBlog, isFirstBlog, festivals, targetMonth }) {
  const lastBlogSection = isFirstBlog
    ? `LAST PUBLISHED BLOG: None found — this appears to be a new store or a brand that has not started blogging yet. Base recommendation on niche + festival only.`
    : `LAST PUBLISHED BLOG:
Title: "${lastBlog.title}"
URL: ${lastBlog.url}
Published: ${lastBlog.publishedAt || "recently"}
Summary: ${lastBlog.summary || "(no summary available — infer from title)"}`;

  const festivalSection =
    festivals.length > 0
      ? `UPCOMING FESTIVALS / MOMENTS IN ${targetMonth.toUpperCase()}:
${festivals.map(f => `- ${f.name} (${f.date})
  Significance: ${f.significance}
  D2C content angles: ${f.d2cAngles.join(" | ")}`).join("\n\n")}`
      : `FESTIVALS IN ${targetMonth.toUpperCase()}: No major Indian festivals in this month. Base recommendation on niche + evergreen commercial intent.`;

  const auditSnippet = (brandAudit || "").slice(0, 600);

  return `You are a senior content strategist for Indian D2C brands. Your task: recommend ONE blog topic.

---
BRAND:
- Website: ${siteUrl}
- Niche / Category: ${niche}
- Brand Audit Highlights: ${auditSnippet || "(not available)"}

${lastBlogSection}

${festivalSection}

TARGET PUBLISH MONTH: ${targetMonth}
---

INSTRUCTIONS:
Recommend exactly ONE blog topic that:
1. Builds on or naturally complements the last blog (different angle, not a rehash) — or is the best first post if no blog exists
2. Ties to a festival or commercial moment in ${targetMonth} IF that festival is relevant to this niche (skip if not relevant)
3. Serves commercial intent — drives traffic toward the brand's product/collection pages
4. Has real search demand in India (the kind of query a real person types into Google)

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation outside the JSON):
{
  "recommendedTopic": "The exact, ready-to-publish blog title — specific, keyword-rich, no brackets",
  "primaryKeyword": "The main SEO keyword phrase people search for (2-5 words, India-relevant)",
  "reasoning": {
    "continuityFromLastBlog": "Why this is the right follow-up to the last blog, or why it is the ideal first post",
    "festivalAngle": "Which festival this ties to and exactly how it connects to the niche — or 'No festival angle this month — recommendation is based on niche and commercial evergreen intent'",
    "commercialIntent": "How this specific blog drives buyers to the brand's products or collections — be concrete",
    "searchIntent": "What Indian users are typing into Google that this blog answers — include 2-3 example search queries"
  },
  "lastBlogReference": {
    "title": "${isFirstBlog ? "No previous blog published" : (lastBlog?.title || "").replace(/"/g, "'")}",
    "publishedAt": "${isFirstBlog ? "N/A" : (lastBlog?.publishedAt || "recent")}",
    "url": "${isFirstBlog ? "" : (lastBlog?.url || "")}"
  },
  "festivalReference": ${festivals.length > 0 ? '{"name": "festival name that this ties to", "date": "date of festival", "significance": "one sentence on why this festival is relevant to this niche"}' : "null"},
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
    const festivals = getFestivalsForMonth(resolvedMonth);

    // ── Detect last blog (non-fatal — fallback to isFirstBlog) ───
    let lastBlog = null;
    let isFirstBlog = false;
    try {
      const detected = await detectLastBlog(siteUrl);
      if (detected.isFirstBlog) {
        isFirstBlog = true;
      } else {
        lastBlog = detected;
      }
    } catch {
      isFirstBlog = true; // graceful fallback
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
