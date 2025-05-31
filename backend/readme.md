# Medical RAG API

A complete Retrieval-Augmented Generation (RAG) API for medical literature using SageMaker deployed models and Pinecone vector database.

## Features

- **PDF Document Ingestion**: Upload and process medical PDF documents
- **Intelligent Chunking**: Split documents into semantically meaningful chunks
- **Medical Embeddings**: Generate embeddings using PubMedBERT via SageMaker
- **Vector Storage**: Store and search embeddings in Pinecone
- **Medical LLM**: Generate answers using Meditron-7B via SageMaker
- **RESTful API**: FastAPI-based API with automatic documentation
- **Document Management**: Add, query, and delete documents

## Architecture

```
PDF Upload → Text Extraction → Chunking → Embedding Generation → Pinecone Storage
                                                     ↓
Query → Embedding → Similarity Search → Context Retrieval → LLM Generation → Answer
```

## Prerequisites

1. **AWS Account** with SageMaker access
2. **Deployed SageMaker Endpoints**:
   - LLM: `epfl-llm/meditron-7b`
   - Embeddings: `NeuML/pubmedbert-base-embeddings`
3. **Pinecone Account** and API key
4. **Python 3.8+**

## Quick Start

### 1. Clone and Setup

```bash
git clone <your-repo>
cd medical-rag-api
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure Environment

```bash
cp .env.template .env
```

Edit `.env` file with your configuration:

```env
# SageMaker Configuration
SAGEMAKER_LLM_ENDPOINT=your-llm-endpoint-name
SAGEMAKER_EMBEDDING_ENDPOINT=your-embedding-endpoint-name
AWS_REGION=us-east-1

# Pinecone Configuration
PINECONE_API_KEY=your-pinecone-api-key
PINECONE_INDEX_NAME=medical-rag-index

# API Configuration
API_HOST=0.0.0.0
API_PORT=8000
```

### 4. Run Setup Script

```bash
python setup.py
```

This will:
- Check AWS credentials
- Verify SageMaker endpoints
- Test Pinecone connection
- Create test files

### 5. Start the API

```bash
python main.py
```

The API will be available at `http://localhost:8000`

## API Endpoints

### Document Management

#### Upload Document
```bash
POST /ingest
```

Upload a PDF document:

```bash
curl -X POST "http://localhost:8000/ingest" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@medical_paper.pdf" \
  -F "document_name=medical_paper"
```

#### Delete Document
```bash
DELETE /documents/{document_name}
```

### Querying

#### Query (POST)
```bash
POST /query
```

```json
{
  "question": "What are the symptoms of diabetes?",
  "top_k": 5,
  "document_filter": "diabetes_study",
  "max_length": 512
}
```

#### Simple Query (GET)
```bash
GET /query?q=What is hypertension?&top_k=3
```

### Utilities

#### Health Check
```bash
GET /health
```

#### Index Statistics
```bash
GET /stats
```

## Usage Examples

### 1. Upload a Medical Paper

```python
import requests

# Upload PDF
with open('medical_paper.pdf', 'rb') as f:
    response = requests.post(
        'http://localhost:8000/ingest',
        files={'file': f},
        data={'document_name': 'diabetes_research'}
    )
print(response.json())
```

### 2. Query the Knowledge Base

```python
import requests

# Query
response = requests.post(
    'http://localhost:8000/query',
    json={
        "question": "What are the risk factors for type 2 diabetes?",
        "top_k": 5,
        "max_length": 300
    }
)

result = response.json()
print("Answer:", result['answer'])
print("Sources:", len(result['sources']))
print("Confidence:", result['confidence'])
```

### 3. Filter by Document

```python
# Query specific document
response = requests.post(
    'http://localhost:8000/query',
    json={
        "question": "What medications are mentioned?",
        "document_filter": "diabetes_research",
        "top_k": 3
    }
)
```

## Configuration

### SageMaker Endpoints

Your SageMaker endpoints should be deployed using the code you provided:

1. **LLM Endpoint**: Meditron-7B for medical text generation
2. **Embedding Endpoint**: PubMedBERT for medical text embeddings

### Pinecone Setup

The API automatically creates a Pinecone index with:
- **Dimension**: 768 (PubMedBERT embedding size)
- **Metric**: Cosine similarity
- **Environment**: GCP Starter (free tier)

### Document Processing

- **Chunk Size**: 1000 characters
- **Chunk Overlap**: 200 characters
- **Text Splitter**: Recursive character splitting
- **Metadata**: Document name, chunk index, hash

## API Documentation

Once running, visit:
- **Interactive Docs**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

## Testing

### Run Basic Tests

```bash
python test_api.py
```

### Test with cURL

```bash
# Health check
curl http://localhost:8000/health

# Simple query
curl "http://localhost:8000/query?q=What%20is%20diabetes?"

# Upload document
curl -X POST "http://localhost:8000/ingest" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@test.pdf"
```

## Project Structure

```
medical-rag-api/
├── main.py                 # FastAPI application
├── rag_pipeline.py         # Main RAG logic
├── sagemaker_clients.py    # SageMaker endpoint clients
├── pinecone_client.py      # Pinecone vector store
├── document_processor.py   # PDF processing and chunking
├── config.py              # Configuration management
├── setup.py               # Setup and testing script
├── requirements.txt       # Python dependencies
├── .env.template          # Environment template
└── README.md             # This file
```

## Error Handling

The API includes comprehensive error handling for:
- Invalid file uploads
- SageMaker endpoint failures
- Pinecone connection issues
- Document processing errors
- Query validation

## Performance Considerations

- **Batch Processing**: Embeddings are generated in batches
- **Chunking Strategy**: Optimized for medical content
- **Vector Search**: Cosine similarity for semantic search
- **Caching**: Consider adding Redis for frequently accessed embeddings

## Security

- **API Keys**: Store in environment variables
- **CORS**: Configured for development (adjust for production)
- **Input Validation**: All inputs are validated
- **File Types**: Only PDF files accepted

## Troubleshooting

### Common Issues

1. **SageMaker Endpoint Not Found**
   - Check endpoint names in `.env`
   - Verify endpoints are deployed and running

2. **Pinecone Connection Failed**
   - Verify API key and environment
   - Check index name configuration

3. **PDF Processing Failed**
   - Ensure PDF is not password protected
   - Check file size limits

4. **Empty Responses**
   - Verify documents are uploaded
   - Check query relevance to document content

### Debug Mode

Enable debug logging:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review API documentation at `/docs`
3. Check SageMaker and Pinecone service status
4. Open an issue with detailed error logs