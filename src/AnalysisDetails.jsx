import React from "react";
import "./index.css";

const AnalysisDetails = ({ analysisData }) => {
  if (!analysisData) return null;

  const {
    category,
    date,
    extracted_text,
    persons = [],
    organizations = [],
    locations = [],
    sources = [],
    // Changed from single summary to summaries array
    summaries = [],
  } = analysisData;

  // Format date for better readability
  const formattedDate = new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Determine status and color based on category
  const getCategoryInfo = (cat) => {
    cat = cat?.toLowerCase() || "";

    if (
      cat.includes("processing") ||
      cat.includes("progress") ||
      cat === "unknown"
    ) {
      return { label: "Processing", className: "processing" };
    }
    if (cat.includes("mislead") || cat.includes("biased")) {
      return { label: "Potentially Misleading", className: "misleading" };
    }
    if (cat.includes("fake") || cat.includes("false")) {
      return { label: "Likely False", className: "false" };
    }
    if (
      cat.includes("true") ||
      cat.includes("factual") ||
      cat.includes("verified")
    ) {
      return { label: "Verified", className: "true" };
    }
    if (cat.includes("satire")) {
      return { label: "Satire", className: "satire" };
    }

    return { label: cat || "Unknown", className: "unknown" };
  };

  const categoryInfo = getCategoryInfo(category);

  return (
    <div className="analysis-details">
      <h2>Content Analysis</h2>

      <div className="analysis-section">
        <div className="category-container">
          <span className={`category-badge ${categoryInfo.className}`}>
            {categoryInfo.label}
          </span>
          <span className="analysis-date">Analyzed on {formattedDate}</span>
        </div>
      </div>

      {/* New Section: Related Articles/Summaries */}
      <div className="analysis-section">
        <h3>Related Articles</h3>
        {summaries.length > 0 ? (
          <div className="summaries-list">
            {summaries.map((item, index) => (
              <div key={`summary-${index}`} className="summary-item">
                <div className="summary-content">
                  <a
                    href={item.summary}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="summary-link"
                  >
                    {item.summary}
                  </a>
                  <div className="summary-source">Source: {item.source}</div>
                </div>
                <div className="summary-score">
                  <div className="score-badge">{item.relevanceScore}</div>
                  <div className="score-label">Relevance</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="summaries-empty">
            <p>No related articles found for this content.</p>
          </div>
        )}
      </div>

      {extracted_text && (
        <div className="analysis-section">
          <h3>Content Analysis</h3>
          <div className="extracted-text">
            <p>{extracted_text}</p>
          </div>
        </div>
      )}

      <div className="entities-container">
        {entities("People", persons)}
        {entities("Organizations", organizations)}
        {entities("Locations", locations)}
      </div>

      {sources.length > 0 && (
        <div className="analysis-section">
          <h3>Sources</h3>
          <div className="sources-list">
            {sources.map((source, index) => (
              <div key={`source-${index}`} className="source-item">
                {source}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Helper function to render entity sections
const entities = (title, items) => {
  if (!items || items.length === 0) return null;

  return (
    <div className="entity-section">
      <h3>{title}</h3>
      <div className="entity-list">
        {items.map((item, index) => (
          <div key={`entity-${index}`} className="entity-item">
            {item.S || item}
          </div>
        ))}
      </div>
    </div>
  );
};

export default AnalysisDetails;
