import os
from dotenv import load_dotenv

load_dotenv()

# SageMaker Configuration
SAGEMAKER_LLM_ENDPOINT = os.getenv("SAGEMAKER_LLM_ENDPOINT", "your-llm-endpoint-name")
SAGEMAKER_EMBEDDING_ENDPOINT = os.getenv("SAGEMAKER_EMBEDDING_ENDPOINT", "your-embedding-endpoint-name")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")

# Pinecone Configuration
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY", "your-pinecone-api-key")
PINECONE_ENVIRONMENT = os.getenv("PINECONE_ENVIRONMENT", "your-pinecone-environment")
PINECONE_INDEX_NAME = os.getenv("PINECONE_INDEX_NAME", "medical-rag-index")

# Embedding Configuration
EMBEDDING_DIMENSION = 768  # PubMedBERT embedding dimension
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200

# API Configuration
API_HOST = "0.0.0.0"
API_PORT = 8000