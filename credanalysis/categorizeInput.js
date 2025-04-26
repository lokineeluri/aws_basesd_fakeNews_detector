const AWS = require("aws-sdk");
const { LanguageServiceClient } = require("@google-cloud/language");
const path = require("path");

// Initialize clients
const comprehend = new AWS.Comprehend({ region: "us-east-1" });
const dynamoDB = new AWS.DynamoDB.DocumentClient();
const client = new LanguageServiceClient();

const OUTPUT_TABLE = "FakeNewsInputAnalysis"; // Your DynamoDB table name
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(
  __dirname,
  "gcp-key.json"
);

// 🔄 Source-category mapping (customize as needed)
const sourceCategoryMap = {
  "The Times of India": ["/Politics", "/World", "/Culture"],
  "The Hindu": ["/Politics", "/Law & Government", "/Economy"],
  "Hindustan Times": ["/Politics", "/Law & Government", "/Lifestyle"],
  "Indian Express": ["/Politics", "/Law & Government", "/Investigative"],
  "The Economic Times": ["/Business", "/Finance", "/Economy"],
  "Business Standard": ["/Business", "/Finance", "/Policy"],
  Mint: ["/Economy", "/Finance", "/Markets"],
  "India Today": ["/Politics", "/Entertainment", "/Current Affairs"],
  NDTV: ["/Politics", "/Technology & Computing", "/Environment"],
  "CNN-News18": ["/Politics", "/World", "/India"],
  News18: ["/Politics", "/Society", "/Culture"],
  "Zee News": ["/Politics", "/Law & Government", "/National"],
  "Republic TV": ["/Politics", "/Law & Government", "/Opinion"],
  "ABP News": ["/Politics", "/Law & Government", "/Crime"],
  "Aaj Tak": ["/Politics", "/Society", "/Crime"],
  "Times Now": ["/Politics", "/Law & Government", "/Debate"],
  "Mirror Now": ["/Civic Issues", "/Politics", "/Law & Government"],
  "TV9 Bharatvarsh": ["/Politics", "/Crime", "/India"],
  "DD News": ["/Law & Government", "/Development", "/National"],
  Doordarshan: ["/Government", "/Culture", "/National"],
  "All India Radio": ["/Law & Government", "/India", "/Development"],
  "Scroll.in": ["/Politics", "/Society", "/Technology & Computing"],
  "The Wire": ["/Politics", "/Law & Government", "/Investigative"],
  "The Quint": ["/Politics", "/Digital Media", "/Culture"],
  "Alt News": ["/Fact-Checking", "/Law & Government", "/Politics"],
  BoomLive: ["/Fact-Checking", "/Technology & Computing", "/Media"],
  Newslaundry: ["/Media Critique", "/Politics", "/Society"],
  ThePrint: ["/Politics", "/Defense & Security", "/Policy"],
  "The Ken": ["/Business", "/Technology & Computing", "/Startups"],
  Inc42: ["/Startups", "/Entrepreneurship", "/Technology & Computing"],
  YourStory: ["/Entrepreneurship", "/Startups", "/Business"],
  Moneycontrol: ["/Finance", "/Markets", "/Economy"],
  CNBCTV18: ["/Business", "/Finance", "/Markets"],
  "Bar & Bench": ["/Law & Government", "/Courts", "/Judiciary"],
  LiveLaw: ["/Law & Government", "/Judiciary", "/Legal Analysis"],
  "The Caravan": ["/Politics", "/Society", "/Investigative"],
  "Outlook India": ["/Politics", "/Culture", "/Health"],
  "Open Magazine": ["/Politics", "/Culture", "/Features"],
  Frontline: ["/Politics", "/Development", "/Economy"],
  Tehelka: ["/Investigative", "/Politics", "/Corruption"],
};

