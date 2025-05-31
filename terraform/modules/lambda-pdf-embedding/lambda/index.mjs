import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { TextractClient, DetectDocumentTextCommand } from "@aws-sdk/client-textract";
import { SageMakerRuntimeClient, InvokeEndpointCommand } from "@aws-sdk/client-sagemaker-runtime";
import { Pinecone } from "@pinecone-database/pinecone";
import { v4 as uuidv4 } from "uuid";

// === Environment Variables ===
const {
  PINECONE_API_KEY,
  PINECONE_INDEX,
  SAGEMAKER_ENDPOINT,
  EMBEDDING_DIMENSION // Optional: specify dimension, will auto-detect if not provided
} = process.env;

// Validate required environment variables
const requiredEnvVars = {
  PINECONE_API_KEY,
  PINECONE_INDEX,
  SAGEMAKER_ENDPOINT
};

for (const [key, value] of Object.entries(requiredEnvVars)) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

// === Clients ===
const s3 = new S3Client({});
const textract = new TextractClient({});
const sagemaker = new SageMakerRuntimeClient({});

// Initialize Pinecone client
const pinecone = new Pinecone({ 
  apiKey: PINECONE_API_KEY
});

// === Helper Functions ===
const chunkText = (text, maxChars = 200) => { // Reduced to 200 characters
  const words = text.split(' ');
  const chunks = [];
  let currentChunk = [];
  let currentLength = 0;
  
  for (const word of words) {
    if (currentLength + word.length + 1 > maxChars && currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
      currentChunk = [word];
      currentLength = word.length;
    } else {
      currentChunk.push(word);
      currentLength += word.length + 1;
    }
  }
  
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }
  
  return chunks;
};

