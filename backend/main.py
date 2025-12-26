from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator, ValidationError
from typing import Optional, List
import uvicorn
from keybert import KeyBERT
import spacy
from sklearn.feature_extraction.text import TfidfVectorizer
from transformers import pipeline
import pypdf as PyPDF2
from io import BytesIO
import logging
import os

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Constants
TOPIC_LABELS = ["crime", "business", "politics", "technology", "health", "fraud", "terrorism", "finance"]
MIN_KEYWORDS = 1
MAX_KEYWORDS = 50
MIN_NGRAM = 1
MAX_NGRAM = 5
MIN_TEXT_LENGTH = 10
MAX_TEXT_LENGTH = 50000
DEFAULT_TOP_N = 10
DEFAULT_NG_MIN = 1
DEFAULT_NG_MAX = 3
SUMMARY_MAX_LENGTH = 120
SUMMARY_MIN_LENGTH = 40
MAX_PHRASES = 20

app = FastAPI(
    title="Keyword Intelligence API",
    description="Extract keywords, phrases, summaries, and topics from text using TF-IDF and KeyBERT",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load models
nlp = None
kw_model = None
summarizer = None
classifier = None


class ExtractRequest(BaseModel):
    """Request model for text extraction."""
    text: Optional[str] = Field(None, description="Text to analyze")
    top_n: int = Field(DEFAULT_TOP_N, ge=MIN_KEYWORDS, le=MAX_KEYWORDS, description="Number of keywords to extract")
    ng_min: int = Field(DEFAULT_NG_MIN, ge=MIN_NGRAM, le=MAX_NGRAM, description="Minimum n-gram size")
    ng_max: int = Field(DEFAULT_NG_MAX, ge=MIN_NGRAM, le=MAX_NGRAM, description="Maximum n-gram size")

    @field_validator('ng_max')
    @classmethod
    def validate_ng_max(cls, v, info):
        """Ensure ng_max is greater than or equal to ng_min."""
        if hasattr(info, 'data') and 'ng_min' in info.data and v < info.data['ng_min']:
            raise ValueError('ng_max must be greater than or equal to ng_min')
        return v

    @field_validator('text')
    @classmethod
    def validate_text(cls, v):
        """Validate text length."""
        if v is not None:
            v = v.strip()
            if len(v) < MIN_TEXT_LENGTH:
                raise ValueError(f'Text must be at least {MIN_TEXT_LENGTH} characters long')
            if len(v) > MAX_TEXT_LENGTH:
                raise ValueError(f'Text must be less than {MAX_TEXT_LENGTH} characters long')
        return v


@app.on_event("startup")
async def load_models():
    """Load ML models on application startup."""
    global nlp, kw_model, summarizer, classifier
    
    try:
        logger.info("Loading spaCy model...")
        nlp = spacy.load("en_core_web_sm")
        logger.info("spaCy model loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load spaCy model: {e}")
        raise
    
    try:
        logger.info("Loading KeyBERT model...")
        kw_model = KeyBERT()
        logger.info("KeyBERT model loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load KeyBERT model: {e}")
        raise
    
    try:
        logger.info("Loading summarization model...")
        summarizer = pipeline("summarization", model="facebook/bart-large-cnn")
        logger.info("Summarization model loaded successfully")
    except Exception as e:
        logger.warning(f"Failed to load summarization model: {e}")
        summarizer = None
    
    try:
        logger.info("Loading classification model...")
        classifier = pipeline("zero-shot-classification", model="facebook/bart-large-mnli")
        logger.info("Classification model loaded successfully")
    except Exception as e:
        logger.warning(f"Failed to load classification model: {e}")
        classifier = None
    
    logger.info("All models loaded successfully")


def extract_text_from_pdf(file_bytes: bytes) -> str:
    """
    Extract text content from PDF file bytes.
    
    Args:
        file_bytes: PDF file as bytes
        
    Returns:
        Extracted text as string
        
    Raises:
        HTTPException: If PDF extraction fails
    """
    try:
        reader = PyPDF2.PdfReader(BytesIO(file_bytes))
        text = ""
        for page in reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        
        if not text.strip():
            raise HTTPException(status_code=400, detail="PDF file appears to be empty or contains no extractable text")
        
        return text
    except Exception as e:
        logger.error(f"PDF extraction error: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to extract text from PDF: {str(e)}")


@app.post("/extract")
async def extract(payload: ExtractRequest):
    """
    Extract keywords, phrases, summary, and topic from text.
    
    Args:
        payload: ExtractRequest containing text and extraction parameters
        
    Returns:
        Dictionary containing extracted keywords, phrases, summary, and topic
        
    Raises:
        HTTPException: If text is not provided or processing fails
    """
    try:
        # Validate payload (Pydantic will handle most validation)
        if payload.ng_max < payload.ng_min:
            raise HTTPException(status_code=400, detail="ng_max must be greater than or equal to ng_min")
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=f"Validation error: {str(e)}")
    
    if not payload.text or not payload.text.strip():
        raise HTTPException(status_code=400, detail="No text provided. Please provide text to analyze.")

    try:
        text = payload.text.strip()
        ng_min = payload.ng_min
        ng_max = payload.ng_max
        top_n = payload.top_n

        logger.info(f"Processing text extraction: {len(text)} characters, top_n={top_n}, ngram_range=({ng_min},{ng_max})")

        # TF-IDF keywords
        try:
            tfidf = TfidfVectorizer(stop_words="english", ngram_range=(ng_min, ng_max))
            tfidf_fit = tfidf.fit_transform([text])
            scores = dict(zip(tfidf.get_feature_names_out(), tfidf_fit.toarray()[0]))
            rule_keywords = sorted(scores, key=scores.get, reverse=True)[:top_n]
        except Exception as e:
            logger.error(f"TF-IDF extraction error: {e}")
            rule_keywords = []

        # KeyBERT keywords
        try:
            if kw_model is None:
                raise ValueError("KeyBERT model not loaded")
            bert_keywords = kw_model.extract_keywords(
                text,
                keyphrase_ngram_range=(ng_min, ng_max),
                stop_words="english",
                top_n=top_n
            )
            bert_keywords = [k[0] for k in bert_keywords]
        except Exception as e:
            logger.error(f"KeyBERT extraction error: {e}")
            bert_keywords = []

        # Extract phrases
        try:
            if nlp is None:
                raise ValueError("spaCy model not loaded")
            doc = nlp(text)
            phrases = [chunk.text for chunk in doc.noun_chunks][:MAX_PHRASES]
        except Exception as e:
            logger.error(f"Phrase extraction error: {e}")
            phrases = []

        # Summarization
        summary = ""
        try:
            if summarizer is not None:
                if len(text) > 100:
                    # Truncate to model's max input length
                    text_for_summary = text[:1024]
                    summary = summarizer(
                        text_for_summary,
                        max_length=SUMMARY_MAX_LENGTH,
                        min_length=SUMMARY_MIN_LENGTH,
                        do_sample=False
                    )[0]['summary_text']
                else:
                    summary = text
            else:
                logger.warning("Summarization model not available")
        except Exception as e:
            logger.error(f"Summarization error: {e}")
            summary = ""

        # Topic classification
        topics = []
        try:
            if classifier is not None:
                text_for_classification = text[:512]  # Limit input length
                result = classifier(text_for_classification, candidate_labels=TOPIC_LABELS)
                topics = result.get("labels", [])
            else:
                logger.warning("Classification model not available")
        except Exception as e:
            logger.error(f"Classification error: {e}")
            topics = []

        logger.info(f"Extraction completed: {len(rule_keywords)} rule keywords, {len(bert_keywords)} ML keywords")

        return {
            "rule_keywords": rule_keywords,
            "ml_keywords": bert_keywords,
            "phrases": phrases,
            "summary": summary,
            "topic": topics
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in extract: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.post("/extract_pdf")
async def extract_pdf(
    file: UploadFile = File(..., description="PDF file to analyze"),
    top_n: int = Form(DEFAULT_TOP_N, ge=MIN_KEYWORDS, le=MAX_KEYWORDS, description="Number of keywords to extract"),
    ng_min: int = Form(DEFAULT_NG_MIN, ge=MIN_NGRAM, le=MAX_NGRAM, description="Minimum n-gram size"),
    ng_max: int = Form(DEFAULT_NG_MAX, ge=MIN_NGRAM, le=MAX_NGRAM, description="Maximum n-gram size")
):
    """
    Extract keywords, phrases, summary, and topic from PDF file.
    
    Args:
        file: PDF file to analyze
        top_n: Number of keywords to extract
        ng_min: Minimum n-gram size
        ng_max: Maximum n-gram size
        
    Returns:
        Dictionary containing extracted keywords, phrases, summary, and topic
        
    Raises:
        HTTPException: If file is invalid or processing fails
    """
    # Validate file type
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a PDF file.")
    
    try:
        contents = await file.read()
        
        if len(contents) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
        
        # Validate n-gram range
        if ng_max < ng_min:
            raise HTTPException(status_code=400, detail="ng_max must be greater than or equal to ng_min")
        
        text = extract_text_from_pdf(contents)
        
        # Validate extracted text length
        if len(text.strip()) < MIN_TEXT_LENGTH:
            raise HTTPException(
                status_code=400,
                detail=f"Extracted text is too short (minimum {MIN_TEXT_LENGTH} characters required)"
            )
        
        req = ExtractRequest(text=text, top_n=top_n, ng_min=ng_min, ng_max=ng_max)
        return await extract(req)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"PDF processing error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process PDF: {str(e)}")


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "message": "Keyword Intelligence API is running",
        "version": "1.0.0",
        "status": "healthy",
        "models_loaded": {
            "spacy": nlp is not None,
            "keybert": kw_model is not None,
            "summarizer": summarizer is not None,
            "classifier": classifier is not None
        }
    }


@app.get("/health")
async def health_check():
    """
    Health check endpoint to verify API and model status.
    
    Returns:
        Dictionary with API health status and model availability
    """
    return {
        "status": "healthy",
        "models": {
            "spacy": nlp is not None,
            "keybert": kw_model is not None,
            "summarizer": summarizer is not None,
            "classifier": classifier is not None
        },
        "version": "1.0.0"
    }


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler for unhandled errors."""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred. Please try again later."}
    )


if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8000))
    logger.info(f"Starting server on {host}:{port}")
    uvicorn.run("main:app", host=host, port=port, reload=True)
