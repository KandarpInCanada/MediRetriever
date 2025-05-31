import { type NextRequest, NextResponse } from "next/server"
import { SageMakerRuntimeClient, InvokeEndpointCommand } from "@aws-sdk/client-sagemaker-runtime"
import { Pinecone } from "@pinecone-database/pinecone"

// Initialize SageMaker client
const sagemakerClient = new SageMakerRuntimeClient({
  region: process.env.AWS_REGION || "us-east-1",
})

// Prompt template
const promptTemplate = `Use the following pieces of information to answer the user's question.
If you don't know the answer, just say that you don't know, don't try to make up an answer.

Context: {context}
Question: {question}

Only return the helpful answer below and nothing else.
Helpful answer:`

// Function to get Pinecone client with error handling
function getPineconeClient() {
  try {
    if (!process.env.PINECONE_API_KEY) {
      throw new Error("PINECONE_API_KEY environment variable is not set")
    }
    return new Pinecone({
      apiKey: process.env.PINECONE_API_KEY,
    })
  } catch (error) {
    console.error("Failed to initialize Pinecone client:", error)
    throw error
  }
}

// Function to validate environment variables
function validateEnvironment() {
  const required = ["PINECONE_API_KEY", "PINECONE_INDEX_NAME", "SAGEMAKER_EMBEDDING_ENDPOINT", "SAGEMAKER_LLM_ENDPOINT"]

  const missing = required.filter((key) => !process.env[key])

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`)
  }
}

// Function to normalize embedding vector dimensions
function normalizeEmbedding(embedding: number[], targetDimension: number): number[] {
  if (embedding.length === targetDimension) {
    return embedding
  }

  if (embedding.length > targetDimension) {
    // Truncate if too long
    console.warn(`Truncating embedding from ${embedding.length} to ${targetDimension} dimensions`)
    return embedding.slice(0, targetDimension)
  } else {
    // Pad with zeros if too short
    console.warn(`Padding embedding from ${embedding.length} to ${targetDimension} dimensions`)
    return [...embedding, ...new Array(targetDimension - embedding.length).fill(0)]
  }
}

export async function POST(request: NextRequest) {
  try {
    // Validate environment variables first
    validateEnvironment()

    const { query } = await request.json()

    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return NextResponse.json(
        {
          error: "Valid query string is required",
        },
        { status: 400 },
      )
    }

    console.log("Processing query:", query)

    // Step 1: Create embedding for the query using SageMaker
    console.log("Creating embedding for query using SageMaker...")

    let queryEmbedding: number[]

    try {
      const embeddingPayload = {
        inputs: query.trim(),
      }

      const embeddingCommand = new InvokeEndpointCommand({
        EndpointName: process.env.SAGEMAKER_EMBEDDING_ENDPOINT!,
        ContentType: "application/json",
        Body: JSON.stringify(embeddingPayload),
        Accept: "application/json",
      })

      const embeddingResponse = await sagemakerClient.send(embeddingCommand)
      const embeddingResponseBody = JSON.parse(new TextDecoder().decode(embeddingResponse.Body))

      // Extract embedding vector with better error handling
      if (embeddingResponseBody.embeddings && Array.isArray(embeddingResponseBody.embeddings)) {
        queryEmbedding = embeddingResponseBody.embeddings[0]
      } else if (embeddingResponseBody.vectors && Array.isArray(embeddingResponseBody.vectors)) {
        queryEmbedding = embeddingResponseBody.vectors[0]
      } else if (Array.isArray(embeddingResponseBody)) {
        queryEmbedding = embeddingResponseBody[0]
      } else if (Array.isArray(embeddingResponseBody)) {
        queryEmbedding = embeddingResponseBody
      } else {
        throw new Error("Unexpected embedding response format")
      }

      if (!Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
        throw new Error("Invalid embedding vector received from SageMaker")
      }

      console.log(`Generated embedding with ${queryEmbedding.length} dimensions`)
    } catch (error) {
      console.error("Error creating embedding:", error)
      return NextResponse.json(
        {
          error: "Failed to create embedding",
          details: error instanceof Error ? error.message : "Unknown embedding error",
        },
        { status: 500 },
      )
    }

    // Step 2: Initialize Pinecone and check index
    console.log("Initializing Pinecone connection...")

    let pinecone: Pinecone
    let index: any

    try {
      pinecone = getPineconeClient()

      // Check if index exists and get its stats
      const indexName = process.env.PINECONE_INDEX_NAME!

      try {
        const indexStats = await pinecone.describeIndex(indexName)
        console.log("Index found:", indexName)

        // Get the expected dimension from index stats with proper type checking
        const expectedDimension = indexStats.dimension

        if (typeof expectedDimension !== "number") {
          throw new Error("Could not determine index dimension")
        }

        console.log(`Index expects ${expectedDimension} dimensions, got ${queryEmbedding.length}`)

        // Normalize embedding to match index dimension
        if (queryEmbedding.length !== expectedDimension) {
          queryEmbedding = normalizeEmbedding(queryEmbedding, expectedDimension)
        }

        index = pinecone.index(indexName)
      } catch (indexError: any) {
        if (indexError.status === 404) {
          return NextResponse.json(
            {
              error: "Pinecone index not found",
              details: `Index "${indexName}" does not exist. Please create the index first.`,
            },
            { status: 404 },
          )
        }
        throw indexError
      }
    } catch (error: any) {
      console.error("Error initializing Pinecone:", error)
      return NextResponse.json(
        {
          error: "Failed to connect to Pinecone",
          details: error.message || "Unknown Pinecone error",
        },
        { status: 500 },
      )
    }

    // Step 3: Search for similar vectors
    console.log("Searching Pinecone for similar vectors...")

    let searchResponse: any

    try {
      searchResponse = await index.query({
        vector: queryEmbedding,
        topK: 1,
        includeMetadata: true,
        includeValues: false,
      })

      if (!searchResponse.matches || searchResponse.matches.length === 0) {
        return NextResponse.json(
          {
            error: "No relevant documents found",
            details: "The query did not match any documents in the knowledge base.",
          },
          { status: 404 },
        )
      }
    } catch (error: any) {
      console.error("Error querying Pinecone:", error)

      if (error.message && error.message.includes("dimension")) {
        return NextResponse.json(
          {
            error: "Vector dimension mismatch",
            details: `The embedding dimension doesn't match the Pinecone index. Please check your embedding model configuration.`,
          },
          { status: 400 },
        )
      }

      return NextResponse.json(
        {
          error: "Failed to search knowledge base",
          details: error.message || "Unknown search error",
        },
        { status: 500 },
      )
    }

    // Step 4: Extract relevant document
    const relevantDoc = searchResponse.matches[0]

    if (!relevantDoc || !relevantDoc.metadata) {
      return NextResponse.json(
        {
          error: "No valid document metadata found",
        },
        { status: 404 },
      )
    }

    // Step 5: Prepare context and prompt
    const context = String(relevantDoc.metadata.text || relevantDoc.metadata.content || "")
    const sourceDoc = String(relevantDoc.metadata.source || relevantDoc.id)

    if (!context.trim()) {
      return NextResponse.json(
        {
          error: "No content found in matched document",
        },
        { status: 404 },
      )
    }

    const formattedPrompt = promptTemplate.replace("{context}", context).replace("{question}", query)

    console.log("Invoking SageMaker LLM endpoint...")

    // Step 6: Generate response using SageMaker LLM
    let answer: string

    try {
      const payload = {
        inputs: formattedPrompt,
        parameters: {
          max_new_tokens: 1024,
          temperature: 0.1,
          top_k: 50,
          top_p: 0.9,
          repetition_penalty: 1.1,
          do_sample: true,
        },
      }

      const command = new InvokeEndpointCommand({
        EndpointName: process.env.SAGEMAKER_LLM_ENDPOINT!,
        ContentType: "application/json",
        Body: JSON.stringify(payload),
        Accept: "application/json",
      })

      const response = await sagemakerClient.send(command)
      const responseBody = JSON.parse(new TextDecoder().decode(response.Body))

      // Extract answer with better error handling
      if (responseBody.generated_text) {
        answer = responseBody.generated_text
      } else if (responseBody[0] && responseBody[0].generated_text) {
        answer = responseBody[0].generated_text
      } else if (responseBody.outputs) {
        answer = responseBody.outputs
      } else {
        throw new Error("Unexpected LLM response format")
      }

      // Clean up the answer
      if (answer.includes("Helpful answer:")) {
        answer = answer.split("Helpful answer:")[1]?.trim() || answer
      }

      if (!answer.trim()) {
        throw new Error("Empty response from LLM")
      }
    } catch (error) {
      console.error("Error generating response:", error)
      return NextResponse.json(
        {
          error: "Failed to generate response",
          details: error instanceof Error ? error.message : "Unknown LLM error",
        },
        { status: 500 },
      )
    }

    // Step 7: Return successful response
    const responseData = {
      answer: answer.trim(),
      source_document: context,
      doc: sourceDoc,
      similarity_score: relevantDoc.score || 0,
      query: query,
      timestamp: new Date().toISOString(),
    }

    console.log("Response generated successfully")
    return NextResponse.json(responseData)
  } catch (error) {
    console.error("Unexpected error processing request:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

// Health check endpoint
export async function GET() {
  try {
    validateEnvironment()
    return NextResponse.json({
      status: "OK",
      message: "SageMaker-Pinecone API is running",
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: "ERROR",
        message: "Configuration error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
