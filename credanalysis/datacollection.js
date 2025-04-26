"use strict";

// Use CommonJS requires instead of imports
const AWS = require("aws-sdk");
const BigQuery = require("@google-cloud/bigquery").BigQuery;
const fs = require("fs");
const path = require("path");

// Initialize AWS services
const dynamo = new AWS.DynamoDB.DocumentClient();
const dynamoDB = new AWS.DynamoDB(); // For table creation

// Default sources to use if none specified
const DEFAULT_SOURCES = [
  "cnn.com",
  "nytimes.com",
  "bbc.com",
  "reuters.com",
  "apnews.com",
];

// Load credentials directly from environment variable or file
let gcpCredentials;
try {
  // First try to read from file
  const gcpKeyFile = path.join(__dirname, "credentials.json");
  if (fs.existsSync(gcpKeyFile)) {
    console.log("Loading GCP credentials from file...");
    gcpCredentials = JSON.parse(fs.readFileSync(gcpKeyFile, "utf8"));
  }
  // Fall back to environment variable if file not found
  else if (process.env.GCP_KEY_BASE64) {
    console.log("Loading GCP credentials from environment variable...");
    gcpCredentials = JSON.parse(
      Buffer.from(process.env.GCP_KEY_BASE64, "base64").toString("utf-8")
    );
  } else {
    throw new Error("No GCP credentials found in file or environment variable");
  }
} catch (err) {
  console.error("Error loading GCP credentials:", err);
  throw err;
}

// Set up BigQuery client
const bigquery = new BigQuery({
  projectId: gcpCredentials.project_id,
  credentials: gcpCredentials,
});

