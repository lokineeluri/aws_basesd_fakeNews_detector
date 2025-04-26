import React, { useState } from "react";
import "./App.css";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

// Import our components
import TextInput from "./TextInput";
import ImageUpload from "./ImageUpload";
import AnalysisDetails from "./AnalysisDetails";
import fetchAnalysisWithRetry from "./fetchAnalysisWithRetry";

function App() {
  const [text, setText] = useState("");
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const [analysisData, setAnalysisData] = useState(null);
  const [error, setError] = useState(null);

  // handleSubmit -> posts to /analyze
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() && !image) {
      toast.error("Please enter text or upload an image to analyze");
      setError("Please enter text or upload an image to analyze");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let base64Image = imagePreview ? imagePreview.split(",")[1] : null;
      toast.info("Submitting data for analysis...");

      const response = await fetch(
        "https://jzusy80i10.execute-api.us-east-1.amazonaws.com/analyze",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, base64Image }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to analyze content");
      }

      const data = await response.json();

      if (base64Image) {
        toast.success("Image stored in S3 successfully!");
      }
      if (text.trim()) {
        toast.success("Text stored in DynamoDB successfully!");
      }

      // Check if we received the correct ID and set it properly
      if (data.id) {
        console.log("Returned ID:", data.id);

        // Use this ID to fetch analysis data
        toast.info("Fetching analysis data from FakeNewsInputAnalysis...");
        try {
          await fetchAnalysisWithRetry(data.id, setAnalysisData, setIsLoading);
        } catch (retryErr) {
          toast.error("Analysis not ready after multiple retries", retryErr);
        }
      } else {
        throw new Error("ID not returned from analysis request");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to analyze content. Please try again.");
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Get the visual progress based on analysis data
  const getProgressPercentage = () => {
    if (!analysisData) {
      return 0; // Start at 0% when nothing has loaded
    } else if (analysisData.summaries && analysisData.summaries.length > 0) {
      return 100; // Both APIs completed (/news and /credibility)
    } else {
      return 50; // Only basic analysis (/news) completed
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>Fake News Detector</h1>
      </header>

      <main className="main-content">
        <form className="submission-form" onSubmit={handleSubmit}>
          <TextInput
            text={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isLoading}
          />

          <ImageUpload
            imagePreview={imagePreview}
            setImagePreview={setImagePreview}
            setImage={setImage}
            disabled={isLoading}
          />

          <div className="form-group">
            <button
              type="submit"
              className="button primary-button"
              disabled={isLoading}
            >
              {isLoading ? "Analyzing..." : "Analyze Content"}
            </button>
          </div>
        </form>

        {isLoading && (
          <div className="loading">
            <div className="spinner"></div>
            <p>Analyzing your content...</p>
          </div>
        )}

        {analysisData && !isLoading && (
          <AnalysisDetails analysisData={analysisData} />
        )}

        {!isLoading && (
          <div className="results">
            <h2>Analysis Progress</h2>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${getProgressPercentage()}%` }}
              ></div>
            </div>
            <p className="score-text">{getProgressPercentage()}% completed</p>
          </div>
        )}
      </main>

      <ToastContainer />

      <footer className="footer">
        <p>© 2025 Fake News Detector Project | Created with React</p>
      </footer>
    </div>
  );
}

export default App;
