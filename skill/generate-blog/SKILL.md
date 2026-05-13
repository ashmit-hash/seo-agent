---
name: generate-blog
description: >
  Generates a complete, SEO-optimized, publication-ready blog post for any Indian D2C brand website.
  Use this skill whenever the user says anything like: "generate a blog", "write a blog post for my website",
  "create an SEO blog", "write content for [URL]", "blog banao", "make a blog post", "write a blog about [topic]",
  or provides a website URL and asks for content/article/post.
  Also trigger when user says "run the SEO agent", "use the blog tool", or "analyse my website and write a blog".
  This skill scrapes the live website, detects the brand's niche and price range, picks the right topic,
  does keyword research, and writes a full blog with real product names and correct prices.
  Always use this skill — never just write a blog from scratch without following this workflow.
---

# Blog Generator — SEO Agent Workflow

You are generating a complete SEO-optimized blog post by following the same 6-step workflow as the SEO Agent tool.
Work through each step sequentially. Show your progress as you go — the user should see each step completing.

---

## What to Collect First

Before starting, make sure you have:
- ✅ **Website URL** — required. If missing, ask: "What is your website URL?"
- ⬜ **Blog Topic** — optional. If not given, you will generate and suggest topics.
- ⬜ **Brand Context** — optional. Category, products, audience. If not given, extract from scrape.

---

## STEP 1 — Scrape the Website

Call the scrape API:

```
POST https://seo-agent-app-kappa.vercel.app/api/scrape
Content-Type: application/json
Body: { "url": "<WEBSITE_URL>" }
```

From the response, extract:
- `title` — page title
- `description` — meta description
- `h1` — main heading
- `h2s` — section headings / product categories
- `mainText` — homepage body text (first 1500 chars)

**Extract Price Range:**
Scan `mainText` for any ₹ prices (e.g. ₹299, ₹500, ₹1200).
Find the minimum and maximum numeric values.

> Write this down: `PRICE RANGE: ₹[min] – ₹[max] (MAX: ₹[max])`

If no ₹ prices are found, ask the user:
> "What is the rough price range of your products? (e.g. ₹200–₹800)"

**Detect Niche:**
Based on scraped text, identify the exact industry:
- Artificial / fashion / imitation jewellery
- Real jewellery (gold, silver, diamond)
- Clothing / sarees / ethnic wear
- Home decor / candles / gifts
- Food / snacks / tiffin delivery
- Skincare / beauty / cosmetics
- Kids / baby products
- SaaS / software
- Other (specify clearly)

Tell the user:
> "✅ Website scraped. Niche detected: **[niche]**. Price Range: **₹[min]–₹[max]**"

---

## STEP 2 — Pick the Blog Topic

**If the user already gave a topic:** Use it. Confirm:
> "Got it — writing about: **[topic]**"

**If no topic given:** Based on the niche and current month, suggest 5 topics:

```
Here are 5 topic ideas for [Month]:

1. [Specific title — e.g. "7 Oxidised Bangles Under ₹500 for Raksha Bandhan"]
2. [Another topic]
3. [Another topic]
4. [Another topic]
5. [Another topic]

Which one would you like? Type 1–5 or suggest your own.
```

Wait for the user's choice. Then confirm:
> "✅ Topic selected: **[topic]**"

**Topic rules:**
- Match the brand's exact niche — never suggest jewellery topics for a food brand
- Include a number if it's a listicle ("7 Tips", "5 Products")
- Use seasonal / festival hooks relevant to the current month
- Keep prices in topic titles within the brand's actual range

---

## STEP 3 — Build the Website Context Block

Assemble this context block before writing:

```
PRICE RANGE OF THIS BRAND: ₹[min] – ₹[max] (MAX ₹[max]).
DO NOT use any price examples above ₹[max] in the blog.

Brand Website: [URL]
Page Title: [scraped title]
Description: [scraped description]
Main Heading (H1): [scraped h1]
Product Categories (H2s): [scraped h2s]
Homepage Content Sample: [first 400 chars of mainText]
```

Then detect the **Content Type** from the topic:

| Topic contains | Content Type |
|----------------|-------------|
| "best", "top", "under ₹", number + products | Buying Guide |
| "how to", "why", "what is", "guide" | Educational |
| "gift", "gifting", "present" | Gift Guide |
| "style", "wear", "outfit", "pair" | Styling Tips |
| "care", "clean", "maintain", "store" | Product Care |
| Festival name (Diwali, Raksha Bandhan, Eid) | Gift Guide / Festival Buying Guide |

---

## STEP 4 — Write the Blog

Call the SEO Agent AI:

```
POST https://seo-agent-app-kappa.vercel.app/api/seo
Content-Type: application/json

Body:
{
  "messages": [{
    "role": "user",
    "content": "[FULL BLOG PROMPT — built below]"
  }],
  "systemPrompt": "You are a world-class content writer for Indian D2C brands. Write simple, clear, friendly blogs for Indian readers on mobile. Every paragraph must have 4-5 connected sentences — never one sentence per line. Use ₹ prices, Indian festivals, and relatable Indian examples. Never write 'In today's world' or 'In conclusion'. Never use prices above the brand's stated maximum.",
  "maxTokens": 8000,
  "provider": "gemini"
}
```

