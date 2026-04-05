"use client";
import React from "react";
import { Rocket, Flame, Zap, Brain, Target } from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────
function extractTitles(block) {
  const results = [];
  for (const line of block.split("\n")) {
    // Quoted bullet:  - "Title"  or  - 'Title'
    const q = line.match(/^[\s]*[-*]\s+["""''\u2018\u2019\u201C\u201D](.+?)["""''\u2018\u2019\u201C\u201D]/);
    if (q) { results.push(q[1].trim()); continue; }
    // Unquoted bullet (skip bold labels like **Foo:**)
    const b = line.match(/^[\s]*[-*]\s+([^*\n]{8,})/);
    if (b && !b[1].startsWith("**")) results.push(b[1].trim());
  }
  return results.filter(Boolean);
}

function extractBullets(block) {
  return (block.match(/^[\s]*[-*]\s+(.+)/mg) || [])
    .map(l => l.replace(/^[\s]*[-*]\s+/, "").replace(/\*\*/g, "").trim())
    .filter(Boolean);
}

function extractNumberedSteps(block) {
  return (block.match(/^\s*\d+\.\s+(.+)/mg) || [])
    .map(l => l.replace(/^\s*\d+\.\s+/, "").replace(/\*\*/g, "").trim())
    .filter(Boolean);
}

