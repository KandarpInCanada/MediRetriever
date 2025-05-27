from fastapi import FastAPI, Request, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from langchain.chains import RetrievalQA
from langchain.embeddings import SentenceTransformerEmbeddings
from langchain_core.prompts import PromptTemplate
from langchain_community.llms import LlamaCpp
from langchain.vectorstores import Qdrant
from qdrant_client import QdrantClient
import os
import json

# --- Initialize FastAPI app ---
app = FastAPI()

# Enable CORS to fix frontend fetch errors
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # You can restrict this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Setup Jinja2 and static files ---
templates = Jinja2Templates(directory="templates")
app.mount("/static", StaticFiles(directory="static"), name="static")

# --- Load model ---
local_llm_path = "/Users/kandarp/Downloads/Medical-RAG-using-Meditron-7B-LLM-main/meditron-7b.Q4_K_M.gguf"

llm = LlamaCpp(
    model_path=local_llm_path,
    n_ctx=2048,
    n_threads=os.cpu_count() // 2,
    max_tokens=1024,
    temperature=0.1,
    top_k=50,
    top_p=0.9,
    repeat_penalty=1.1,
    streaming=True,
    verbose=True,
)
print("✅ LLM Initialized.")

# --- Prompt template ---
prompt_template = """Use the following pieces of information to answer the user's question.
If you don't know the answer, just say that you don't know, don't try to make up an answer.

Context: {context}
Question: {question}

Only return the helpful answer below and nothing else.
Helpful answer:
"""
prompt = PromptTemplate(template=prompt_template, input_variables=['context', 'question'])

# --- Embeddings & Vector DB ---
embeddings = SentenceTransformerEmbeddings(model_name="NeuML/pubmedbert-base-embeddings")
qdrant_client = QdrantClient(url="http://localhost:6333", prefer_grpc=False)
vectorstore = Qdrant(client=qdrant_client, embeddings=embeddings, collection_name="vector_db")
retriever = vectorstore.as_retriever(search_kwargs={"k": 1})

# --- QA Chain (created once, reused) ---
qa_chain = RetrievalQA.from_chain_type(
    llm=llm,
    chain_type="stuff",
    retriever=retriever,
    return_source_documents=True,
    chain_type_kwargs={"prompt": prompt},
    verbose=True
)

# --- Routes ---
@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/get_response", response_class=JSONResponse)
async def get_response(query: str = Form(...)):
    try:
        result = qa_chain(query)
        print(result)

        answer = result['result']
        source_document = result['source_documents'][0].page_content
        doc_source = result['source_documents'][0].metadata.get('source', 'Unknown')

        return {
            "answer": answer,
            "source_document": source_document,
            "doc": doc_source
        }
    except Exception as e:
        print(f"Error during QA: {e}")
        raise HTTPException(status_code=500, detail="Failed to process query.")
