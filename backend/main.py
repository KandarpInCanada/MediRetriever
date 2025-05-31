from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import logging
import uvicorn
from rag_pipeline import RAGPipeline
from config import API_HOST, API_PORT

# Setup logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Medical RAG API",
    description="A RAG API for medical literature using SageMaker and Pinecone",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize RAG pipeline with error handling
try:
    rag_pipeline = RAGPipeline()
    logger.info("RAG Pipeline initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize RAG Pipeline: {e}")
    rag_pipeline = None

# Pydantic models - ALIGNED WITH FRONTEND
class SourceModel(BaseModel):
    content: str
    metadata: Dict[str, Any]
    score: Optional[float] = Field(default=0.0)

class QueryRequest(BaseModel):
    question: str = Field(..., min_length=1, description="The medical question to ask")
    top_k: Optional[int] = Field(default=5, ge=1, le=20, description="Number of sources to retrieve")
    document_filter: Optional[str] = Field(default=None, description="Filter by specific document name")
    max_length: Optional[int] = Field(default=512, ge=50, le=2048, description="Maximum response length")

class QueryResponse(BaseModel):
    answer: str
    sources: List[SourceModel]
    confidence: float = Field(..., ge=0.0, le=1.0)
    num_sources: int = Field(..., ge=0)

class DocumentResponse(BaseModel):
    success: bool
    message: str
    chunks_processed: int
    document_name: Optional[str] = None

class HealthResponse(BaseModel):
    status: str
    message: str
    rag_pipeline: str
    timestamp: str

class ErrorResponse(BaseModel):
    error: bool = True
    message: str
    detail: Optional[str] = None