const getEmbedding = async (text, retries = 3) => {
  // Clean and validate input text
  const cleanText = text.trim();
  if (!cleanText) {
    throw new Error("Empty text provided for embedding");
  }

  // Limit text length (adjust based on your model's limits)
  const maxLength = 512; // tokens, adjust as needed
  const truncatedText = cleanText.length > maxLength ? 
    cleanText.substring(0, maxLength) : cleanText;

  const inputBody = JSON.stringify({ 
    inputs: truncatedText,
    // Add any other parameters your model expects
  });
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Embedding attempt ${attempt}/${retries} for text length: ${truncatedText.length}`);
      
      const sagemakerResponse = await sagemaker.send(
        new InvokeEndpointCommand({
          EndpointName: SAGEMAKER_ENDPOINT,
          ContentType: "application/json",
          Body: Buffer.from(inputBody),
        })
      );

      const embeddingResponse = Buffer.from(sagemakerResponse.Body).toString();
      console.log("Raw SageMaker response (first 200 chars):", embeddingResponse.substring(0, 200) + "...");
      
      let result;
      try {
        result = JSON.parse(embeddingResponse);
      } catch (parseError) {
        console.error("Failed to parse SageMaker response as JSON:", parseError);
        throw new Error(`Invalid JSON response from SageMaker: ${parseError.message}`);
      }
      
      let embedding = result.embedding || result[0] || result;
      console.log("Initial embedding type:", typeof embedding, "Array:", Array.isArray(embedding));

      // Handle nested arrays - flatten to get the actual embedding array
      let flattenCount = 0;
      while (Array.isArray(embedding) && Array.isArray(embedding[0]) && flattenCount < 5) {
        console.log(`Flattening nested array, level ${flattenCount + 1}, current length:`, embedding.length);
        embedding = embedding[0];
        flattenCount++;
      }

      console.log("After flattening - Type:", typeof embedding, "Array:", Array.isArray(embedding));

      // If it's still not an array at this point, something is wrong
      if (!Array.isArray(embedding)) {
        // Handle the case where embedding might be a comma-separated string
        if (typeof embedding === 'string') {
          console.log("Embedding received as string, attempting to parse...");
          // Make sure we have the complete string, not truncated
          const fullStringMatch = embeddingResponse.match(/\[([-\d.,\s]+)\]/);
          if (fullStringMatch) {
            embedding = fullStringMatch[1].split(',').map(str => parseFloat(str.trim()));
            console.log("Successfully parsed string to array, length:", embedding.length);
          } else {
            throw new Error("Could not extract embedding array from string response");
          }
        } else {
          throw new Error(`Unexpected embedding format: ${typeof embedding}`);
        }
      }

      // Validate that we have an array of numbers
      if (!Array.isArray(embedding)) {
        throw new Error("Embedding is not an array after processing");
      }
      
      // Convert all values to numbers and validate
      const numericEmbedding = embedding.map((value, index) => {
        let num;
        if (typeof value === 'string') {
          num = parseFloat(value.trim());
        } else if (typeof value === 'number') {
          num = value;
        } else {
          throw new Error(`Invalid value type at index ${index}: ${typeof value} (${value})`);
        }
        
        if (isNaN(num) || !isFinite(num)) {
          throw new Error(`Invalid number at index ${index}: ${value} -> ${num}`);
        }
        return num;
      });
      
      console.log(`Embedding successfully processed: ${numericEmbedding.length} dimensions`);
      console.log("First 5 values:", numericEmbedding.slice(0, 5));
      console.log("Last 5 values:", numericEmbedding.slice(-5));
      
      // Validate embedding dimension is reasonable
      if (numericEmbedding.length === 0) {
        throw new Error("Embedding array is empty");
      }
      
      if (numericEmbedding.length > 10000) {
        throw new Error(`Embedding dimension unusually large: ${numericEmbedding.length}`);
      }
      
      return numericEmbedding;
      
    } catch (error) {
      console.error(`Embedding attempt ${attempt} failed:`, {
        error: error.message,
        textLength: truncatedText.length,
        attempt,
        stack: error.stack
      });
      
      // If it's a parsing/format error and we have the raw response, try alternative parsing
      if (error.message.includes("Invalid number") && attempt === 1) {
        console.log("Attempting alternative parsing approach...");
        // This will be caught and retried in the next iteration
      }
      
      // If it's a worker died error, wait longer between retries
      if (error.message.includes("Worker died") && attempt < retries) {
        const delay = attempt * 5000; // 5s, 10s, 15s delays
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // If this is the last attempt, throw the error
      if (attempt === retries) {
        throw error;
      }
      
      // For other errors, wait a bit before retrying
      if (attempt < retries) {
        const delay = 2000; // 2 second delay
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
};

// Function to ensure index exists or create it
const ensureIndexExists = async () => {
  try {
    console.log(`Checking if index '${PINECONE_INDEX}' exists...`);
    
    // Try to get index stats to check if it exists
    const index = pinecone.index(PINECONE_INDEX);
    await index.describeIndexStats();
    console.log(`Index '${PINECONE_INDEX}' exists and is accessible`);
    return index;
    
  } catch (error) {
    if (error.status === 404 || error.message.includes('404') || error.message.includes('not found')) {
      console.log(`Index '${PINECONE_INDEX}' not found. Creating new index...`);
      
      // Determine embedding dimension
      let dimension = parseInt(EMBEDDING_DIMENSION) || null;
      
      // If dimension not provided, try to get it from a sample embedding
      if (!dimension) {
        console.log("EMBEDDING_DIMENSION not set, attempting to determine from sample embedding...");
        try {
          const sampleEmbedding = await getEmbedding("sample text for dimension detection");
          dimension = sampleEmbedding.length;
          console.log(`Detected embedding dimension: ${dimension}`);
        } catch (embeddingError) {
          console.warn("Could not determine dimension from sample embedding, using default 384");
          dimension = 384;
        }
      }
      
      try {
        // Create the index with serverless configuration
        await pinecone.createIndex({
          name: PINECONE_INDEX,
          dimension: dimension,
          metric: 'cosine',
          spec: {
            serverless: {
              cloud: 'aws',
              region: 'us-east-1'
            }
          }
        });
        
        console.log(`Index '${PINECONE_INDEX}' created successfully with dimension ${dimension}`);
      } catch (createError) {
        // If serverless fails, try with pod-based configuration
        console.log("Serverless creation failed, trying pod-based configuration...");
        await pinecone.createIndex({
          name: PINECONE_INDEX,
          dimension: dimension,
          metric: 'cosine',
          spec: {
            pod: {
              environment: 'us-east-1-aws',
              podType: 'p1.x1'
            }
          }
        });
        console.log(`Index '${PINECONE_INDEX}' created successfully with pod configuration`);
      }
      
      // Wait for index to be ready
      console.log("Waiting for index to be ready...");
      let ready = false;
      let attempts = 0;
      const maxAttempts = 60; // 10 minutes max wait time
      
      while (!ready && attempts < maxAttempts) {
        try {
          await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
          const index = pinecone.index(PINECONE_INDEX);
          await index.describeIndexStats();
          ready = true;
          console.log("Index is ready!");
        } catch (waitError) {
          attempts++;
          console.log(`Index not ready yet, attempt ${attempts}/${maxAttempts}...`);
          if (attempts % 6 === 0) { // Log every minute
            console.log(`Still waiting for index to be ready... (${attempts * 10} seconds elapsed)`);
          }
        }
      }
      
      if (!ready) {
        throw new Error("Index creation timed out - index may still be initializing. Please try again in a few minutes.");
      }
      
      return pinecone.index(PINECONE_INDEX);
      
    } else {
      console.error("Error accessing Pinecone index:", error);
      throw new Error(`Pinecone connection failed: ${error.message}`);
    }
  }
};

// === Lambda Handler ===
export const handler = async (event) => {
  console.log("Lambda function started", { event });
  
  try {
    // Ensure Pinecone index exists (create if needed)
    const index = await ensureIndexExists();
    
    // Validate event structure
    if (!event.Records || !event.Records[0]) {
      throw new Error("Invalid event structure - no S3 records found");
    }

    const record = event.Records[0];
    const bucket = record.s3?.bucket?.name;
    const key = record.s3?.object?.key;

    if (!bucket || !key) {
      throw new Error("Missing S3 bucket or key in event record");
    }

    const decodedKey = decodeURIComponent(key.replace(/\+/g, ' '));
    console.log("Processing file:", { bucket, key: decodedKey });

    // === Extract text using AWS Textract ===
    console.log("Extracting text using AWS Textract...");
    let textractResponse;
    try {
      textractResponse = await textract.send(
        new DetectDocumentTextCommand({
          Document: {
            S3Object: {
              Bucket: bucket,
              Name: decodedKey,
            },
          },
        })
      );
    } catch (textractError) {
      console.error("Textract extraction failed:", textractError);
      throw new Error(`Failed to extract text with Textract: ${textractError.message}`);
    }

    // Extract text from Textract response
    const extractedText = textractResponse.Blocks
      ?.filter(block => block.BlockType === 'LINE')
      ?.map(block => block.Text)
      ?.join('\n') || '';

    if (!extractedText.trim()) {
      console.warn("No text extracted from document");
      return { 
        statusCode: 400, 
        body: JSON.stringify({ error: "No text extracted from document" })
      };
    }

    console.log("Text extracted, length:", extractedText.length);

    // === Split text into chunks ===
    const textChunks = chunkText(extractedText, 200); // Very small chunks for stability
    console.log(`Text split into ${textChunks.length} chunks`);

    // === Process each chunk with better error handling ===
    const vectorIds = [];
    const embeddings = [];
    const failedChunks = [];
    
    for (let i = 0; i < textChunks.length; i++) {
      const chunk = textChunks[i];
      console.log(`Processing chunk ${i + 1}/${textChunks.length}, length: ${chunk.length}`);
      
      try {
        const embedding = await getEmbedding(chunk);
        embeddings.push({
          id: uuidv4(),
          values: embedding,
          metadata: {
            source: decodedKey,
            chunkIndex: i,
            totalChunks: textChunks.length,
            textLength: chunk.length,
            text: chunk.substring(0, 200) + (chunk.length > 200 ? '...' : ''),
            timestamp: new Date().toISOString()
          }
        });
        console.log(`Successfully processed chunk ${i + 1}`);
        
      } catch (embeddingError) {
        console.error(`Failed to get embedding for chunk ${i}:`, embeddingError);
        failedChunks.push({ index: i, error: embeddingError.message });
        
        // Continue processing other chunks instead of failing completely
        continue;
      }
    }

    if (embeddings.length === 0) {
      throw new Error("No embeddings were successfully generated");
    }

    // === Batch upsert to Pinecone ===
    console.log(`Upserting ${embeddings.length} embeddings to Pinecone...`);
    try {
      await index.upsert(embeddings);
      vectorIds.push(...embeddings.map(e => e.id));
    } catch (pineconeError) {
      console.error("Pinecone upsert failed:", pineconeError);
      throw new Error(`Pinecone upsert failed: ${pineconeError.message}`);
    }

    console.log("Successfully processed file:", vectorIds);

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: "Embeddings stored successfully",
        vectorIds: vectorIds,
        totalChunks: textChunks.length,
        successfulChunks: embeddings.length,
        failedChunks: failedChunks.length,
        failedDetails: failedChunks,
        totalTextLength: extractedText.length,
        embeddingDimension: embeddings[0]?.values?.length || 0,
        indexCreated: false // Will be true if index was created during this execution
      })
    };

  } catch (err) {
    console.error("Unhandled error in Lambda:", err);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: "An error occurred during processing",
        message: err.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};