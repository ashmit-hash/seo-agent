import React from "react";
import { TrendingUp, Users, Lightbulb, AlertCircle, Calendar, Crosshair } from "lucide-react";

// ─── Parser ───────────────────────────────────────────────────────
function parseCompetitorData(text) {
  if (!text) return { categories: [], summary: null };

  // Split into sections on "## N." headings
  const sectionRegex = /(?=^## \d+\.)/m;
  const parts = text.split(sectionRegex).map(p => p.trim()).filter(Boolean);

  const categories = [];
  let summary = null;

  for (const part of parts) {
    // Summary block
    if (/^## SEASONAL INTELLIGENCE SUMMARY/i.test(part)) {
      summary = parseSummary(part);
      continue;
    }

    // Category block: ## 1. Category Name (TRAFFIC TYPE)
    const headerMatch = part.match(/^## \d+\.\s+(.+?)(?:\s*\(([^)]+)\))?\s*\n/);
    if (!headerMatch) continue;

    const categoryName = headerMatch[1].trim();
    const trafficType  = headerMatch[2]?.trim() || "";

    // Competitors line
    const compMatch = part.match(/\*\*Competitors?:\*\*\s*(.+)/i);
    const competitors = compMatch
      ? compMatch[1].split(/,\s*/).map(s => s.replace(/\*\*/g, "").trim()).filter(Boolean)
      : [];

    // "What they post" OR "What they are doing" bullet section
    const postMatch = part.match(
      /\*\*(?:What they (?:post|are doing|do|wrote|published)):\*\*\n([\s\S]*?)(?=\n\*\*|\n---|\n## |$)/i
    );
    const postItems = postMatch
      ? extractQuotedItems(postMatch[1])
      : [];

    // "These blogs are" OR "Why it works" bullet section
    const whyMatch = part.match(
      /\*\*(?:These blogs are|Why it works|What makes this work|Why this works):\*\*\n([\s\S]*?)(?=\n\*\*|\n---|\n## |$)/i
    );
    const whyItems = whyMatch
      ? extractBulletItems(whyMatch[1])
      : [];

    // Example insight line
    const insightMatch = part.match(/\*\*Example insight:\*\*\s*(.+)/i);
    const insight = insightMatch ? insightMatch[1].replace(/\*\*/g, "").trim() : "";

    categories.push({ categoryName, trafficType, competitors, postItems, whyItems, insight });
  }

  return { categories, summary };
}

function extractQuotedItems(block) {
  const results = [];
  const lines = block.split("\n");
  for (const line of lines) {
    // Match lines like: - "Title here"
    const q = line.match(/[-*]\s+["""''](.+?)["""'']/);
    if (q) { results.push(q[1].trim()); continue; }
    // Also match lines without quotes: - Title here
    const b = line.match(/^[\s]*[-*]\s+(.{8,})/);
    if (b && !b[1].startsWith("*")) results.push(b[1].trim());
  }
  return results.filter(Boolean);
}

function extractBulletItems(block) {
  return block
    .split("\n")
    .map(l => {
      const m = l.match(/^[\s]*[-*]\s+(.+)/);
      return m ? m[1].replace(/\*\*/g, "").trim() : null;
    })
    .filter(Boolean);
}

function parseSummary(block) {
  const field = (label) => {
    const m = block.match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`, "i"));
    return m ? m[1].replace(/\*\*/g, "").trim() : "";
  };
  return {
    primary:   field("Primary Festival/Season Window"),
    secondary: field("Secondary Window"),
    deadline:  field("Publishing Deadline"),
    untapped:  field("The Untapped Angle"),
  };
}

// ─── Traffic badge colour ──────────────────────────────────────────
function trafficStyle(type) {
  const t = (type || "").toLowerCase();
  if (t.includes("high"))       return { bg: "#fff1f2", border: "#fda4af", text: "#9f1239" };
  if (t.includes("discovery"))  return { bg: "#eff6ff", border: "#93c5fd", text: "#1e40af" };
  if (t.includes("conversion")) return { bg: "#f0fdf4", border: "#86efac", text: "#166534" };
  if (t.includes("medium"))     return { bg: "#fffbeb", border: "#fcd34d", text: "#92400e" };
  return { bg: "#f8fafc", border: "#cbd5e1", text: "#475569" };
}

// ─── Main Component ───────────────────────────────────────────────
export default function CompetitorGrid({ text }) {
  if (!text) return null;

  const { categories, summary } = parseCompetitorData(text);

  // Fallback: if parser finds nothing, render as plain markdown
  if (categories.length === 0) {
    return <div className="md-body" dangerouslySetInnerHTML={{ __html: text }} />;
  }

  return (
    <div className="cg2-wrap">
      {categories.map((cat, idx) => {
        const ts = trafficStyle(cat.trafficType);
        return (
          <div key={idx} className="cg2-card">

            {/* ── Header ───────────────────────────────── */}
            <div className="cg2-card-header">
              <div className="cg2-num">{idx + 1}</div>
              <div className="cg2-title-col">
                <h3 className="cg2-category-name">{cat.categoryName}</h3>
                {cat.trafficType && (
                  <span
                    className="cg2-traffic-badge"
                    style={{ background: ts.bg, borderColor: ts.border, color: ts.text }}
                  >
                    {cat.trafficType}
                  </span>
                )}
              </div>
              {cat.competitors.length > 0 && (
                <div className="cg2-competitors">
                  <Users size={11} />
                  {cat.competitors.map((c, i) => (
                    <span key={i} className="cg2-comp-chip">{c}</span>
                  ))}
                </div>
              )}
            </div>

            {/* ── Body Grid ───────────────────────────── */}
            <div className="cg2-body">

              {/* Left: What they post */}
              {cat.postItems.length > 0 && (
                <div className="cg2-col">
                  <p className="cg2-col-label">What they post</p>
                  <ul className="cg2-post-list">
                    {cat.postItems.map((item, i) => (
                      <li key={i} className="cg2-post-item">
                        <span className="cg2-quote-mark">"</span>
                        <span>{item}</span>
                        <span className="cg2-quote-mark">"</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Right: Why it works */}
              {cat.whyItems.length > 0 && (
                <div className="cg2-col">
                  <p className="cg2-col-label">
                    {/these blogs/i.test(text.slice(text.indexOf(cat.categoryName), text.indexOf(cat.categoryName) + 300))
                      ? "These blogs are" : "Why it works"}
                  </p>
                  <ul className="cg2-why-list">
                    {cat.whyItems.map((item, i) => (
                      <li key={i} className="cg2-why-item">
                        <span className="cg2-bullet" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* ── Insight Footer ───────────────────────── */}
            {cat.insight && (
              <div className="cg2-insight-bar">
                <Lightbulb size={13} className="cg2-insight-icon" />
                <div>
                  <span className="cg2-insight-label">Example insight: </span>
                  <span className="cg2-insight-text">{cat.insight}</span>
                </div>
              </div>
            )}

          </div>
        );
      })}

      {/* ── Seasonal Summary ─────────────────────────── */}
      {summary && (
        <div className="cg2-summary">
          <div className="cg2-summary-header">
            <Calendar size={14} />
            <span>Seasonal Intelligence Summary</span>
          </div>
          <div className="cg2-summary-grid">
            {summary.primary && (
              <div className="cg2-summary-item">
                <span className="cg2-summary-key">Primary Window</span>
                <span className="cg2-summary-val">{summary.primary}</span>
              </div>
            )}
            {summary.secondary && (
              <div className="cg2-summary-item">
                <span className="cg2-summary-key">Secondary Window</span>
                <span className="cg2-summary-val">{summary.secondary}</span>
              </div>
            )}
            {summary.deadline && (
              <div className="cg2-summary-item">
                <span className="cg2-summary-key">Publishing Deadline</span>
                <span className="cg2-summary-val">{summary.deadline}</span>
              </div>
            )}
            {summary.untapped && (
              <div className="cg2-summary-item cg2-summary-wide">
                <span className="cg2-summary-key">
                  <Crosshair size={11} style={{ display: "inline", marginRight: 4 }} />
                  The Untapped Angle
                </span>
                <span className="cg2-summary-val">{summary.untapped}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