// Source mapping function
function mapPublicationToDomain(source) {
  // Map of publication names to their domain names
  const sourceMap = {
    "The Times of India": "timesofindia.indiatimes.com",
    "The Hindu": "thehindu.com",
    "Hindustan Times": "hindustantimes.com",
    "Indian Express": "indianexpress.com",
    "India Today": "indiatoday.in",
    NDTV: "ndtv.com",
    CNN: "cnn.com",
    "CNN-News18": "news18.com",
    "New York Times": "nytimes.com",
    BBC: "bbc.com",
    Reuters: "reuters.com",
    "AP News": "apnews.com",
    "The Economic Times": "economictimes.indiatimes.com",
    "Business Standard": "business-standard.com",
    Mint: "livemint.com",
    News18: "news18.com",
    "Zee News": "zeenews.india.com",
    "Republic TV": "republicworld.com",
    "ABP News": "abplive.com",
    "Aaj Tak": "aajtak.intoday.in",
    "Times Now": "timesnownews.com",
    "Mirror Now": "timesnownews.com/mirror-now",
    "TV9 Bharatvarsh": "tv9hindi.com",
    "DD News": "ddnews.gov.in",
    Doordarshan: "doordarshan.gov.in",
    "All India Radio": "newsonair.com",
    "Scroll.in": "scroll.in",
    "The Wire": "thewire.in",
    "The Quint": "thequint.com",
    "Alt News": "altnews.in",
    BoomLive: "boomlive.in",
    Newslaundry: "newslaundry.com",
    ThePrint: "theprint.in",
    "The Ken": "the-ken.com",
    Inc42: "inc42.com",
    YourStory: "yourstory.com",
    Moneycontrol: "moneycontrol.com",
    CNBCTV18: "cnbctv18.com",
    "Bar & Bench": "barandbench.com",
    LiveLaw: "livelaw.in",
    "The Caravan": "caravanmagazine.in",
    "Outlook India": "outlookindia.com",
    "Open Magazine": "openthemagazine.com",
    Frontline: "frontline.thehindu.com",
    Tehelka: "tehelka.com",
  };

  if (source.includes(".")) {
    // Check if it already has http/https prefix
    if (source.startsWith("http://") || source.startsWith("https://")) {
      return source;
    }
    return "https://" + source;
  }

  // If we have a mapping, use it with https prefix
  if (sourceMap[source]) {
    return "https://" + sourceMap[source];
  }

  // If no mapping exists, try to create a URL from the name
  // E.g., "Washington Post" -> "https://washingtonpost.com"
  return "https://" + source.toLowerCase().replace(/\s+/g, "") + ".com";
}

// 🧠 Match sources based on category string and convert to domains directly
function matchSources(category) {
  const matchedSources = [];
  const matchedDomainSources = [];

  for (const [source, categories] of Object.entries(sourceCategoryMap)) {
    if (categories.some((c) => category.includes(c))) {
      // Store the original source name for reference
      matchedSources.push(source);
      // Also map to domain immediately
      matchedDomainSources.push(mapPublicationToDomain(source));
    }
  }

  return { matchedSources, matchedDomainSources };
}