// ─── Main Parser ──────────────────────────────────────────────────
function parseTopicData(text) {
  if (!text) return { groups: [], writingSection: null, strategySection: null, finalNote: "" };

  // ── Final action note ──
  const noteMatch = text.match(/\*\*Single most important action:\*\*\s*(.+)/i);
  const finalNote = noteMatch ? noteMatch[1].replace(/\*\*/g, "").trim() : "";

  // ── HOW THEY ARE WRITING ──
  let writingSection = null;
  const writingMatch = text.match(/## HOW THEY ARE WRITING[^\n]*([\s\S]*?)(?=\n## |\n---\n\n## |$)/i);
  if (writingMatch) {
    const block = writingMatch[1];
    // Try labelled block first, then whole block
    const labelMatch = block.match(/\*\*Structure[^*]*:\*\*\n([\s\S]*?)(?=\n\*\*|\n---|$)/i);
    const stepsBlock = labelMatch ? labelMatch[1] : block;
    const steps = extractNumberedSteps(stepsBlock);
    if (steps.length > 0) writingSection = { steps };
  }

  // ── FINAL STRATEGY ──
  let strategySection = null;
  const strategyMatch = text.match(/## FINAL STRATEGY[^\n]*([\s\S]*?)(?=\n---\n\n\*\*Single|\n\*\*Single|\n---\n\*\*Single|$)/i);
  if (strategyMatch) {
    const block = strategyMatch[1];
    const mixMatch  = block.match(/\*\*Post mix[^*]*:\*\*\n([\s\S]*?)(?=\n\*\*|$)/i);
    const freqMatch = block.match(/\*\*Frequency[^*]*:\*\*\n([\s\S]*?)(?=\n\*\*|\n---|$)/i);
    const mixItems  = mixMatch  ? extractBullets(mixMatch[1])  : [];
    const freqItems = freqMatch ? extractBullets(freqMatch[1]) : [];
    if (mixItems.length > 0 || freqItems.length > 0) strategySection = { mixItems, freqItems };
  }

  // ── Numbered groups: ## N. Name ──
  // Split on every ## N. heading (numbered, not lettered)
  const parts = text.split(/(?=\n## \d+\.)/).map(p => p.trim()).filter(Boolean);
  // Also try splitting if headings are at start of string
  const allParts = text.split(/(?:^|\n)(?=## \d+\.)/).map(p => p.trim()).filter(Boolean);
  const segments = allParts.length >= parts.length ? allParts : parts;

  const groups = [];
  for (const part of segments) {
    const headerMatch = part.match(/^## (\d+)\.\s+(.+)/);
    if (!headerMatch) continue;

    const number    = parseInt(headerMatch[1]);
    const groupName = headerMatch[2].trim();

    // Content = everything after the first line
    const contentStart = part.indexOf("\n");
    const content = contentStart >= 0 ? part.slice(contentStart) : "";

    // Sub-categories: **Label:** followed by bullet lines
    const subCatRegex = /\*\*([^*\n]+?):\*\*\n((?:[\s]*[-*]\s+.+\n?)+)/g;
    const subCategories = [];
    let match;
    while ((match = subCatRegex.exec(content)) !== null) {
      const name  = match[1].trim();
      const items = extractTitles(match[2]);
      if (items.length > 0) subCategories.push({ name, items });
    }

    // Plain bullets when no sub-categories
    const plainItems = subCategories.length === 0 ? extractTitles(content) : [];

    // Group note: **Note:** ...
    const groupNoteMatch = content.match(/\*\*Note:\*\*\s*(.+)/i);
    const groupNote = groupNoteMatch ? groupNoteMatch[1].replace(/\*\*/g, "").trim() : "";

    groups.push({ number, groupName, subCategories, plainItems, groupNote });
  }

  return { groups, writingSection, strategySection, finalNote };
}

// ─── Accent colours per group index ──────────────────────────────
const GROUP_STYLES = [
  { accent: "#E11D48" },  // 1 Immediate     (rose)
  { accent: "#7C3AED" },  // 2 Viral         (violet)
  { accent: "#0EA5E9" },  // 3 SEO           (sky)
  { accent: "#F59E0B" },  // 4 Low-comp gold (amber)
  { accent: "#10B981" },  // 5 Product-led   (emerald)
];

// ─── Component ───────────────────────────────────────────────────
export default function TopicGrid({ text }) {
  if (!text) return null;

  const { groups, writingSection, strategySection, finalNote } = parseTopicData(text);

  // Fallback to plain markdown if nothing was parsed
  if (groups.length === 0 && !writingSection && !strategySection) {
    return <div className="md-body" dangerouslySetInnerHTML={{ __html: text }} />;
  }

  return (
    <div className="tg-wrap">

      {/* ── Master Header ────────────────────────── */}
      <div className="tg-master-header">
        <Rocket size={18} className="tg-rocket" />
        <span>BEST BLOG TOPICS FOR YOU</span>
        <span className="tg-header-sub">HIGH-PERFORMANCE LIST</span>
      </div>

      {/* ── Topic Groups ─────────────────────────── */}
      {groups.map((group, idx) => {
        const style = GROUP_STYLES[idx] || GROUP_STYLES[GROUP_STYLES.length - 1];
        return (
          <div key={idx} className="tg-group" style={{ borderLeftColor: style.accent }}>

            {/* Header */}
            <div className="tg-group-header">
              <span className="tg-flame" style={{ color: style.accent }}>
                <Flame size={16} />
              </span>
              <span className="tg-group-num" style={{ color: style.accent }}>{group.number}.</span>
              <h3 className="tg-group-name">{group.groupName}</h3>
            </div>

            {/* Sub-categories or plain list */}
            {group.subCategories.length > 0 ? (
              <div className="tg-subcats">
                {group.subCategories.map((sub, si) => (
                  <div key={si} className="tg-subcat">
                    <p className="tg-subcat-name">{sub.name}</p>
                    <ul className="tg-topic-list">
                      {sub.items.map((item, ti) => (
                        <li key={ti} className="tg-topic-item">
                          <span className="tg-topic-dot" style={{ background: style.accent }} />
                          <span className="tg-topic-title">"{item}"</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <ul className="tg-topic-list tg-plain">
                {group.plainItems.map((item, ti) => (
                  <li key={ti} className="tg-topic-item">
                    <span className="tg-topic-dot" style={{ background: style.accent }} />
                    <span className="tg-topic-title">"{item}"</span>
                  </li>
                ))}
              </ul>
            )}

            {/* Group note */}
            {group.groupNote && (
              <div className="tg-group-note">👉 {group.groupNote}</div>
            )}

          </div>
        );
      })}

      {/* ── HOW THEY ARE WRITING ─────────────────── */}
      {writingSection && writingSection.steps.length > 0 && (
        <div className="tg-writing-card">
          <div className="tg-writing-header">
            <Brain size={16} className="tg-brain" />
            <span>HOW THEY ARE WRITING (YOU MUST COPY THIS)</span>
          </div>
          <div className="tg-writing-body">
            <p className="tg-writing-label">Structure competitors use:</p>
            <ol className="tg-writing-steps">
              {writingSection.steps.map((step, i) => (
                <li key={i} className="tg-writing-step">
                  <span className="tg-step-num">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {/* ── FINAL STRATEGY ───────────────────────── */}
      {strategySection && (
        <div className="tg-strategy-card">
          <div className="tg-strategy-header">
            <Zap size={16} className="tg-zap-icon" />
            <span>FINAL STRATEGY FOR YOU</span>
          </div>
          <div className="tg-strategy-body">
            {strategySection.mixItems.length > 0 && (
              <div className="tg-strategy-col">
                <p className="tg-strategy-label">👉 Post mix (ideal):</p>
                <ul className="tg-strategy-list">
                  {strategySection.mixItems.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {strategySection.freqItems.length > 0 && (
              <div className="tg-strategy-col">
                <p className="tg-strategy-label">👉 Frequency:</p>
                <ul className="tg-strategy-list">
                  {strategySection.freqItems.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Final Note ───────────────────────────── */}
      {finalNote && (
        <div className="tg-final-note">
          <Zap size={13} className="tg-zap" />
          <span><strong>Key action: </strong>{finalNote}</span>
        </div>
      )}

    </div>
  );
}
