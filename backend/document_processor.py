import PyPDF2
from typing import List, Dict, Any
from langchain.text_splitter import RecursiveCharacterTextSplitter
from config import CHUNK_SIZE, CHUNK_OVERLAP
import hashlib
import io

class DocumentProcessor:
    def __init__(self):
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=CHUNK_SIZE,
            chunk_overlap=CHUNK_OVERLAP,
            length_function=len,
            separators=["\n\n", "\n", " ", ""]
        )
    
    def extract_text_from_pdf(self, pdf_content: bytes) -> str:
        """Extract text from PDF bytes"""
        try:
            pdf_file = io.BytesIO(pdf_content)
            pdf_reader = PyPDF2.PdfReader(pdf_file)
            
            text = ""
            for page_num, page in enumerate(pdf_reader.pages):
                try:
                    page_text = page.extract_text()
                    if page_text.strip():
                        text += f"\n--- Page {page_num + 1} ---\n"
                        text += page_text + "\n"
                except Exception as e:
                    print(f"Error extracting text from page {page_num + 1}: {e}")
                    continue
            return text.strip()
        except Exception as e:
            print(f"Error extracting text from PDF: {e}")
            return ""
    
    def chunk_text(self, text: str, document_name: str = "document") -> List[Dict[str, Any]]:
        """Split text into chunks with metadata"""
        try:
            chunks = self.text_splitter.split_text(text)
            processed_chunks = []
            for i, chunk in enumerate(chunks):
                # Create a hash for the chunk to avoid duplicates
                chunk_hash = hashlib.md5(chunk.encode()).hexdigest()
                chunk_data = {
                    'text': chunk,
                    'metadata': {
                        'document_name': document_name,
                        'chunk_index': i,
                        'chunk_hash': chunk_hash,
                        'total_chunks': len(chunks),
                        'chunk_length': len(chunk)
                    }
                }
                processed_chunks.append(chunk_data)
            return processed_chunks
        except Exception as e:
            print(f"Error chunking text: {e}")
            return []
    
    def process_pdf(self, pdf_content: bytes, document_name: str) -> List[Dict[str, Any]]:
        """Complete PDF processing pipeline"""
        # Extract text
        text = self.extract_text_from_pdf(pdf_content)
        if not text:
            return []
        # Chunk text
        chunks = self.chunk_text(text, document_name)
        return chunks
    
    def preprocess_text(self, text: str) -> str:
        """Clean and preprocess text"""
        text = ' '.join(text.split())
        import re
        text = re.sub(r'[^\w\s\-\.\,\;\:\(\)\[\]\{\}\/\%\+\=\<\>\@\#\$\&\*\!\?]', ' ', text)
        text = ' '.join(text.split())
        return text