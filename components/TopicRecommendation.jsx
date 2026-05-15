"use client";

import { useState } from "react";
import {
  Sparkles, ChevronRight, RefreshCw, Calendar,
  BookOpen, Star, ShoppingBag, Search, ExternalLink,
} from "lucide-react";
import { ALL_MONTHS } from "@/lib/festivalCalendar";

export default function TopicRecommendation({
  recommendation,
  lastBlog,
  festival,
  isFirstBlog,
  targetMonth,
  onUseThisTopic,
  onRegenerate,
}) {
  const [selectedMonth, setSelectedMonth] = useState(targetMonth || "");
  const [regenerating, setRegenerating] = useState(false);

  async function handleRegenerate() {
    if (regenerating || !onRegenerate) return;
    setRegenerating(true);
    try {
      await onRegenerate(selectedMonth);
    } finally {
      setRegenerating(false);
    }
  }

  function handleMonthChange(e) {
    setSelectedMonth(e.target.value);
  }

  if (!recommendation) return null;

  const { recommendedTopic, primaryKeyword, reasoning, festivalReference, verdict } = recommendation;

  return (
    <div className="topic-rec-wrap">

      {/* ── Month Selector ─────────────────────── */}
      <div className="topic-rec-month-bar">
        <Calendar size={13} className="topic-rec-month-icon" />
        <span className="topic-rec-month-label">Planning for:</span>
        <select
          className="topic-rec-month-select"
          value={selectedMonth}
          onChange={handleMonthChange}
        >
          {ALL_MONTHS.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        {selectedMonth !== targetMonth && (
          <button
            className="topic-rec-month-apply"
            onClick={handleRegenerate}
            disabled={regenerating}
          >
            {regenerating ? <RefreshCw size={11} className="spin" /> : <RefreshCw size={11} />}
            Update for {selectedMonth}
          </button>
        )}
      </div>

      {/* ── Hero Card ──────────────────────────── */}
      <div className="topic-rec-hero">
        <div className="topic-rec-badge">
          <Sparkles size={11} />
          Recommended Topic — {targetMonth}
        </div>
        <h2 className="topic-rec-title">{recommendedTopic}</h2>
        {primaryKeyword && (
          <div className="topic-rec-keyword">
            <Search size={11} />
            <span>Target keyword:</span>
            <strong>{primaryKeyword}</strong>
          </div>
        )}
        {verdict && (
          <p className="topic-rec-verdict">{verdict}</p>
        )}

        <div className="topic-rec-cta-row">
          <button
            className="topic-rec-use-btn"
            onClick={() => onUseThisTopic(recommendedTopic)}
          >
            Use This Topic
            <ChevronRight size={14} />
          </button>
          <button
            className="topic-rec-regen-btn"
            onClick={handleRegenerate}
            disabled={regenerating}
          >
            {regenerating ? (
              <><RefreshCw size={12} className="spin" /> Generating…</>
            ) : (
              <><RefreshCw size={12} /> Regenerate</>
            )}
          </button>
        </div>
      </div>

      {/* ── Reasoning Sections ────────────────── */}
      <div className="topic-rec-reasoning">
        <h3 className="topic-rec-reasoning-title">Why this topic — the full reasoning</h3>

        <div className="topic-rec-grid">

          {/* Continuity */}
          {reasoning?.continuityFromLastBlog && (
            <div className="topic-rec-card">
              <div className="topic-rec-card-header">
                <BookOpen size={14} className="topic-rec-card-icon blue" />
                <span>Continuity from last blog</span>
              </div>
              <p className="topic-rec-card-body">{reasoning.continuityFromLastBlog}</p>
            </div>
          )}

          {/* Festival */}
          {reasoning?.festivalAngle && (
            <div className="topic-rec-card">
              <div className="topic-rec-card-header">
                <Star size={14} className="topic-rec-card-icon amber" />
                <span>Festival angle</span>
              </div>
              <p className="topic-rec-card-body">{reasoning.festivalAngle}</p>
              {festivalReference && (
                <div className="topic-rec-festival-chip">
                  <Star size={10} />
                  {festivalReference.name} — {festivalReference.date}
                </div>
              )}
            </div>
          )}

          {/* Commercial Intent */}
          {reasoning?.commercialIntent && (
            <div className="topic-rec-card">
              <div className="topic-rec-card-header">
                <ShoppingBag size={14} className="topic-rec-card-icon green" />
                <span>Commercial intent</span>
              </div>
              <p className="topic-rec-card-body">{reasoning.commercialIntent}</p>
            </div>
          )}

          {/* Search Intent */}
          {reasoning?.searchIntent && (
            <div className="topic-rec-card">
              <div className="topic-rec-card-header">
                <Search size={14} className="topic-rec-card-icon brand" />
                <span>Search intent</span>
              </div>
              <p className="topic-rec-card-body">{reasoning.searchIntent}</p>
            </div>
          )}
        </div>
      </div>

      {/* Last Blog Reference and first-blog note removed — detection unreliable */}

      {/* ── Bottom CTA ───────────────────────── */}
      <div className="topic-rec-bottom-cta">
        <button
          className="topic-rec-use-btn large"
          onClick={() => onUseThisTopic(recommendedTopic)}
        >
          Use This Topic — Start Keyword Research
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}
