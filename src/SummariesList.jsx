import React from "react";

function SummariesList({ summaries }) {
  if (!summaries || summaries.length === 0) {
    return (
      <div className="summaries-empty">
        <p>No related articles found for this content.</p>
      </div>
    );
  }

  return (
    <div className="summaries-container">
      <h3>Related Articles</h3>
      <div className="summaries-list">
        {summaries.map((item) => (
          <div key={item.id} className="summary-item">
            <div className="summary-content">
              <a
                href={item.url}
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
    </div>
  );
}

export default SummariesList;