@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """Custom exception handler to return consistent error format"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": True,
            "message": exc.detail,
            "status_code": exc.status_code
        }
    )

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """Handle unexpected exceptions"""
    logger.exception("Unexpected error occurred")
    return JSONResponse(
        status_code=500,
        content={
            "error": True,
            "message": "Internal server error",
            "detail": str(exc) if app.debug else "An unexpected error occurred"
        }
    )

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    from datetime import datetime
    
    pipeline_status = "healthy" if rag_pipeline is not None else "unhealthy"
    return HealthResponse(
        status=pipeline_status,
        message="Medical RAG API is running",
        rag_pipeline=pipeline_status,
        timestamp=datetime.utcnow().isoformat()
    )

@app.post("/ingest", response_model=DocumentResponse)
async def ingest_document(
    file: UploadFile = File(..., description="PDF file to ingest"),
    document_name: Optional[str] = Form(None, description="Optional document name override")
):
    """Ingest a PDF document into the RAG system"""
    try:
        if rag_pipeline is None:
            raise HTTPException(status_code=503, detail="RAG pipeline not available")
            
        # Validate file
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file provided")
            
        if not file.filename.lower().endswith('.pdf'):
            raise HTTPException(status_code=400, detail="Only PDF files are supported")

        # Use provided name or derive from filename
        doc_name = document_name or file.filename.replace('.pdf', '')
        
        # Read file content
        pdf_content = await file.read()
        if not pdf_content:
            raise HTTPException(status_code=400, detail="Empty file uploaded")

        # Process document
        logger.info(f"Processing document: {doc_name}")
        result = rag_pipeline.ingest_document(pdf_content, doc_name)
        
        if not result.get("success", False):
            raise HTTPException(
                status_code=400, 
                detail=result.get("message", "Failed to process document")
            )

        return DocumentResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error during document ingestion")
        raise HTTPException(status_code=500, detail=f"Failed to process document: {str(e)}")

@app.post("/query", response_model=QueryResponse)
async def query_documents(request: QueryRequest):
    """Query the RAG system with a medical question"""
    try:
        if rag_pipeline is None:
            raise HTTPException(status_code=503, detail="RAG pipeline not available")
            
        # Validate question
        if not request.question.strip():
            raise HTTPException(status_code=400, detail="Question cannot be empty")

        logger.info(f"Processing query: {request.question[:100]}...")
        logger.info(f"Parameters: top_k={request.top_k}, filter={request.document_filter}, max_length={request.max_length}")
        
        # Process query through RAG pipeline
        try:
            result = rag_pipeline.query(
                question=request.question.strip(),
                top_k=request.top_k,
                document_filter=request.document_filter,
                max_length=request.max_length
            )
            
            logger.info(f"RAG result type: {type(result)}")
            
            if not isinstance(result, dict):
                logger.error(f"RAG pipeline returned {type(result)}, expected dict")
                raise HTTPException(status_code=500, detail="Invalid response format from RAG pipeline")
                
        except Exception as rag_error:
            logger.error(f"RAG pipeline error: {str(rag_error)}")
            raise HTTPException(status_code=500, detail=f"RAG processing failed: {str(rag_error)}")

        # Validate and structure the response
        try:
            validated_result = validate_rag_response(result)
            response = QueryResponse(**validated_result)
            
            logger.info(f"Successfully processed query. Answer length: {len(response.answer)}, Sources: {response.num_sources}")
            return response
            
        except Exception as validation_error:
            logger.error(f"Response validation error: {str(validation_error)}")
            logger.error(f"Result structure: {result}")
            raise HTTPException(status_code=500, detail=f"Response formatting failed: {str(validation_error)}")

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error during query processing")
        raise HTTPException(status_code=500, detail=f"Query processing failed: {str(e)}")

def validate_rag_response(result: Dict[str, Any]) -> Dict[str, Any]:
    """Validate and ensure RAG response matches expected format"""
    validated = {}
    
    # Validate answer
    answer = result.get('answer', '')
    if not answer or not isinstance(answer, str):
        logger.warning("Invalid or missing answer in RAG response")
        validated['answer'] = "I apologize, but I couldn't generate a proper response to your question."
    else:
        validated['answer'] = answer.strip()
    
    # Validate sources
    sources = result.get('sources', [])
    if not isinstance(sources, list):
        logger.warning("Invalid sources format in RAG response")
        sources = []
    
    validated_sources = []
    for i, source in enumerate(sources):
        try:
            if isinstance(source, dict):
                validated_source = {
                    "content": str(source.get('content', '')),
                    "metadata": source.get('metadata', {}),
                    "score": float(source.get('score', 0.0))
                }
                validated_sources.append(validated_source)
            else:
                logger.warning(f"Invalid source format at index {i}: {type(source)}")
        except Exception as e:
            logger.warning(f"Error processing source {i}: {e}")
    
    validated['sources'] = validated_sources
    
    # Validate confidence
    confidence = result.get('confidence', 0.0)
    try:
        confidence = float(confidence)
        confidence = max(0.0, min(1.0, confidence))  # Clamp between 0 and 1
    except (ValueError, TypeError):
        logger.warning(f"Invalid confidence value: {confidence}")
        confidence = 0.0
    
    validated['confidence'] = confidence
    
    # Validate num_sources
    num_sources = result.get('num_sources', len(validated_sources))
    try:
        num_sources = int(num_sources)
    except (ValueError, TypeError):
        logger.warning(f"Invalid num_sources value: {num_sources}")
        num_sources = len(validated_sources)
    
    validated['num_sources'] = num_sources
    
    return validated

@app.get("/query")
async def simple_query(
    q: str = Query(..., description="The medical question to ask"),
    top_k: int = Query(5, ge=1, le=20, description="Number of sources to retrieve"),
    document_filter: Optional[str] = Query(None, description="Filter by document name"),
    max_length: int = Query(512, ge=50, le=2048, description="Maximum response length")
):
    """Simple GET endpoint for queries (alternative to POST)"""
    request = QueryRequest(
        question=q,
        top_k=top_k,
        document_filter=document_filter,
        max_length=max_length
    )
    return await query_documents(request)

@app.delete("/documents/{document_name}")
async def delete_document(document_name: str):
    """Delete all chunks of a specific document"""
    try:
        if rag_pipeline is None:
            raise HTTPException(status_code=503, detail="RAG pipeline not available")
            
        if not document_name.strip():
            raise HTTPException(status_code=400, detail="Document name cannot be empty")
            
        logger.info(f"Deleting document: {document_name}")
        result = rag_pipeline.delete_document(document_name.strip())
        
        if not result.get("success", False):
            raise HTTPException(
                status_code=400, 
                detail=result.get("message", f"Failed to delete document: {document_name}")
            )
            
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error during document deletion")
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {str(e)}")

@app.get("/stats")
async def get_index_stats():
    """Get vector store statistics"""
    try:
        if rag_pipeline is None:
            raise HTTPException(status_code=503, detail="RAG pipeline not available")
            
        stats = rag_pipeline.get_index_stats()
        return {"stats": stats, "timestamp": __import__('datetime').datetime.utcnow().isoformat()}
        
    except Exception as e:
        logger.exception("Unexpected error fetching statistics")
        raise HTTPException(status_code=500, detail=f"Failed to fetch statistics: {str(e)}")

@app.get("/")
async def root():
    """Root endpoint with API information"""
    return {
        "message": "Medical RAG API",
        "version": "1.0.0",
        "status": "healthy" if rag_pipeline is not None else "RAG pipeline unavailable",
        "endpoints": {
            "health": "GET /health - Health check",
            "ingest": "POST /ingest - Upload PDF document",  
            "query": "POST /query - Ask medical questions",
            "simple_query": "GET /query - Simple query interface",
            "delete": "DELETE /documents/{document_name} - Delete document",
            "stats": "GET /stats - Get system statistics",
            "docs": "GET /docs - API documentation"
        },
        "models": {
            "llm": "epfl-llm/meditron-7b (SageMaker)",
            "embeddings": "NeuML/pubmedbert-base-embeddings (SageMaker)", 
            "vector_store": "Pinecone"
        }
    }

if __name__ == "__main__":
    uvicorn.run(
        "main:app", 
        host=API_HOST, 
        port=API_PORT, 
        reload=True, 
        log_level="info",
        access_log=True
    )