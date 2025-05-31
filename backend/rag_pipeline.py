from typing import List, Dict, Any, Optional, Union
import logging
from sagemaker_clients import SageMakerLLMClient, SageMakerEmbeddingClient
from pinecone_client import PineconeVectorStore
from document_processor import DocumentProcessor

# Setup logger
logger = logging.getLogger(__name__)

class RAGPipeline:
    """
    Retrieval-Augmented Generation Pipeline for Medical Literature
    Handles document ingestion, retrieval, and answer generation
    """
    
    def __init__(self):
        """Initialize all RAG components"""
        try:
            logger.info("Initializing RAG Pipeline components...")
            
            self.llm_client = SageMakerLLMClient()
            logger.info("✓ LLM client initialized")
            
            self.embedding_client = SageMakerEmbeddingClient() 
            logger.info("✓ Embedding client initialized")
            
            self.vector_store = PineconeVectorStore()
            logger.info("✓ Vector store initialized")
            
            self.doc_processor = DocumentProcessor()
            logger.info("✓ Document processor initialized")
            
            # Token management constants
            self.MAX_TOTAL_TOKENS = 2048
            self.BASE_PROMPT_TOKENS = 150  # Approximate tokens for base prompt structure
            self.SAFETY_BUFFER = 50  # Safety buffer for token estimation
            
            logger.info("RAG Pipeline initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize RAG Pipeline: {e}")
            raise RuntimeError(f"RAG Pipeline initialization failed: {str(e)}") from e
    
    def _estimate_tokens(self, text: str) -> int:
        """
        Rough estimation of token count (approximately 4 characters per token)
        This is a conservative estimate - actual tokenization may vary
        """
        return len(text) // 4
    
    def _truncate_context_to_fit_tokens(self, context_parts: List[str], query: str, max_new_tokens: int) -> str:
        """
        Truncate context to fit within token limits while preserving the most relevant information
        """
        # Calculate available tokens for context
        available_tokens = (self.MAX_TOTAL_TOKENS - max_new_tokens - 
                          self.BASE_PROMPT_TOKENS - self.SAFETY_BUFFER - 
                          self._estimate_tokens(query))
        
        if available_tokens <= 0:
            logger.warning("Very little space available for context due to token constraints")
            available_tokens = 100  # Minimum context
        
        logger.info(f"Available tokens for context: {available_tokens}")
        
        # Try to fit as much context as possible, prioritizing earlier (more relevant) chunks
        truncated_parts = []
        current_tokens = 0
        
        for i, part in enumerate(context_parts):
            part_tokens = self._estimate_tokens(part)
            
            if current_tokens + part_tokens <= available_tokens:
                # Full part fits
                truncated_parts.append(part)
                current_tokens += part_tokens
            else:
                # Try to fit a truncated version of this part
                remaining_tokens = available_tokens - current_tokens
                if remaining_tokens > 50:  # Only if there's reasonable space left
                    # Estimate how much of the part we can include
                    chars_available = remaining_tokens * 4  # Rough conversion back to characters
                    truncated_part = part[:chars_available] + "... [truncated]"
                    truncated_parts.append(truncated_part)
                break
        
        result = "\n\n".join(truncated_parts)
        final_tokens = self._estimate_tokens(result)
        
        logger.info(f"Context truncated to {final_tokens} estimated tokens from {len(context_parts)} parts")
        return result
    
    def ingest_document(self, pdf_content: bytes, document_name: str) -> Dict[str, Any]:
        """
        Ingest a PDF document into the RAG system
        
        Args:
            pdf_content: PDF file content as bytes
            document_name: Name identifier for the document
            
        Returns:
            Dict with success status, message, and processing details
        """
        try:
            logger.info(f"Starting document ingestion: {document_name}")
            
            # Validate inputs
            if not pdf_content:
                return {
                    "success": False,
                    "message": "PDF content is empty",
                    "chunks_processed": 0,
                    "document_name": document_name
                }
            
            if not document_name or not document_name.strip():
                return {
                    "success": False,
                    "message": "Document name is required",
                    "chunks_processed": 0,
                    "document_name": document_name
                }
            
            document_name = document_name.strip()
            
            # Process PDF into chunks
            logger.info(f"Processing PDF: {document_name}")
            chunks = self.doc_processor.process_pdf(pdf_content, document_name)
            
            if not chunks:
                return {
                    "success": False,
                    "message": "No text could be extracted from the PDF",
                    "chunks_processed": 0,
                    "document_name": document_name
                }
            
            logger.info(f"Extracted {len(chunks)} chunks from document")
            
            # Prepare texts and metadata
            texts = []
            metadata_list = []
            
            for i, chunk in enumerate(chunks):
                if isinstance(chunk, dict):
                    text = chunk.get('text', '').strip()
                    if text:  # Only include non-empty chunks
                        texts.append(text)
                        
                        # Ensure metadata has required fields
                        chunk_metadata = chunk.get('metadata', {})
                        chunk_metadata.update({
                            'document_name': document_name,
                            'chunk_index': i,
                            'chunk_id': f"{document_name}_chunk_{i}"
                        })
                        metadata_list.append(chunk_metadata)
                else:
                    logger.warning(f"Invalid chunk format at index {i}: {type(chunk)}")
            
            if not texts:
                return {
                    "success": False,
                    "message": "No valid text chunks found in PDF",
                    "chunks_processed": 0,
                    "document_name": document_name
                }
            
            # Generate embeddings
            logger.info(f"Generating embeddings for {len(texts)} chunks...")
            try:
                embeddings = self.embedding_client.get_embeddings(texts)
                if not embeddings or len(embeddings) != len(texts):
                    raise ValueError(f"Expected {len(texts)} embeddings, got {len(embeddings) if embeddings else 0}")
                    
            except Exception as e:
                logger.error(f"Failed to generate embeddings: {e}")
                return {
                    "success": False,
                    "message": f"Failed to generate embeddings: {str(e)}",
                    "chunks_processed": 0,
                    "document_name": document_name
                }
            
            # Store vectors in Pinecone
            logger.info("Storing vectors in Pinecone...")
            try:
                success = self.vector_store.upsert_vectors(texts, embeddings, metadata_list)
                
                if not success:
                    return {
                        "success": False,
                        "message": "Failed to store vectors in Pinecone",
                        "chunks_processed": 0,
                        "document_name": document_name
                    }
                    
            except Exception as e:
                logger.error(f"Failed to store vectors: {e}")
                return {
                    "success": False,
                    "message": f"Failed to store vectors: {str(e)}",
                    "chunks_processed": 0,
                    "document_name": document_name
                }
            
            logger.info(f"Successfully ingested document: {document_name} ({len(texts)} chunks)")
            return {
                "success": True,
                "message": f"Successfully processed and stored {len(texts)} chunks",
                "chunks_processed": len(texts),
                "document_name": document_name
            }
                
        except Exception as e:
            logger.error(f"Unexpected error during document ingestion: {e}")
            return {
                "success": False,
                "message": f"Document processing failed: {str(e)}",
                "chunks_processed": 0,
                "document_name": document_name
            }
    
    def retrieve_relevant_context(
        self, 
        query: str, 
        top_k: int = 5, 
        document_filter: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Retrieve relevant context documents for a query
        
        Args:
            query: The search query
            top_k: Number of top results to return
            document_filter: Optional document name to filter by
            
        Returns:
            List of relevant document chunks with metadata and scores
        """
        try:
            logger.info(f"Retrieving context for query: {query[:100]}...")
            
            # Validate query
            if not query or not query.strip():
                logger.warning("Empty query provided")
                return []
            
            # Generate query embedding
            try:
                query_embedding = self.embedding_client.get_embedding(query.strip())
                if not query_embedding:
                    logger.error("Failed to generate query embedding")
                    return []
                    
            except Exception as e:
                logger.error(f"Error generating query embedding: {e}")
                return []
            
            # Prepare search filter
            filter_dict = None
            if document_filter and document_filter.strip():
                filter_dict = {"document_name": {"$eq": document_filter.strip()}}
                logger.info(f"Applying document filter: {document_filter}")
            
            # Search for similar vectors
            try:
                results = self.vector_store.similarity_search(
                    query_embedding=query_embedding,
                    top_k=max(1, min(top_k, 20)),  # Ensure reasonable bounds
                    filter_dict=filter_dict
                )
                
                if not results:
                    logger.info("No similar documents found")
                    return []
                
                logger.info(f"Retrieved {len(results)} relevant documents")
                return results
                
            except Exception as e:
                logger.error(f"Error during similarity search: {e}")
                return []
            
        except Exception as e:
            logger.error(f"Unexpected error during context retrieval: {e}")
            return []
    
    def generate_answer(
        self, 
        query: str, 
        context_docs: List[Dict[str, Any]], 
        max_length: int = 512
    ) -> str:
        """
        Generate an answer using retrieved context documents
        
        Args:
            query: The original question
            context_docs: List of relevant context documents
            max_length: Maximum length of generated response
            
        Returns:
            Generated answer string
        """
        try:
            logger.info("Generating answer from context...")
            
            # Validate inputs
            if not query or not query.strip():
                return "I need a valid question to provide an answer."
            
            if not context_docs:
                return "I couldn't find relevant information in the knowledge base to answer your question. Please try rephrasing your question or check if the relevant documents have been uploaded."
            
            # Prepare context from retrieved documents
            context_parts = []
            seen_content = set()  # Avoid duplicate content
            
            for i, doc in enumerate(context_docs[:10]):  # Limit context to top 10 docs
                try:
                    # Extract text content
                    content = doc.get('text', '') or doc.get('content', '')
                    if not content or content in seen_content:
                        continue
                    
                    seen_content.add(content)
                    
                    # Get metadata
                    metadata = doc.get('metadata', {})
                    doc_name = metadata.get('document_name', 'Unknown Document')
                    page_num = metadata.get('page', 'Unknown')
                    
                    # Format context piece
                    context_piece = f"[Source {i+1}: {doc_name}, Page {page_num}]\n{content}"
                    context_parts.append(context_piece)
                    
                except Exception as e:
                    logger.warning(f"Error processing context document {i}: {e}")
                    continue
            
            if not context_parts:
                return "I found some potentially relevant information, but encountered issues processing it. Please try rephrasing your question."
            
            # Adjust max_length based on token constraints
            adjusted_max_length = min(max_length, 400)  # Conservative limit
            logger.info(f"Adjusted max_length to {adjusted_max_length} to prevent token overflow")
            
            # Truncate context to fit within token limits
            truncated_context = self._truncate_context_to_fit_tokens(
                context_parts, query, adjusted_max_length
            )
            
            # Create medical-focused prompt
            prompt = self._create_medical_prompt(query.strip(), truncated_context)
            
            # Log prompt length for debugging
            prompt_tokens = self._estimate_tokens(prompt)
            total_estimated_tokens = prompt_tokens + adjusted_max_length
            logger.info(f"Prompt tokens: ~{prompt_tokens}, Max new tokens: {adjusted_max_length}, "
                       f"Total estimated: {total_estimated_tokens}")
            
            if total_estimated_tokens > self.MAX_TOTAL_TOKENS:
                logger.warning(f"Estimated tokens ({total_estimated_tokens}) may exceed limit ({self.MAX_TOTAL_TOKENS})")
                # Further reduce max_length as fallback
                adjusted_max_length = max(50, self.MAX_TOTAL_TOKENS - prompt_tokens - self.SAFETY_BUFFER)
                logger.info(f"Further adjusted max_length to {adjusted_max_length}")
            
            # Generate response using LLM
            try:
                response = self.llm_client.generate_response(
                    prompt=prompt,
                    max_length=adjusted_max_length
                )
                
                if not response:
                    return "I apologize, but I couldn't generate a proper response. Please try rephrasing your question."
                
                # Clean and validate response
                response = str(response).strip()
                if len(response) < 10:  # Too short to be meaningful
                    return "I apologize, but I couldn't generate a sufficiently detailed response to your question."
                
                logger.info(f"Generated answer of length: {len(response)}")
                return response
                
            except Exception as e:
                logger.error(f"Error generating LLM response: {e}")
                return f"I encountered an issue while generating the response. Please try again or rephrase your question."
            
        except Exception as e:
            logger.error(f"Unexpected error during answer generation: {e}")
            return "I apologize, but I encountered an unexpected error while processing your question. Please try again."
    
    def _create_medical_prompt(self, query: str, context: str) -> str:
        """Create a well-structured prompt for medical question answering"""
        # More concise prompt to save tokens
        return f"""You are a medical AI assistant. Based on the medical literature provided, give a comprehensive, evidence-based answer.

INSTRUCTIONS:
- Provide clear, detailed answers based on the literature
- State if information is insufficient
- Use appropriate medical terminology
- Cite sources when relevant
- Express caution when uncertain

CONTEXT:
{context}

QUESTION: {query}

ANSWER:"""
    
    def query(
        self, 
        question: str, 
        top_k: int = 5, 
        document_filter: Optional[str] = None, 
        max_length: int = 512
    ) -> Dict[str, Any]:
        """
        Complete RAG query pipeline - ALIGNED WITH FASTAPI EXPECTATIONS
        
        Args:
            question: The medical question to answer
            top_k: Number of source documents to retrieve
            document_filter: Optional filter by document name
            max_length: Maximum length of generated answer
            
        Returns:
            Dictionary with answer, sources, confidence, and num_sources
        """
        try:
            logger.info(f"Processing RAG query: {question[:100]}...")
            
            # Input validation
            if not question or not question.strip():
                return self._create_error_response("Please provide a valid medical question.")
            
            question = question.strip()
            
            # Ensure reasonable parameter bounds with token constraints in mind
            top_k = max(1, min(top_k or 5, 20))
            max_length = max(50, min(max_length or 512, 400))  # Conservative upper limit
            
            # Step 1: Retrieve relevant context
            logger.info(f"Retrieving top {top_k} relevant documents...")
            context_docs = self.retrieve_relevant_context(
                query=question,
                top_k=top_k,
                document_filter=document_filter
            )
            
            if not context_docs:
                return self._create_error_response(
                    "I couldn't find relevant information in the knowledge base to answer your question. "
                    "Please try rephrasing your question or ensure the relevant documents have been uploaded."
                )
            
            # Step 2: Generate answer
            logger.info(f"Generating answer from {len(context_docs)} context documents...")
            answer = self.generate_answer(question, context_docs, max_length)
            
            # Step 3: Format sources for frontend
            formatted_sources = []
            total_score = 0.0
            
            for i, doc in enumerate(context_docs):
                try:
                    # Extract and validate content
                    content = doc.get('text', '') or doc.get('content', '')
                    if not content:
                        content = "Content not available"
                    
                    # Extract and validate metadata
                    metadata = doc.get('metadata', {})
                    score = float(doc.get('score', 0.0))
                    total_score += score
                    
                    # Create properly formatted source
                    source = {
                        "content": str(content)[:1000],  # Limit content length
                        "metadata": {
                            "document_name": metadata.get('document_name', 'Unknown'),
                            "chunk_index": metadata.get('chunk_index', i),
                            "page": metadata.get('page', 1),
                            "chunk_id": metadata.get('chunk_id', f"chunk_{i}"),
                            # Add any additional metadata fields
                            **{k: v for k, v in metadata.items() 
                               if k not in ['document_name', 'chunk_index', 'page', 'chunk_id']}
                        },
                        "score": score
                    }
                    
                    formatted_sources.append(source)
                    
                except Exception as e:
                    logger.warning(f"Error formatting source {i}: {e}")
                    # Add a fallback source to maintain count
                    formatted_sources.append({
                        "content": "Error retrieving source content",
                        "metadata": {
                            "document_name": "Unknown",
                            "chunk_index": i,
                            "page": 1,
                            "chunk_id": f"error_chunk_{i}"
                        },
                        "score": 0.0
                    })
            
            # Step 4: Calculate confidence score
            if len(context_docs) > 0 and total_score > 0:
                confidence = min(1.0, max(0.0, total_score / len(context_docs)))
            else:
                confidence = 0.5  # Default moderate confidence
            
            # Step 5: Create final response in exact format expected by FastAPI
            result = {
                "answer": str(answer),
                "sources": formatted_sources,
                "confidence": float(confidence),
                "num_sources": int(len(formatted_sources))
            }
            
            logger.info(f"Query processed successfully - Answer: {len(answer)} chars, "
                       f"Sources: {len(formatted_sources)}, Confidence: {confidence:.3f}")
            
            return result
            
        except Exception as e:
            logger.error(f"Unexpected error in RAG query pipeline: {e}")
            logger.exception("Full exception details:")
            return self._create_error_response(
                f"I encountered an unexpected error while processing your question: {str(e)}"
            )
    
    def _create_error_response(self, message: str) -> Dict[str, Any]:
        """Create a standardized error response"""
        return {
            "answer": message,
            "sources": [],
            "confidence": 0.0,
            "num_sources": 0
        }
    
    def delete_document(self, document_name: str) -> Dict[str, Any]:
        """Delete all chunks of a specific document"""
        try:
            success = self.vector_store.delete_by_metadata({"document_name": document_name})
            
            if success:
                return {
                    "success": True,
                    "message": f"Successfully deleted document: {document_name}"
                }
            else:
                return {
                    "success": False,
                    "message": f"Failed to delete document: {document_name}"
                }
                
        except Exception as e:
            logger.error(f"Error deleting document: {e}")
            return {
                "success": False,
                "message": f"Error deleting document: {str(e)}"
            }
    
    def get_index_stats(self) -> Dict[str, Any]:
        """Get vector store statistics"""
        try:
            return self.vector_store.get_index_stats()
        except Exception as e:
            logger.error(f"Error getting index stats: {e}")
            return {
                "error": f"Failed to get stats: {str(e)}",
                "total_documents": 0,
                "total_chunks": 0
            }