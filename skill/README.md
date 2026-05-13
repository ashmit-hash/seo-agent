# SEO Agent — Claude Skill

This folder contains the **generate-blog** Claude skill.

Once installed, anyone on your team can type `generate a blog for https://yourstore.com` directly inside Claude and get a complete, SEO-optimized blog post — without opening the web app.

---

## What the Skill Does

1. Scrapes your live website (detects niche, price range, products)
2. Suggests 5 blog topics — you pick one
3. Writes a full 800–1100 word blog using your actual products and real prices
4. Gives you the SEO Quick Pack (meta title, description, URL slug)
5. Lets you approve or request changes before finalizing

---

## How to Install (one-time setup per computer)

### Step 1 — Find your Claude skills folder

| OS | Path |
|----|------|
| **Windows** | `C:\Users\YOUR_NAME\AppData\Roaming\Claude\local-agent-mode-sessions\skills-plugin\` |
| **Mac** | `~/Library/Application Support/Claude/skills/` |
| **Linux** | `~/.config/Claude/skills/` |

> On Windows, the `AppData` folder is hidden. In File Explorer, paste the path directly into the address bar.

### Step 2 — Copy the skill folder

Copy the entire `generate-blog` folder from this repo into your Claude skills folder.

Your skills folder should look like this after copying:

```
skills/
├── generate-blog/        ← paste this folder here
│   └── SKILL.md
├── skill-creator/        ← already there
├── pdf/                  ← already there
└── ...other skills
```

### Step 3 — Restart Claude

Close and reopen Claude Code (or Claude desktop app).

### Step 4 — Test it

In a new Claude chat, type:

```
generate a blog for https://yourwebsite.com
```

Claude will automatically detect the skill and start the workflow.

---

## How to Use (daily)

### Basic — let Claude pick the topic
```
generate a blog for https://yourstore.com
```

### With a specific topic
```
write a blog about "7 Oxidised Bangles Under ₹500 for Raksha Bandhan" for https://yourstore.com
```

### With brand context
```
generate a blog for https://yourstore.com
Category: Artificial jewellery
Products: Oxidised bangles, kundan earrings, meenakari sets
Audience: Women 20-35, budget-conscious
```

### Other trigger phrases that work
```
write a blog post for my website: yourstore.com
create an SEO blog for my store
blog banao for https://yourstore.com
analyse my website and write a blog
```

---

## What You Get

### 📝 Blog Post
- 800–1,100 words
- Proper H2 headings (not generic labels)
- 4–5 sentence paragraphs (no poem-style lines)
- FAQ section with 3–4 real questions
- Soft CTA closing paragraph
- Your actual products mentioned by name
- Prices always within your brand's real range

### 📊 SEO Quick Pack
- Meta title (60 chars)
- Meta description (155 chars)
- URL slug (SEO-friendly)
- Primary keyword

### ✅ Publish Checklist
Step-by-step instructions for publishing on Shopify or WordPress

---

## Revision

After Claude shows the blog, you can:

- Type `approve` → get the final copy
- Type what to change → Claude revises and shows again

Examples:
```
make it shorter
add more product examples
use a friendlier tone
change the prices to be under ₹300
```

---

## Requirements

- Claude Code or Claude desktop app installed
- Internet connection (the skill calls the live SEO Agent API)
- No API keys needed — the skill uses the deployed SEO Agent at `https://seo-agent-app-kappa.vercel.app`

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Skill not triggering | Restart Claude, check the folder is named exactly `generate-blog` |
| API error on scrape | Check your internet connection; try again |
| Wrong niche detected | Add brand context manually in your message |
| Prices still too high | Tell Claude: "Max price is ₹X — fix all prices in the blog" |
| Blog feels generic | Add more context: list your actual product names in the message |

---

## Team Setup

Each team member needs to:
1. Install Claude Code on their computer
2. Copy the `generate-blog` folder to their Claude skills directory (path above)
3. Restart Claude

That's it. One skill file, works for everyone.
