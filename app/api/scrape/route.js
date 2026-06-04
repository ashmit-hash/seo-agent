import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function POST(req) {
  try {
    const { url } = await req.json();
    if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 });

    let finalUrl = url;
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = 'https://' + finalUrl;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(finalUrl, {
      signal: controller.signal,
      cache: 'no-store',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Expires': '0'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) return NextResponse.json({ error: `Failed to fetch url: ${response.status} ${response.statusText}` }, { status: response.status });

    const html = await response.text();
    const $ = cheerio.load(html);

    // ── Extract announcement bar / promotional claims BEFORE removing elements ──
    // These contain key selling points (Free Shipping, COD, etc.) that must
    // appear correctly in the blog FAQ — never contradicted.
    const announcementSelectors = [
      '[class*="announcement"]', '[class*="banner"]', '[class*="notice"]',
      '[class*="promo"]', '[class*="topbar"]', '[class*="top-bar"]',
      '[id*="announcement"]', '[id*="banner"]', '[id*="promo"]',
    ];
    const announcementTexts = [];
    for (const sel of announcementSelectors) {
      $(sel).each((_, el) => {
        const text = $(el).text().replace(/\s+/g, ' ').trim();
        if (text.length > 5 && text.length < 300) announcementTexts.push(text);
      });
    }
    // Also capture the first <header> text if it contains policy keywords
    const headerText = $('header').text().replace(/\s+/g, ' ').trim();
    if (/free\s*(shipping|delivery)|cod|cash\s*on\s*delivery|free\s*return/i.test(headerText)) {
      const match = headerText.match(/[^.!?]*(?:free\s*(?:shipping|delivery)|cod|cash\s*on\s*delivery|free\s*return)[^.!?]*/gi) || [];
      announcementTexts.push(...match.map(m => m.trim()));
    }
    const policyHighlights = [...new Set(announcementTexts)].join(' | ').slice(0, 300);

    // Remove noisy elements to isolate purely semantic content
    $('script[src], style, noscript, svg, iframe, nav, footer, header, aside').remove();

    const title = $('title').text().trim() || $('meta[property="og:title"]').attr('content')?.trim() || '';
    const description = $('meta[name="description"]').attr('content')?.trim() || $('meta[property="og:description"]').attr('content')?.trim() || '';

    const h1 = $('h1').first().text().trim() || '';
    const h2s = $('h2').map((i, el) => $(el).text().trim()).get().filter(Boolean).slice(0, 5).join(' | ');
    const h3s = $('h3').map((i, el) => $(el).text().trim()).get().filter(Boolean).slice(0, 5).join(' | ');

    // Intelligently extract actual main content
    let mainText = $('main').text().replace(/\s+/g, ' ').trim();
    if (!mainText || mainText.length < 50) mainText = $('article').text().replace(/\s+/g, ' ').trim();
    if (!mainText || mainText.length < 50) {
      mainText = $('p').map((i, el) => $(el).text().trim()).get().filter(p => p.length > 30).slice(0, 6).join(' ');
    }
    mainText = mainText.slice(0, 1500) + (mainText.length > 1500 ? '...' : '');

    const robots = $('meta[name="robots"]').attr('content') || 'index, follow';
    const canonical = $('link[rel="canonical"]').attr('href') || '';

    // ── Product extraction ─────────────────────────────────────────
    // Returns structured { name, price } array — works for Alippo (Next.js),
    // Shopify, WooCommerce, and any site with JSON-LD product schema.
    const products = [];

    // ── Method 1: Next.js __NEXT_DATA__ (Alippo and all Next.js stores) ──
    // Next.js embeds ALL server-side props as JSON in this script tag — even
    // before any JavaScript runs. This is the most reliable source for Alippo.
    const rawNextData = $('script#__NEXT_DATA__').html();
    if (rawNextData) {
      try {
        const nextData = JSON.parse(rawNextData);
        const pageProps = nextData?.props?.pageProps ?? {};

        // Walk common locations where Alippo / Next.js stores put product arrays
        const candidates = [
          pageProps.products,
          pageProps.data?.products,
          pageProps.categoryData?.products,
          pageProps.collectionData?.products,
          pageProps.items,
          pageProps.initialProducts,
          pageProps.productList,
          pageProps.catalog,
          nextData?.props?.initialState?.products,
          nextData?.props?.initialState?.catalog,
        ];

        for (const arr of candidates) {
          if (Array.isArray(arr) && arr.length > 0) {
            arr.slice(0, 30).forEach(p => {
              // Try every common field name Alippo / other platforms use
              const name =
                p.title || p.name || p.productName || p.product_name ||
                p.displayName || p.heading || '';
              const rawPrice =
                p.price ?? p.sellingPrice ?? p.selling_price ??
                p.mrp ?? p.salePrice ?? p.sale_price ??
                p.variants?.[0]?.price ?? p.variant?.price ?? '';
              const price = parseFloat(String(rawPrice).replace(/[^0-9.]/g, '')) || null;
              if (name && name.length > 1 && name.length < 150) {
                products.push({ name: name.trim(), price });
              }
            });
            if (products.length > 0) break; // found products — stop searching
          }
        }
      } catch { /* malformed JSON — skip */ }
    }

    // ── Method 2: JSON-LD Product / ItemList schema ───────────────
    if (products.length === 0) {
      $('script[type="application/ld+json"]').each((_, el) => {
        try {
          const json = JSON.parse($(el).html() || '{}');
          const items = Array.isArray(json) ? json : [json];
          for (const item of items) {
            if (item['@type'] === 'Product' && item.name) {
              const price = parseFloat(item.offers?.price || item.offers?.[0]?.price || '0') || null;
              products.push({ name: item.name, price });
            }
            if (item['@type'] === 'ItemList' && Array.isArray(item.itemListElement)) {
              item.itemListElement.forEach(e => {
                const name = e.name || e.item?.name;
                if (name) {
                  const price = parseFloat(e.item?.offers?.price || '0') || null;
                  products.push({ name, price });
                }
              });
            }
          }
        } catch { /* skip malformed */ }
      });
    }

    // ── Method 3: HTML price elements + nearby heading (generic fallback) ──
    if (products.length === 0) {
      $('[class*="price"], .price, .amount, [data-price]').each((_, el) => {
        if (products.length >= 20) return;
        const priceText = $(el).text().trim();
        if (!/(?:₹|Rs\.?|\b\d{3,}\b)/.test(priceText)) return;
        const price = parseFloat(priceText.replace(/[^0-9.]/g, '')) || null;
        const card = $(el).closest('[class*="product"], [class*="card"], [class*="item"], article, li');
        const name = card.find('h1,h2,h3,h4,[class*="title"],[class*="name"]').first().text().trim();
        if (name && name.length > 2 && name.length < 120 && price) {
          products.push({ name, price });
        }
      });
    }

    // ── Method 4: Alippo App Router — price-anchor text extraction ───────────
    // Alippo uses Next.js App Router (no __NEXT_DATA__). Products and prices are
    // rendered as plain text. We split by ₹ price markers and extract product
    // names from the text immediately before each price.
    if (products.length === 0) {
      const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
      const segments = bodyText.split(/(₹[\d,]+)/);
      const seen = new Set();
      for (let i = 0; i + 1 < segments.length; i += 2) {
        const before   = segments[i];
        const priceRaw = segments[i + 1];
        const price    = parseInt(priceRaw.replace(/[^\d]/g, ''), 10);
        if (!price || price < 50) continue;
        // Skip MRP prices — they come right after a "-38%MRP" separator text.
        // Check the CURRENT `before` segment (not the next one).
        const beforeTrimmed = before.trim();
        const isMrpEntry =
          /^[-–]\s*\d+\s*%\s*(?:off|mrp)/i.test(beforeTrimmed) ||
          /\bmrp\s*$/i.test(beforeTrimmed);
        if (isMrpEntry) continue;

        let nameSrc = before
          .replace(/\(\s*Pack of \d+\s*\)/gi, '')
          .replace(/\d+\s*Options?/gi, '')
          .replace(/\s*-\s*\d+\s*%\s*(?:OFF|MRP)?\s*$/i, '')
          .replace(/\b(Filters?|Sort\s+By|Categories|Home|Shop|New|Sale|Explore\s+All|Bestsellers?|Trending|Featured|Free\s+Shipping|Cash\s+On\s+Delivery|Ships?\s+\w+)\b/gi, ' ')
          .replace(/[^\w\s\-–:.'&()/]/g, ' ')
          .replace(/\s+/g, ' ').trim();

        // Strip nav preamble: split by sentence boundaries, take last sentence
        const sentences = nameSrc.split(/\.+/).map(s => s.trim()).filter(Boolean);
        if (sentences.length > 1) nameSrc = sentences[sentences.length - 1];
        // Strip trailing lone digits (e.g. "4" from "Pack of 30)4")
        nameSrc = nameSrc.replace(/\s+\d{1,2}\s*$/, '').trim();

        const words = nameSrc.split(/\s+/).filter(w => w.length > 0);
        if (words.length < 2) continue;
        const productName = words.slice(-10).join(' ').trim();
        if (productName.length < 5 || productName.length > 120) continue;
        if (/^(HOME|SHOP|ABOUT|CONTACT|FILTER|SORT|CATEGOR|MRP|NEW|SALE|ALL|EXPLORE|BESTSELL|FEATURE|LEGAL|PRIVACY|RETURN|BULK)/i.test(productName)) continue;

        // ── Reject blog/article titles mis-parsed as products ────
        if (/^\d+\s+(best|top|healthy|great|amazing|essential|simple|easy|quick|ways|tips|things|reasons|ideas|types|kinds)/i.test(productName)) continue;
        if (/\b(for kids|for children|for toddlers|for babies|for adults|for families|for everyone)\b/i.test(productName)) continue;
        if (words.length > 8) continue;
        if (/\b(summer snacks|winter snacks|healthy snacks|best snacks|top picks|must have|you need|you should|we recommend)\b/i.test(productName)) continue;
        // ── Reject promotional banner / announcement bar text ────
        // Pattern: pipe character indicates header/banner text ("Brand | Free Delivery")
        if (productName.includes('|')) continue;
        // Pattern: delivery/offer promotional text
        if (/free delivery|orders above|get free|use code|off on|discount|cashback|free shipping/i.test(productName)) continue;
        // Pattern: exclamation mark indicates banner/marketing text, not a product name
        if (productName.includes('!')) continue;
        // Pattern: contains "trusted" + generic word (announcement bar pattern)
        if (/trusted snacks|real ingredients|family.trusted|quality guaranteed/i.test(productName)) continue;

        if (!seen.has(productName)) {
          seen.add(productName);
          products.push({ name: productName, price });
        }
        if (products.length >= 25) break;
      }
    }

    return NextResponse.json({
      title,
      description,
      h1,
      h2s,
      h3s,
      mainText,
      robots,
      canonical,
      policyHighlights, // free shipping / COD / return policy from announcement bars
      products: products.slice(0, 30), // cap at 30
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