**Build the FULL BLOG PROMPT using this template:**

```
Write a complete blog post for this brand's website.

---
WEBSITE CONTEXT:
[paste the full context block from Step 3]
---

TOPIC: "[chosen topic]"
CONTENT TYPE: [detected content type]

WRITING RULES:
1. Start directly with the H1 title (the topic itself — no preamble)
2. Every H2 heading must be a real descriptive title specific to this topic
   — NEVER use generic labels like "Introduction", "Hook", "Conclusion", "The Problem"
   — RIGHT example: "## Why Oxidised Silver Bangles Are Perfect for Daily Wear"
   — WRONG example: "## Introduction"
3. Every paragraph must have 4-5 sentences written as connected flowing prose
   — NEVER write one sentence per line
4. Mention real product names or categories from this brand naturally inside the blog
5. PRICE LOCK — CRITICAL: Every price example must be under ₹[max price from context]
   Never write price brackets above the brand's maximum
6. If the topic contains a number (e.g. "7 bangles"), write exactly that many items,
   each as its own dedicated H2 section with a full paragraph
7. Include a FAQ section with 3-4 genuine questions before closing
8. End with a soft CTA paragraph (do not write "In conclusion")
9. Total length: 800–1100 words. No filler. Every sentence must earn its place.
10. Simple English — max 14 words per sentence — Class 8 reading level
11. Add at least 2 of these naturally:
    "Most people don't know this…"
    "This is where many buyers go wrong…"
    "Here's the honest answer…"

Write the complete blog now. Do not stop until the final CTA line is written.
```

Tell the user: "✅ Writing your blog now..." then call the API.

---

## STEP 5 — Present the Output

Once the API responds, present everything clearly:

---

### 📝 YOUR BLOG POST

[Full blog text — exactly as returned]

---

### 📊 SEO QUICK PACK

| Field | Value |
|-------|-------|
| **Meta Title** | [max 60 chars — primary keyword in first 3 words] |
| **Meta Description** | [max 155 chars — includes keyword + soft CTA] |
| **URL Slug** | [hyphenated, keyword-first — e.g. `oxidised-bangles-under-500-raksha-bandhan`] |
| **Primary Keyword** | [main search term this blog targets] |
| **Content Type** | [Buying Guide / Educational / Gift Guide / etc.] |
| **Word Count** | [approximate] |

---

### ✅ PUBLISH CHECKLIST

- [ ] Paste the blog into Shopify / WordPress blog editor
- [ ] Add the meta title and description in your SEO settings
- [ ] Set the URL to the slug above
- [ ] Upload 2–3 product images — use the primary keyword in image filenames
- [ ] Submit the URL to Google Search Console after publishing

---

## STEP 6 — Revision Loop

After showing the blog, ask:
> "Happy with this blog? Type **approve** to get the final copy, or tell me what to change."

**If user types `approve`:** Say:
> "✅ Your blog is ready to publish! Copy the text above and paste it into your blog editor."

**If user requests changes**, revise accordingly:

| Request | What to do |
|---------|-----------|
| "Make it shorter" | Cut to 700–800 words, remove thin sections |
| "Make it simpler" | Shorter sentences, simpler vocabulary |
| "Add more products" | Weave in more product names from scraped data |
| "Change the prices" | Adjust price examples — stay within brand's max |
| "Different tone" | More friendly / more professional — adjust voice |
| "Add more examples" | Add Indian festival or relatable daily-life examples |

After revising, show the updated blog and ask for approval again.

---

## Rules That Must Never Break

### 🔒 Price Lock
- Always check the brand's max price before writing any ₹ amount
- A brand with max ₹800 must NEVER have ₹2,000 or ₹5,000 examples
- This rule applies in revision too — if the user asks to add prices, stay within range

### 🔒 Niche Lock
- Saree brand → write about sarees
- Food brand → write about food
- Candle brand → write about candles
- If ever unsure, re-read the scraped Title and H1 — they tell you exactly what the brand sells

### ✅ Quality Checklist (check before every output)
- [ ] Every paragraph has 4+ connected sentences?
- [ ] All prices are within the brand's actual range?
- [ ] H2 headings are real descriptive titles — not generic labels?
- [ ] Word count is 800–1100?
- [ ] Blog ends with a complete CTA paragraph?
- [ ] FAQ section with 3–4 questions is present?

---

## Example Conversation

**User:** "Generate a blog for https://silverjewel.in"

**You (Step 1):** Calls scrape API → detects: Niche = artificial silver jewellery, Price Range = ₹150–₹699
> "✅ Website scraped. Niche: Artificial silver jewellery. Price Range: ₹150–₹699"

**You (Step 2):** Suggests 5 topics → user picks topic 2

**You (Step 4):** Calls /api/seo → writes blog with prices under ₹699, mentions real products

**You (Step 5):** Shows full blog + SEO Quick Pack

**You (Step 6):** "Happy with this blog? Type approve or tell me what to change."

**User:** "Make it a bit shorter"

**You:** Revises blog to ~750 words → shows again → "Happy now? Type approve."

**User:** "approve"

**You:** "✅ Ready to publish! Copy the text above."