// Helper function to ensure DynamoDB table exists
async function ensureTableExists(tableName) {
  try {
    // Try to describe the table - will throw if it doesn't exist
    await dynamoDB.describeTable({ TableName: tableName }).promise();
    console.log(`DynamoDB table ${tableName} already exists`);
    return true;
  } catch (error) {
    if (error.code === "ResourceNotFoundException") {
      console.log(`DynamoDB table ${tableName} not found, creating...`);

      // Create the table
      const params = {
        TableName: tableName,
        KeySchema: [
          { AttributeName: "input_id", KeyType: "HASH" }, // Partition key
          { AttributeName: "id", KeyType: "RANGE" }, // Sort key
        ],
        AttributeDefinitions: [
          { AttributeName: "input_id", AttributeType: "S" },
          { AttributeName: "id", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST", // On-demand capacity
      };

      try {
        await dynamoDB.createTable(params).promise();
        console.log(`Created DynamoDB table: ${tableName}`);

        // Wait for table to become active
        console.log("Waiting for table to become active...");
        await dynamoDB
          .waitFor("tableExists", { TableName: tableName })
          .promise();
        console.log("Table is now active");
        return true;
      } catch (createError) {
        console.error("Error creating DynamoDB table:", createError);
        return false;
      }
    } else {
      console.error("Error checking DynamoDB table:", error);
      return false;
    }
  }
}

// Helper function to clear all data from a DynamoDB table
async function clearDynamoTable(tableName) {
  try {
    console.log(`Starting to clear all data from DynamoDB table: ${tableName}`);

    // First, scan the table to get all items
    const scanParams = {
      TableName: tableName,
    };

    const scanResult = await dynamo.scan(scanParams).promise();

    if (scanResult.Items.length === 0) {
      console.log("Table is already empty, nothing to clear");
      return true;
    }

    console.log(`Found ${scanResult.Items.length} items to delete`);

    // Prepare batch delete requests
    const deleteRequests = scanResult.Items.map((item) => ({
      DeleteRequest: {
        Key: {
          input_id: item.input_id, // Include partition key
          id: item.id, // Include sort key
        },
      },
    }));

    // Delete in batches of 25
    const batchSize = 25;
    for (let i = 0; i < deleteRequests.length; i += batchSize) {
      const batch = deleteRequests.slice(i, i + batchSize);

      const deleteParams = {
        RequestItems: {
          [tableName]: batch,
        },
      };

      await dynamo.batchWrite(deleteParams).promise();
      console.log(
        `Deleted batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(
          deleteRequests.length / batchSize
        )}`
      );
    }

    console.log("✅ Successfully cleared all data from the table");
    return true;
  } catch (error) {
    console.error("Error clearing DynamoDB table:", error);
    return false;
  }
}

// In the processDynamoDBEvent function, extract the sourceArticleId (which is the ID)
function processDynamoDBEvent(event) {
  const records = event.Records || [];

  if (records.length === 0) {
    console.log("No records found in the event");
    return null;
  }

  // Get the first record - assuming one record per event
  const record = records[0];

  // Check if this is a DynamoDB event
  if (record.eventSource !== "aws:dynamodb") {
    console.warn("Not a DynamoDB event");
    return null;
  }

  // Process only INSERT events
  if (record.eventName !== "INSERT") {
    console.log(`Ignoring ${record.eventName} event`);
    return null;
  }

  // Extract the new data (format for DynamoDB Streams)
  const newItem = AWS.DynamoDB.Converter.unmarshall(record.dynamodb.NewImage);
  console.log("Extracted new item:", JSON.stringify(newItem));

  // Get the ID from the triggering item
  const triggerItemId = newItem.id || "";
  console.log("Extracted triggering item ID:", triggerItemId);

  // Parse and transform the data
  return {
    id: newItem.id || "",
    personEntities: newItem.person_entities || [],
    organizationEntities: newItem.organization_entities || [],
    locationEntities: newItem.location_entities || [],
    dateEntities: newItem.date_entities || [],
    category: newItem.category || "",
    sources: newItem.sources?.length > 0 ? newItem.sources : DEFAULT_SOURCES,
    sourceArticleId: triggerItemId, // Use the ID from the triggering event
    extractedText: newItem.extracted_text || "",
    triggerItemId: triggerItemId, // Add the trigger ID as a separate field
  };
}

exports.handler = async (event) => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  try {
    // Process event parameters
    let parameters;
    let triggerItemId = ""; // Initialize ID from trigger

    if (event.Records && event.Records[0]?.eventSource === "aws:dynamodb") {
      parameters = processDynamoDBEvent(event);
      if (!parameters) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            message: "Invalid or empty DynamoDB trigger event",
          }),
        };
      }
      triggerItemId = parameters.triggerItemId; // Store the ID from trigger
      console.log("Using parameters from DynamoDB trigger:", parameters);
      console.log("Using trigger item ID:", triggerItemId);
    } else {
      parameters = event;
      // If direct invocation, try to get ID from parameters
      triggerItemId = parameters.id || parameters.sourceArticleId || "";
      console.log("Using direct invocation parameters");
    }

    // Extract parameters with defaults
    const {
      personEntities = [],
      organizationEntities = [],
      locationEntities = [],
      dateEntities = [],
      category = "",
      sources = DEFAULT_SOURCES,
      sourceArticleId = "",
      dynamoTableName = process.env.DYNAMODB_TABLE || "GDELTArticleCredibility",
      filterLogic = "flexible",
    } = parameters;

    // COST-SAVING APPROACH 1: Limit bytes billed to fit free tier
    const maximumBytesBilled = "1000000000"; // 1GB maximum

    // COST-SAVING APPROACH 2: Narrow time window significantly
    // Reduce lookback to minimum necessary - just 3 days
    const daysAgo = 3;

    console.log("Executing with parameters:", {
      personEntities,
      organizationEntities,
      locationEntities,
      dateEntities,
      category,
      sources,
      filterLogic,
      dynamoTableName,
    });

    // Build entity filters (simplified)
    // Take only the first entity from each category to reduce query complexity
    const personFilter =
      personEntities.length > 0
        ? `REGEXP_CONTAINS(Persons, r'(?i)${personEntities[0].replace(
            /'/g,
            "\\'"
          )}')`
        : "";

    const orgFilter =
      organizationEntities.length > 0
        ? `REGEXP_CONTAINS(Organizations, r'(?i)${organizationEntities[0].replace(
            /'/g,
            "\\'"
          )}')`
        : "";

    const locationFilter =
      locationEntities.length > 0
        ? `REGEXP_CONTAINS(Locations, r'(?i)${locationEntities[0].replace(
            /'/g,
            "\\'"
          )}')`
        : "";

    // COST-SAVING APPROACH 3: Limit to top 2 most popular news sources instead of all
    // Take only 2 domains to reduce search space
    const limitedSources = sources.slice(0, 2);
    const domainFilters = limitedSources
      .map((domain) => {
        const baseDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, "");
        return `REGEXP_CONTAINS(DocumentIdentifier, r'(?i)${baseDomain.replace(
          /\./g,
          "\\."
        )}')`;
      })
      .join(" OR ");

    // Simplified category filter
    const categoryFilter = category
      ? `REGEXP_CONTAINS(Themes, r'(?i)${category.replace(/'/g, "\\'")}')`
      : "";

    // COST-SAVING APPROACH 4: Build a more efficient WHERE clause
    // Build a more targeted WHERE clause with more specific filters
    let whereClause = `_PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${daysAgo} DAY)`;

    // Entity filters - build efficiently
    const entityFilters = [];
    if (personFilter) entityFilters.push(personFilter);
    if (orgFilter) entityFilters.push(orgFilter);
    if (locationFilter) entityFilters.push(locationFilter);

    if (entityFilters.length > 0) {
      whereClause += ` AND (${entityFilters.join(" OR ")})`;
    }

    // COST-SAVING APPROACH 5: Only apply date filtering if specific date provided
    if (dateEntities.length > 0) {
      // Extract year and month only from the first date
      const datePrefix = dateEntities[0].replace(/-/g, "").substring(0, 6);
      whereClause += ` AND CAST(DATE AS STRING) LIKE '${datePrefix}%'`;
    }

    // Add domain filter
    if (domainFilters) {
      whereClause += ` AND (${domainFilters})`;
    }

    // COST-SAVING APPROACH 6: Make category optional to ensure results
    // First try without category filter to ensure we get results
    // If we get results, we can filter by category later in application code

    // COST-SAVING APPROACH 7: Simplified query structure
    // Streamlined query that does less processing in BigQuery
    const query = `
    SELECT 
      DocumentIdentifier,
      SourceCommonName AS source,
      V2Tone AS tone,
      Themes,
      Persons,
      Organizations,
      Locations,
      SUBSTR(CAST(DATE AS STRING), 0, 8) AS publishDate,
      GKGRECORDID AS title,
      SUBSTR(DocumentIdentifier, 0, 1000) AS summary,
      REGEXP_EXTRACT(DocumentIdentifier, r'https?://([^/]+)') AS domain
    FROM 
      \`gdelt-bq.gdeltv2.gkg_partitioned\`
    WHERE 
      ${whereClause}
    ORDER BY 
      DATE DESC
    LIMIT 10  -- Reduce result limit to minimize data transfer
    `;

    console.log("Executing cost-optimized query:", query);

    // Execute with increased byte limit that fits free tier
    const [job] = await bigquery.createQueryJob({
      query,
      maximumBytesBilled: maximumBytesBilled,
      useLegacySql: false,
    });

    let [rows] = await job.getQueryResults();
    console.log("✅ Retrieved rows from BigQuery:", rows.length);

    // If no results with basic query, try an even more minimal query
    if (rows.length === 0) {
      console.log("No results with initial query, trying minimal query...");

      // FALLBACK APPROACH: Ultra minimal query with just one entity and no date restrictions
      let minimalEntity = "";
      if (personEntities.length > 0) minimalEntity = personEntities[0];
      else if (organizationEntities.length > 0)
        minimalEntity = organizationEntities[0];
      else if (locationEntities.length > 0) minimalEntity = locationEntities[0];

      if (minimalEntity) {
        const minimalQuery = `
        SELECT 
          DocumentIdentifier,
          SourceCommonName AS source, 
          V2Tone AS tone,
          Themes,
          Persons,
          Organizations,
          Locations,
          SUBSTR(CAST(DATE AS STRING), 0, 8) AS publishDate
        FROM 
          \`gdelt-bq.gdeltv2.gkg_partitioned\` 
        WHERE 
          _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 2 DAY)
          AND (REGEXP_CONTAINS(Persons, r'(?i)${minimalEntity}') 
               OR REGEXP_CONTAINS(Organizations, r'(?i)${minimalEntity}')
               OR REGEXP_CONTAINS(Locations, r'(?i)${minimalEntity}'))
        LIMIT 5
        `;

        const [minimalJob] = await bigquery.createQueryJob({
          query: minimalQuery,
          maximumBytesBilled: maximumBytesBilled,
          useLegacySql: false,
        });

        [rows] = await minimalJob.getQueryResults();
        console.log("✅ Retrieved rows from minimal query:", rows.length);
      }
    }

    if (rows.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          message:
            "No related articles found in GDELT within free tier query limits.",
          query: query,
        }),
      };
    }

    // Format the results in a flat structure for DynamoDB
    const formattedResults = rows.map((row) => {
      const documentId = row.DocumentIdentifier
        ? row.DocumentIdentifier.replace(/[^a-zA-Z0-9]/g, "_")
        : `gdelt_${new Date().getTime()}_${Math.floor(Math.random() * 1000)}`;

      // Format the date
      const publishDate = row.publishDate
        ? `${row.publishDate.substring(0, 4)}-${row.publishDate.substring(
            4,
            6
          )}-${row.publishDate.substring(6, 8)}`
        : "";

      const retrievedAt = new Date().toISOString();

      // Calculate simple relevance score in application code rather than BigQuery
      let relevanceScore = 0;

      // Check for person matches
      if (row.Persons) {
        for (const person of personEntities) {
          if (row.Persons.toLowerCase().includes(person.toLowerCase())) {
            relevanceScore += 1;
            break;
          }
        }
      }

      // Check for org matches
      if (row.Organizations) {
        for (const org of organizationEntities) {
          if (row.Organizations.toLowerCase().includes(org.toLowerCase())) {
            relevanceScore += 1;
            break;
          }
        }
      }

      // Check for location matches
      if (row.Locations) {
        for (const location of locationEntities) {
          if (row.Locations.toLowerCase().includes(location.toLowerCase())) {
            relevanceScore += 1;
            break;
          }
        }
      }

      // Check for category match
      if (
        row.Themes &&
        category &&
        row.Themes.toLowerCase().includes(category.toLowerCase())
      ) {
        relevanceScore += 1;
      }

      return {
        id: documentId,
        input_id: triggerItemId, // Add input_id from the triggering event
        category: category || "",
        domain: row.domain || "",
        locations: row.Locations
          ? row.Locations.split(";").filter(Boolean)
          : [],
        organizations: row.Organizations
          ? row.Organizations.split(";")
              .filter(Boolean)
              .map((org) => org.toLowerCase())
          : [],
        persons: row.Persons
          ? row.Persons.split(";")
              .filter(Boolean)
              .map((person) => person.toLowerCase())
          : [],
        publishDate: publishDate,
        retrievedAt: retrievedAt,
        source: row.source || "",
        sourceArticleId: sourceArticleId || triggerItemId, // Use trigger ID here too
        summary: row.DocumentIdentifier || "",
        themes: row.Themes ? row.Themes.split(";").filter(Boolean) : [],
        title: row.title || "",
        toneScore: row.tone !== null ? String(row.tone) : "",
        relevanceScore: relevanceScore,
      };
    });

    // Create or verify the DynamoDB table exists
    const tableExists = await ensureTableExists(dynamoTableName);
    if (!tableExists) {
      console.error(
        `❌ Failed to create or verify DynamoDB table: ${dynamoTableName}`
      );
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: `Failed to create or verify DynamoDB table: ${dynamoTableName}`,
        }),
      };
    }

    // ADDED: Clear the DynamoDB table before storing new data
    console.log(
      `Clearing existing data from DynamoDB table: ${dynamoTableName}`
    );
    const tableCleaned = await clearDynamoTable(dynamoTableName);
    if (!tableCleaned) {
      console.error(`❌ Failed to clear DynamoDB table: ${dynamoTableName}`);
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: `Failed to clear DynamoDB table: ${dynamoTableName}`,
        }),
      };
    }
    console.log(`✅ Successfully cleared DynamoDB table: ${dynamoTableName}`);

    console.log(`Writing ${formattedResults.length} articles to DynamoDB...`);

    // Write the items to DynamoDB in batches
    const batchSize = 25; // DynamoDB batch write limit
    let successCount = 0;

    for (let i = 0; i < formattedResults.length; i += batchSize) {
      const batch = formattedResults.slice(i, i + batchSize);

      const writeParams = {
        RequestItems: {
          [dynamoTableName]: batch.map((item) => ({
            PutRequest: {
              Item: item,
            },
          })),
        },
      };

      try {
        await dynamo.batchWrite(writeParams).promise();
        successCount += batch.length;
        console.log(
          `✅ Successfully wrote batch ${
            Math.floor(i / batchSize) + 1
          } to DynamoDB (${successCount}/${formattedResults.length})`
        );
      } catch (writeError) {
        console.error(`❌ Error writing to DynamoDB:`, writeError);
        // Continue with next batch even if one fails
      }
    }

    console.log(
      `✅ Completed writing to DynamoDB: ${successCount}/${formattedResults.length} articles stored`
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Related articles retrieved for credibility analysis",
        count: formattedResults.length,
        articles: formattedResults,
      }),
    };
  } catch (err) {
    console.error("❌ Error in Lambda:", err);

    // If the error is about byte limits, return a more helpful error
    if (err.message && err.message.includes("bytes billed")) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: "BigQuery free tier limit exceeded",
          message:
            "This query would exceed free tier limits. Try with fewer entities or sources, or a shorter date range.",
          details: err.message,
        }),
      };
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message,
        stack: err.stack,
      }),
    };
  }
};
