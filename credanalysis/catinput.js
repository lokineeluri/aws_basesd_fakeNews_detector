const AWS = require("aws-sdk");
const dynamoDB = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  // Set CORS headers for all responses
  const headers = {
    "Access-Control-Allow-Origin": "*", // Allow requests from any origin
    "Access-Control-Allow-Headers":
      "Content-Type,X-Amz-Date,Authorization,X-Api-Key",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  try {
    // Extract ID from query parameters
    const id = event.queryStringParameters && event.queryStringParameters.id;

    if (!id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing required parameter: id" }),
      };
    }

    console.log(`Looking up analysis data for ID: ${id}`);

    // Query the DynamoDB table to get the analysis data
    const params = {
      TableName: "FakeNewsInputAnalysis",
      Key: { id: id },
    };

    const result = await dynamoDB.get(params).promise();

    // Check if item was found
    if (!result.Item) {
      // Try to check if we have a raw item in the input table
      const inputParams = {
        TableName: "FakeNewsInputAnalysis",
        Key: { id: id },
      };

      const inputResult = await dynamoDB.get(inputParams).promise();

      if (!inputResult.Item) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: "Analysis not found", id }),
        };
      }

      // Return partial data if raw input exists but processing isn't complete
      return {
        statusCode: 202, // Accepted but processing
        headers,
        body: JSON.stringify({
          id: id,
          extracted_text: inputResult.Item.extracted_text || "",
          status: "processing",
          message: "Analysis is still being processed",
        }),
      };
    }

    // Return the analysis data
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result.Item),
    };
  } catch (error) {
    console.error("Error retrieving analysis data:", error);

    // Return error response
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Failed to retrieve analysis data",
        message: error.message,
      }),
    };
  }
};
