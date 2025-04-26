import axios from "axios";
import { toast } from "react-toastify";

const MAX_RETRIES = 6;
const RETRY_DELAY = 2000; // in milliseconds

// Helper to extract string values from DynamoDB-style arrays
const extractStringArray = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr.map((item) => item?.S || item);
};

// Separate function to fetch basic analysis data with its own retry logic
const fetchBasicAnalysis = async (id, attempt = 1) => {
  console.log(
    `Fetching basic analysis with ID: ${id} (attempt ${attempt}/${MAX_RETRIES})`
  );

  // Updated endpoint URL for basic analysis
  const endpoint = `https://hbhyba2k57.execute-api.us-east-1.amazonaws.com/news`;

  try {
    const response = await axios.get(endpoint, {
      params: { id },
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    console.log(`Attempt ${attempt}: Fetched basic data:`, response.data);

    // Check if data is empty or malformed
    if (!response.data || Object.keys(response.data).length === 0) {
      console.warn(
        "Received empty or invalid response data for basic analysis"
      );

      if (attempt < MAX_RETRIES) {
        toast.info(`Waiting for analysis data... (${attempt}/${MAX_RETRIES})`);
        // Wait and retry
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        return fetchBasicAnalysis(id, attempt + 1);
      } else {
        // Return fallback data after max retries
        toast.warning(
          "Basic analysis data unavailable. Showing placeholder content."
        );
        return {
          id: id,
          category: "Processing",
          timestamp: new Date().toISOString(),
          extracted_text:
            "Your content has been submitted and is being processed.",
          person_entities: [],
          organization_entities: [],
          location_entities: [],
          sources: [],
        };
      }
    }

    return response.data;
  } catch (error) {
    if (error.response?.status === 404 && attempt < MAX_RETRIES) {
      console.warn("Basic analysis data not ready yet, retrying...");
      // Wait and retry
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      return fetchBasicAnalysis(id, attempt + 1);
    }

    if (attempt < MAX_RETRIES) {
      console.error(
        `Attempt ${attempt}: Error fetching basic analysis data`,
        error
      );
      toast.info(`Retrying basic analysis (${attempt}/${MAX_RETRIES})...`);
      // Wait and retry
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      return fetchBasicAnalysis(id, attempt + 1);
    } else {
      console.error(
        "Max retries reached for basic analysis. Returning fallback data."
      );
      toast.error("Basic analysis failed after multiple attempts.");

      // Return fallback data
      return {
        id: id,
        category: "Error",
        timestamp: new Date().toISOString(),
        extracted_text: "Unable to retrieve analysis at this time.",
        person_entities: [],
        organization_entities: [],
        location_entities: [],
        sources: [],
      };
    }
  }
};

// Separate function to fetch related articles with its own retry logic
const fetchRelatedArticles = async (id, attempt = 1) => {
  console.log(
    `Fetching related articles with input_id: ${id} (attempt ${attempt}/${MAX_RETRIES})`
  );

  // Endpoint for GDELTArticleCredibility
  const endpoint = `https://2910ghdf6d.execute-api.us-east-1.amazonaws.com/dev/credibility`;

  try {
    const response = await axios.get(endpoint, {
      params: { input_id: id },
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    });

    console.log(`Attempt ${attempt}: Fetched articles data:`, response.data);

    // Check if data is empty or malformed
    if (
      !response.data ||
      !Array.isArray(response.data) ||
      response.data.length === 0
    ) {
      console.warn(
        "Received empty or invalid response data for related articles"
      );

      if (attempt < MAX_RETRIES) {
        toast.info(
          `Waiting for related articles... (${attempt}/${MAX_RETRIES})`
        );
        // Wait and retry
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        return fetchRelatedArticles(id, attempt + 1);
      } else {
        // Return empty array after max retries
        toast.warning("No related articles found after multiple attempts.");
        return [];
      }
    }

    // Format summaries for display
    return response.data.map((article) => ({
      summary: article.summary || "No summary available",
      relevanceScore: article.relevanceScore || 0,
      url: article.sourceUrl || "#",
      source: article.source || "Unknown source",
      id: article.id || String(Math.random()).substring(2, 10),
    }));
  } catch (error) {
    if (error.response?.status === 404 && attempt < MAX_RETRIES) {
      console.warn("Related articles data not ready yet, retrying...");
      // Wait and retry
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      return fetchRelatedArticles(id, attempt + 1);
    }

    if (attempt < MAX_RETRIES) {
      console.error(
        `Attempt ${attempt}: Error fetching related articles`,
        error
      );
      toast.info(
        `Retrying related articles fetch (${attempt}/${MAX_RETRIES})...`
      );
      // Wait and retry
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
      return fetchRelatedArticles(id, attempt + 1);
    } else {
      console.error(
        "Max retries reached for related articles. Returning empty array."
      );
      toast.error("Unable to fetch related articles after multiple attempts.");
      return [];
    }
  }
};

// Main function that orchestrates both API calls
const fetchAnalysisWithRetry = async (id, setAnalysisData, setLoading) => {
  try {
    setLoading(true);

    // Run both API calls in parallel with Promise.all
    const [basicData, relatedArticles] = await Promise.all([
      fetchBasicAnalysis(id),
      fetchRelatedArticles(id),
    ]);

    // Process and combine the data
    const processedData = {
      id: id,
      category: basicData.category || "Unknown",
      date: basicData.timestamp || new Date().toISOString(),
      extracted_text:
        basicData.extracted_text || "Text extraction in progress...",
      persons: extractStringArray(basicData.person_entities),
      organizations: extractStringArray(basicData.organization_entities),
      locations: extractStringArray(basicData.location_entities),
      sources: extractStringArray(basicData.sources || []),
      summaries: relatedArticles,
    };

    // Update state with the combined data
    setAnalysisData(processedData);

    // Show appropriate toast message
    if (relatedArticles.length > 0) {
      toast.success(`Found ${relatedArticles.length} related articles!`);
    } else {
      toast.info("Analysis complete. No related articles found.");
    }
  } catch (error) {
    console.error("Error in main fetchAnalysisWithRetry function:", error);
    toast.error(
      "There was an error processing your request. Please try again later."
    );

    // Set fallback data in case of catastrophic error
    setAnalysisData({
      id: id,
      category: "Error",
      date: new Date().toISOString(),
      extracted_text: "An error occurred while processing your request.",
      persons: [],
      organizations: [],
      locations: [],
      sources: [],
      summaries: [],
    });
  } finally {
    setLoading(false);
  }
};

export default fetchAnalysisWithRetry;
