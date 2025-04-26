// For Node.js 18.x (v3 SDK) or Node.js 16.x (with v3 installed)
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const {
  TextractClient,
  DetectDocumentTextCommand,
} = require("@aws-sdk/client-textract");
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");

const s3Client = new S3Client();
const textractClient = new TextractClient();
const dynamoClient = new DynamoDBClient();

const BUCKET_NAME = "fake-news-image";
const TABLE_NAME = "FakeNewsInput";

exports.handler = async (event) => {
  console.log("Event received:", JSON.stringify(event, null, 2));

  try {
    const requestBody = JSON.parse(event.body || "{}");
    const userText = requestBody.text || "";
    const base64Image = requestBody.base64Image || null;

    let extractedText = userText;

    // If there's a base64 image, upload + Textract
    if (base64Image) {
      const decodedImage = Buffer.from(base64Image, "base64");
      const imageKey = `uploads/${Date.now()}-upload.png`;

      // Upload to S3
      await s3Client.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: imageKey,
          Body: decodedImage,
          ContentType: "image/png",
        })
      );

      // Detect text via Textract
      const textractResponse = await textractClient.send(
        new DetectDocumentTextCommand({
          Document: {
            S3Object: { Bucket: BUCKET_NAME, Name: imageKey },
          },
        })
      );

      extractedText = textractResponse.Blocks.filter(
        (block) => block.BlockType === "LINE"
      )
        .map((block) => block.Text)
        .join(" ");
    }

    // 1) Generate a unique ID
    const newId = new Date().toISOString();

    // 2) Put the item in DynamoDB
    await dynamoClient.send(
      new PutItemCommand({
        TableName: TABLE_NAME,
        Item: {
          id: { S: newId },
          userText: { S: userText },
          extractedText: { S: extractedText },
        },
      })
    );

    // 3) Return the ID in the response
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Data processed successfully",
        id: newId, // <-- CRITICAL
        userText,
        extractedText,
      }),
    };
  } catch (error) {
    console.error("Error details:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Internal Server Error" }),
    };
  }
};
