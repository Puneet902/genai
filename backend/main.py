from fastapi import FastAPI, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn
from keybert import KeyBERT
import spacy
from sklearn.feature_extraction.text import TfidfVectorizer
from transformers import pipeline
import pypdf as PyPDF2
from io import BytesIO

app = FastAPI()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load models
nlp = spacy.load("en_core_web_sm")
kw_model = KeyBERT()
summarizer = None
classifier = None


class ExtractRequest(BaseModel):
    text: Optional[str] = None
    top_n: int = 10
    ng_min: int = 1
    ng_max: int = 3


@app.on_event("startup")
def load_models():
    global summarizer, classifier
    summarizer = pipeline("summarization", model="facebook/bart-large-cnn")
    classifier = pipeline("zero-shot-classification", model="facebook/bart-large-mnli")


def extract_text_from_pdf(file_bytes: bytes) -> str:
    reader = PyPDF2.PdfReader(BytesIO(file_bytes))
    text = ""
    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text + "\n"
    return text


@app.post("/extract")
async def extract(payload: ExtractRequest):
    if not payload.text or not payload.text.strip():
        return {"error": "No text provided"}

    text = payload.text
    ng_min = max(1, payload.ng_min)
    ng_max = max(ng_min, payload.ng_max)
    top_n = max(1, payload.top_n)

    # TF-IDF keywords
    tfidf = TfidfVectorizer(stop_words="english", ngram_range=(ng_min, ng_max))
    tfidf_fit = tfidf.fit_transform([text])
    scores = dict(zip(tfidf.get_feature_names_out(), tfidf_fit.toarray()[0]))
    rule_keywords = sorted(scores, key=scores.get, reverse=True)[:top_n]

    # KeyBERT keywords
    bert_keywords = kw_model.extract_keywords(
        text,
        keyphrase_ngram_range=(ng_min, ng_max),
        stop_words="english",
        top_n=top_n
    )
    bert_keywords = [k[0] for k in bert_keywords]

    # Extract phrases
    doc = nlp(text)
    phrases = [chunk.text for chunk in doc.noun_chunks][:20]

    # Summarization and classification
    summary = None
    topics = None
    try:
        if len(text) > 100:
            summary = summarizer(text[:1024], max_length=120, min_length=40, do_sample=False)[0]['summary_text']
        else:
            summary = text
    except Exception:
        summary = ""
    
    try:
        topics = classifier(text[:512], candidate_labels=["crime", "business", "politics", "technology", "health", "fraud", "terrorism", "finance"])
    except Exception:
        topics = {"labels": []}

    return {
        "rule_keywords": rule_keywords,
        "ml_keywords": bert_keywords,
        "phrases": phrases,
        "summary": summary,
        "topic": topics.get("labels", [])
    }


@app.post("/extract_pdf")
async def extract_pdf(file: UploadFile = File(...), top_n: int = Form(10), ng_min: int = Form(1), ng_max: int = Form(3)):
    contents = await file.read()
    text = extract_text_from_pdf(contents)
    req = ExtractRequest(text=text, top_n=top_n, ng_min=ng_min, ng_max=ng_max)
    return await extract(req)


@app.get("/")
async def root():
    return {"message": "Keyword Intelligence API is running"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)