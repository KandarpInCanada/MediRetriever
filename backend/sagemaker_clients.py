import boto3
import json
from typing import List, Dict, Any
from config import SAGEMAKER_LLM_ENDPOINT, SAGEMAKER_EMBEDDING_ENDPOINT, AWS_REGION

class SageMakerLLMClient:
    def __init__(self):
        self.runtime = boto3.client('sagemaker-runtime', region_name=AWS_REGION)
        self.endpoint_name = SAGEMAKER_LLM_ENDPOINT
    
    def generate_response(self, prompt: str, max_length: int = 512) -> str:
        """Generate response using the deployed Meditron model"""
        try:
            payload = {
                "inputs": prompt,
                "parameters": {
                    "max_new_tokens": max_length,
                    "temperature": 0.7,
                    "do_sample": True,
                    "top_p": 0.9,
                    "repetition_penalty": 1.1
                }
            }
            
            response = self.runtime.invoke_endpoint(
                EndpointName=self.endpoint_name,
                ContentType='application/json',
                Body=json.dumps(payload)
            )
            
            result = json.loads(response['Body'].read().decode())
            
            # Extract generated text
            if isinstance(result, list) and len(result) > 0:
                generated_text = result[0].get('generated_text', '')
            elif isinstance(result, dict):
                generated_text = result.get('generated_text', '')
            else:
                generated_text = str(result)
            
            # Remove the original prompt from the response
            if generated_text.startswith(prompt):
                generated_text = generated_text[len(prompt):].strip()
            
            return generated_text
            
        except Exception as e:
            print(f"Error generating response: {e}")
            return f"Error: Unable to generate response - {str(e)}"

class SageMakerEmbeddingClient:
    def __init__(self):
        self.runtime = boto3.client('sagemaker-runtime', region_name=AWS_REGION)
        self.endpoint_name = SAGEMAKER_EMBEDDING_ENDPOINT
    
    def get_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings using the deployed PubMedBERT model"""
        try:
            embeddings = []
            
            for text in texts:
                payload = {
                    "inputs": text
                }
                
                response = self.runtime.invoke_endpoint(
                    EndpointName=self.endpoint_name,
                    ContentType='application/json',
                    Body=json.dumps(payload)
                )
                
                result = json.loads(response['Body'].read().decode())
                
                # Extract embedding vector
                if isinstance(result, list):
                    embedding = result
                elif isinstance(result, dict) and 'embeddings' in result:
                    embedding = result['embeddings']
                elif isinstance(result, dict) and 'vectors' in result:
                    embedding = result['vectors']
                else:
                    # Handle different response formats
                    embedding = list(result.values())[0] if isinstance(result, dict) else result
                
                embeddings.append(embedding)
            
            return embeddings
            
        except Exception as e:
            print(f"Error generating embeddings: {e}")
            # Return zero vectors as fallback
            return [[0.0] * 768 for _ in texts]
    
    def get_embedding(self, text: str) -> List[float]:
        """Generate single embedding"""
        return self.get_embeddings([text])[0]