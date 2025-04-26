const AWS = require("aws-sdk");
const docClient = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  try {
    const input_id = event.queryStringParameters?.input_id;

    if (!input_id) {
      return {
        statusCode: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "Missing required parameter: input_id",
        }),
      };
    }

    console.log(`Querying articles for input_id: ${input_id}`);

    const params = {
      TableName: "GDELTArticleCredibility",
      KeyConditionExpression: "input_id = :id",
      ExpressionAttributeValues: {
        ":id": input_id,
      },
    };

    const result = await docClient.query(params).promise();

    if (result.Items && result.Items.length > 0) {
      const articles = result.Items.map((item) => ({
        id: item.id,
        summary: item.summary || "No summary available",
        relevanceScore: item.relevanceScore || 0,
        sourceUrl: item.sourceUrl || item.url || "#",
        source: item.source || item.domain || "Unknown source",
        publishDate:
          item.publishDate || item.retrievedAt || new Date().toISOString(),
      }));

      // Sort by relevanceScore descending
      articles.sort((a, b) => b.relevanceScore - a.relevanceScore);

      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(articles),
      };
    } else {
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify([]),
      };
    }
  } catch (error) {
    console.error("Error processing request:", error);
    return {
      statusCode: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: "Error processing request",
        error: error.message,
      }),
    };
  }
};