exports.handler = async (event) => {
  console.log("Event received:", JSON.stringify(event, null, 2));

  try {
    const record = event.Records[0];

    // Only process INSERT events
    if (record.eventName !== "INSERT") {
      console.log("Not an INSERT event. Skipping.");
      return;
    }

    const newImage = record.dynamodb.NewImage;
    const text = newImage.extractedText?.S || "";

    // Extract the original ID from the source record
    const originalId = newImage.id?.S || record.dynamodb.Keys.id?.S;

    if (!originalId) {
      console.error("Could not find ID in the DynamoDB stream record");
      return;
    }

    console.log("Using original ID:", originalId);
    console.log("Extracted Text:", text);

    if (!text.trim()) {
      console.warn("Text is empty or undefined.");
      return;
    }

    const wordCount = text.trim().split(/\s+/).length;
    const document = {
      content: text,
      type: "PLAIN_TEXT",
    };

    let personEntities = [];
    let organizationEntities = [];
    let locationEntities = [];
    let dateEntities = [];
    let categories = [];

    console.log(
      `Text has ${wordCount} words. Using both analyzeEntities() and classifyText().`
    );

    // Check if the text is too short for classification
    try {
      // Try classifyText() if word count is sufficiently large
      if (wordCount >= 20) {
        const [categoryResult] = await client.classifyText({ document });

        console.log(
          "ClassifyText Response:",
          JSON.stringify(categoryResult, null, 2)
        );

        if (
          categoryResult &&
          categoryResult.categories &&
          categoryResult.categories.length > 0
        ) {
          categories = categoryResult.categories.map((c) => c.name);
          console.log("Detected Categories:", categories);
        } else {
          console.log("No categories detected.");
          categories = ["Uncategorized"]; // Default category if no categories found
        }
      }
    } catch (err) {
      console.error("Error during classifyText:", err);
      categories = ["Uncategorized"]; // Use a default category if classification fails
    }

    // Call analyzeEntities() for entity extraction
    const [entityResult] = await client.analyzeEntities({ document });
    entityResult.entities.forEach((entity) => {
      if (entity.type === "PERSON") personEntities.push(entity.name);
      if (entity.type === "ORGANIZATION")
        organizationEntities.push(entity.name);
      if (entity.type === "LOCATION") locationEntities.push(entity.name);
      if (entity.type === "DATE") dateEntities.push(entity.name);
    });

    // Extract category names and sources
    const categoryNames =
      categories.length > 0 ? categories : ["Uncategorized"];
    const { matchedSources, matchedDomainSources } = matchSources(
      categoryNames[0]
    );

    // Log both for debugging
    console.log("Publication names:", matchedSources);
    console.log("Mapped domain names:", matchedDomainSources);

    const params = {
      TableName: OUTPUT_TABLE,
      Item: {
        id: originalId, // Use the original ID instead of generating a new one
        extracted_text: text,
        person_entities: personEntities.length > 0 ? personEntities : null,
        organization_entities:
          organizationEntities.length > 0 ? organizationEntities : null,
        location_entities:
          locationEntities.length > 0 ? locationEntities : null,
        date_entities: dateEntities.length > 0 ? dateEntities : null,
        category: categoryNames[0] || null,
        sources: matchedDomainSources.length > 0 ? matchedDomainSources : null, // Store domain URLs instead of publication names
        domain_sources:
          matchedDomainSources.length > 0 ? matchedDomainSources : null, // Keep for backward compatibility
        timestamp: new Date().toISOString(),
      },
    };

    // Store the analysis results in DynamoDB
    await dynamoDB.put(params).promise();
    console.log(
      "Data successfully inserted into DynamoDB with original ID:",
      originalId
    );

    // Trigger the GDELT query Lambda with both source formats
    if (
      matchedDomainSources.length > 0 ||
      personEntities.length > 0 ||
      organizationEntities.length > 0 ||
      locationEntities.length > 0
    ) {
      // Create payload for GDELT Lambda
      const gdeltParams = {
        personEntities,
        organizationEntities,
        locationEntities,
        dateEntities,
        category: categoryNames[0] || "",
        sources: matchedDomainSources, // Use domain sources directly
        sourceArticleId: originalId,
      };

      // Optional: Invoke GDELT Lambda directly
      const lambda = new AWS.Lambda();
      try {
        const gdeltLambdaName =
          process.env.GDELT_LAMBDA_NAME || "GDELTArticleQueryFunction";
        console.log(
          `Invoking GDELT Lambda (${gdeltLambdaName}) with params:`,
          JSON.stringify(gdeltParams, null, 2)
        );

        await lambda
          .invoke({
            FunctionName: gdeltLambdaName,
            InvocationType: "Event", // Asynchronous invocation
            Payload: JSON.stringify(gdeltParams),
          })
          .promise();

        console.log("Successfully triggered GDELT query Lambda");
      } catch (lambdaErr) {
        console.error("Error invoking GDELT Lambda:", lambdaErr);
        // Continue execution - don't fail if Lambda invocation fails
      }
    } else {
      console.log("Not enough entities or sources to trigger GDELT query");
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        id: originalId,
        person_entities: personEntities || null,
        organization_entities: organizationEntities || null,
        location_entities: locationEntities || null,
        date_entities: dateEntities || null,
        category: categoryNames[0] || null,
        sources: matchedDomainSources || null, // Return domain sources
        domain_sources: matchedDomainSources || null, // Include domain sources in response
      }),
    };
  } catch (err) {
    console.error("Error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
