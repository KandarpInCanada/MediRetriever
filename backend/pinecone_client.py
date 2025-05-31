import pinecone
from pinecone import Pinecone, PodSpec
from typing import List, Dict, Any, Optional
import uuid
import time
from config import PINECONE_API_KEY, PINECONE_INDEX_NAME, EMBEDDING_DIMENSION

class PineconeVectorStore:
    def __init__(self):
        self.pc = Pinecone(api_key=PINECONE_API_KEY)
        self.index_name = PINECONE_INDEX_NAME
        self.index = None
        self._initialize_index()
    
    def _initialize_index(self):
        """Initialize or create Pinecone index"""
        try:
            # Check if index exists
            existing_indexes = [index.name for index in self.pc.list_indexes()]
            
            if self.index_name not in existing_indexes:
                print(f"Creating new Pinecone index: {self.index_name}")
                self.pc.create_index(
                    name=self.index_name,
                    dimension=EMBEDDING_DIMENSION,
                    metric='cosine',
                    spec=PodSpec(
                        environment='gcp-starter',  # Use free tier
                        pod_type='starter'
                    )
                )
                # Wait for index to be ready
                time.sleep(10)
            
            self.index = self.pc.Index(self.index_name)
            print(f"Connected to Pinecone index: {self.index_name}")
            
        except Exception as e:
            print(f"Error initializing Pinecone index: {e}")
            raise
    
    def upsert_vectors(self, texts: List[str], embeddings: List[List[float]], metadata: List[Dict[str, Any]]):
        """Store vectors in Pinecone"""
        try:
            vectors = []
            for i, (text, embedding, meta) in enumerate(zip(texts, embeddings, metadata)):
                vector_id = str(uuid.uuid4())
                vectors.append({
                    'id': vector_id,
                    'values': embedding,
                    'metadata': {
                        **meta,
                        'text': text,
                        'timestamp': time.time()
                    }
                })
            
            # Upsert in batches of 100
            batch_size = 100
            for i in range(0, len(vectors), batch_size):
                batch = vectors[i:i + batch_size]
                self.index.upsert(vectors=batch)
                print(f"Upserted batch {i//batch_size + 1}/{(len(vectors) + batch_size - 1)//batch_size}")
            
            return True
            
        except Exception as e:
            print(f"Error upserting vectors: {e}")
            return False
    
    def similarity_search(self, query_embedding: List[float], top_k: int = 5, filter_dict: Optional[Dict] = None) -> List[Dict]:
        """Search for similar vectors"""
        try:
            query_response = self.index.query(
                vector=query_embedding,
                top_k=top_k,
                include_metadata=True,
                filter=filter_dict
            )
            
            results = []
            for match in query_response.matches:
                results.append({
                    'id': match.id,
                    'score': match.score,
                    'text': match.metadata.get('text', ''),
                    'metadata': match.metadata
                })
            
            return results
            
        except Exception as e:
            print(f"Error searching vectors: {e}")
            return []
    
    def delete_by_metadata(self, filter_dict: Dict):
        """Delete vectors by metadata filter"""
        try:
            self.index.delete(filter=filter_dict)
            return True
        except Exception as e:
            print(f"Error deleting vectors: {e}")
            return False
    
    def get_index_stats(self):
        """Get index statistics"""
        try:
            return self.index.describe_index_stats()
        except Exception as e:
            print(f"Error getting index stats: {e}")
            return None