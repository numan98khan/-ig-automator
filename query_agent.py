# query_agent.py
# Migrated to PostgreSQL + pgvector for Railway deployment
# - Uses langchain_postgres.PGVector for vector storage
# - More permissive retrieval (wider fetch; looser distance cutoff)
# - Filters off-topic/political chunks before rerank
# - Ensures entity-named docs (e.g., Client C) are front-loaded into context
# - Explainable JSON answers, policies, memory, MMR retrieval
# - Clears used_documents when there are no quotes (to avoid misleading UI)
# - REPL with /debug, /clear, /stats, /peek <query>
# - PostgreSQL-based vector database for production deployment

import os
import re
import json
import time
import hashlib
import logging
from typing import List, Dict, Any, Optional
from pathlib import Path

# =============== Paths, Globals, Logging ===============

BASE_DIR = Path(__file__).resolve().parent
LOG_DIR = "logs"
COLLECTION_NAME = "legal_documents"  # PostgreSQL collection name

# Singleton holder for agent
rag_agent = None

# HTTPException usable in CLI and API contexts
try:
    from fastapi import HTTPException  # type: ignore
except Exception:  # Running without FastAPI
    class HTTPException(Exception):
        def __init__(self, status_code: int = 500, detail: str = ""):
            super().__init__(detail)
            self.status_code = status_code
            self.detail = detail

logger = logging.getLogger(__name__)

# =============== Database helpers ===============

def test_db_connection() -> bool:
    """Test PostgreSQL connection."""
    try:
        from db_config import test_connection
        return test_connection()
    except Exception:
        return False

# =============== Utilities ===============

def now_ts() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")

def sha1(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()[:8]

def ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)

def summarize_text(s: str, max_chars: int) -> str:
    return (s[: max_chars - 1] + "…") if len(s) > max_chars else s

def lexical_overlap_score(query: str, text: str) -> float:
    q = set(re.findall(r"[a-z0-9]+", query.lower()))
    t = set(re.findall(r"[a-z0-9]+", text.lower()))
    if not q or not t:
        return 0.0
    inter = len(q & t)
    # lightly length-normalized Jaccard-ish
    return inter / ((len(q) ** 0.5) * (len(t) ** 0.5))

def detect_legal_entities(text: str, entity_keywords: List[str]) -> Dict[str, Any]:
    """Detect legal entities and terminology in text."""
    found_entities = []
    text_lower = text.lower()

    for keyword in entity_keywords:
        if keyword.lower() in text_lower:
            count = text_lower.count(keyword.lower())
            found_entities.append({"entity": keyword, "count": count})

    return {
        "found": len(found_entities) > 0,
        "entities": found_entities,
        "total_matches": sum(e["count"] for e in found_entities)
    }

def detect_citations(text: str, patterns: Dict[str, str]) -> Dict[str, Any]:
    """Detect legal citations in text (case law, statutes, regulations)."""
    citations = {"case_law": [], "statutes": [], "regulations": []}
    if "case_cite" in patterns:
        citations["case_law"] = re.findall(patterns["case_cite"], text)
    if "statute" in patterns:
        citations["statutes"] = re.findall(patterns["statute"], text)
    if "regulation" in patterns:
        citations["regulations"] = re.findall(patterns["regulation"], text)
    total = sum(len(v) for v in citations.values())
    return {"has_citations": total > 0, "count": total, "citations": citations}

def calculate_confidence_score(
    lexical_score: float,
    distance_scores: List[float],
    entity_match: bool,
    citation_count: int,
    doc_count: int
) -> Dict[str, Any]:
    """
    Calculate confidence score for the answer based on multiple factors.
    Returns score (0-1) and confidence level (high/medium/low).
    """
    if distance_scores:
        avg_distance = sum(distance_scores) / len(distance_scores)
        similarity_score = max(0, 1 - (avg_distance / 2.0))  # assume distance in ~[0,2]
    else:
        similarity_score = 0.0

    weights = {
        "lexical": 0.25,
        "semantic": 0.35,
        "entity": 0.20,
        "citation": 0.10,
        "doc_coverage": 0.10
    }

    entity_score = 1.0 if entity_match else 0.0
    citation_score = min(1.0, citation_count / 3.0)   # cap at 3 citations
    doc_coverage_score = min(1.0, doc_count / 5.0)    # cap at 5 docs

    confidence = (
        weights["lexical"] * lexical_score +
        weights["semantic"] * similarity_score +
        weights["entity"] * entity_score +
        weights["citation"] * citation_score +
        weights["doc_coverage"] * doc_coverage_score
    )

    if confidence >= 0.75:
        level = "high"
    elif confidence >= 0.50:
        level = "medium"
    else:
        level = "low"

    return {
        "score": round(confidence, 3),
        "level": level,
        "components": {
            "lexical": round(lexical_score, 3),
            "semantic": round(similarity_score, 3),
            "entity_match": entity_score,
            "citations": round(citation_score, 3),
            "doc_coverage": round(doc_coverage_score, 3)
        }
    }

# =============== Policies ===============

DEFAULT_POLICY = {
    "disclosures": {
        "legal": "This response is for informational purposes only and does not constitute legal advice. Consult a qualified attorney for advice specific to your situation.",
        "confidentiality": "Do not share confidential client information without proper authorization.",
        "jurisdiction": "Legal requirements may vary by jurisdiction. Verify local regulations."
    },
    "blocked_topics": ["politics", "elections", "celebrities", "sports", "medical advice", "financial advice"],
    "blocked_regex": [r"(?i)trump", r"(?i)joe\s*biden", r"(?i)vote", r"(?i)world\s*cup", r"(?i)stock\s+tip"],
    "allowed_topics": ["compliance", "contracts", "arbitration", "aml", "data privacy", "ip", "tax", "litigation", "employment law", "corporate law", "real estate", "regulatory", "securities"],
    "banned_phrases": [
        "guaranteed legal outcome", "we can ensure you win", "100% success rate",
        "this will definitely work", "you cannot lose", "guaranteed victory"
    ],
    "legal_entities": {
        "keywords": ["plaintiff", "defendant", "appellant", "appellee", "petitioner", "respondent", "claimant"],
        "boost_weight": 1.3
    },
    "citation_patterns": {
        "case_cite": r"\d+\s+[A-Z][a-z\.]+\s+\d+",
        "statute": r"\d+\s+U\.S\.C\.?\s*§?\s*\d+",
        "regulation": r"\d+\s+C\.F\.R\.?\s*§?\s*\d+"
    },
    "answer_style": {"max_quotes": 6, "max_reasoning_bullets": 5, "cite_mode": "inline", "require_source_verification": True},
    # IMPORTANT: treat min_distance as a DISTANCE cutoff (smaller = more similar). Start loose.
    "retrieval": {"k": 6, "fetch_k": 64, "mmr_lambda": 0.5, "min_distance": 1.0, "lexical_weight": 0.40},
    "confidence_thresholds": {"high": 0.75, "medium": 0.50, "low": 0.25},
    "memory": {"max_turns": 8, "summary_max_chars": 800},
    "fallback": {
        "off_topic_message": "I don't have enough information in the available documents to answer this question confidently.",
        "off_domain_message": "This question appears to be outside the scope of the available documents. Please ask about content within the document collection.",
        "low_confidence_message": "Based on the available documents, I have low confidence in this answer. Please verify with additional sources."
    },
}

try:
    import yaml
except ImportError:
    yaml = None

def load_policies(path: str = "policies.yaml", policies_dict: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Load policies from either:
    1. A provided dictionary (from database)
    2. A YAML file (legacy)
    3. DEFAULT_POLICY (fallback)

    Args:
        path: Path to policies.yaml file (used if policies_dict is None)
        policies_dict: Pre-loaded policies dictionary (e.g., from database)

    Returns:
        Dictionary with merged policies
    """
    # If policies_dict is provided (from database), use it
    if policies_dict is not None:
        merged = DEFAULT_POLICY.copy()
        for k, v in policies_dict.items():
            merged[k] = v
        # backwards compat if someone used min_similarity name
        if "min_similarity" in merged.get("retrieval", {}) and "min_distance" not in merged.get("retrieval", {}):
            merged["retrieval"]["min_distance"] = float(merged["retrieval"]["min_similarity"])
        return merged

    # Otherwise, try loading from YAML file
    if yaml is None or not Path(path).exists():
        return DEFAULT_POLICY
    with open(path, "r", encoding="utf-8") as f:
        doc = yaml.safe_load(f) or {}
    merged = DEFAULT_POLICY.copy()
    for k, v in doc.items():
        merged[k] = v
    # backwards compat if someone used min_similarity name
    if "min_similarity" in merged["retrieval"] and "min_distance" not in merged["retrieval"]:
        merged["retrieval"]["min_distance"] = float(merged["retrieval"]["min_similarity"])
    return merged

# =============== OpenAI shims (only if needed) ===============

_OPENAI_EMBEDDINGS_OK = True
_LLM_OK = True
try:
    from langchain_openai import OpenAIEmbeddings as LCOpenAIEmbeddings
except Exception:
    _OPENAI_EMBEDDINGS_OK = False
try:
    from langchain_openai import ChatOpenAI as LCChatOpenAI
except Exception:
    _LLM_OK = False

if not _OPENAI_EMBEDDINGS_OK or not _LLM_OK:
    import httpx
    from openai import OpenAI
    from langchain_core.embeddings import Embeddings

    def _build_openai_client():
        http_proxy  = os.environ.get("HTTP_PROXY")
        https_proxy = os.environ.get("HTTPS_PROXY")
        if http_proxy or https_proxy:
            # Using httpx 0.23.x which supports old proxies API
            client = httpx.Client(
                proxies={"http://": http_proxy, "https://": https_proxy},
                timeout=30.0,
            )
            return OpenAI(http_client=client)
        return OpenAI()

    class SimpleOpenAIEmbeddings(Embeddings):
        def __init__(self, model: str = "text-embedding-3-small"):
            self.model = model
            self.client = _build_openai_client()
        def embed_query(self, text: str) -> List[float]:
            resp = self.client.embeddings.create(model=self.model, input=text)
            return resp.data[0].embedding
        def embed_documents(self, texts: List[str]) -> List[List[float]]:
            resp = self.client.embeddings.create(model=self.model, input=texts)
            return [it.embedding for it in resp.data]

    class SimpleOpenAIChat:
        def __init__(self, model: str = "gpt-4o-mini", temperature: float = 0.0):
            self.client = _build_openai_client()
            self.model = model
            self.temperature = temperature
        class _Resp:
            def __init__(self, content: str): self.content = content
        def invoke(self, messages: List[Dict[str, str]]) -> "_Resp":

            if self.model == "gpt-5-mini":
                # gpt-5-mini only supports temperature=1
                resp = self.client.chat.completions.create(
                    model=self.model, messages=messages, temperature=1
                )
                content = resp.choices[0].message.content or ""
                return self._Resp(content)

            resp = self.client.chat.completions.create(
                model=self.model, temperature=self.temperature, messages=messages
            )
            content = resp.choices[0].message.content or ""
            return self._Resp(content)

# =============== LangChain core + PostgreSQL (pgvector) ===============

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_community.vectorstores import PGVector
from db_config import get_database_url

# =============== Prompts ===============

SYSTEM_PROMPT = """You are a specialized legal document assistant with expertise in analyzing legal documents, contracts, and case materials.

CRITICAL RULES:
1. Answer ONLY from the provided document excerpts - never invent or assume information
2. Quote exact text with precise citations: [SOURCE: <filename> (page X)]
3. Distinguish between:
   - Direct quotes (use quotation marks)
   - Paraphrased content (cite but no quotes)
   - Your legal analysis (clearly label as "Analysis:")
4. When citing legal authorities (cases, statutes, regulations):
   - Include full citations as they appear in documents
   - Note if citation is primary vs. secondary authority
5. Flag any contradictions or conflicts between sources
6. If information is ambiguous, incomplete, or requires interpretation:
   - State this explicitly
   - Note what additional information would be needed
7. Provide context about jurisdiction, date, or procedural posture when relevant
8. Never guarantee outcomes or provide definitive legal advice
9. If you cannot answer confidently, state: "I don't have enough information in the available documents to answer this question confidently."

OUTPUT FORMAT (valid JSON):
{
  "answer_text": "Your comprehensive answer with inline citations",
  "quotes": [{"quote": "exact text", "source": "filename", "page": "X", "context": "brief context"}],
  "reasoning_outline": ["Step 1: Analysis point", "Step 2: ..."],
  "used_documents": ["doc1.pdf", "doc2.pdf"],
  "legal_analysis": {
    "primary_authorities": ["list of statutes, cases cited"],
    "secondary_authorities": ["list of secondary sources"],
    "jurisdictions": ["relevant jurisdictions mentioned"],
    "conflicts": ["any contradictions found"]
  },
  "policy_flags": [],
  "confidence_indicators": {
    "has_direct_quotes": true/false,
    "has_legal_citations": true/false,
    "answer_completeness": "complete|partial|insufficient"
  },
  "disclaimer": "Standard legal disclaimer"
}
"""

ANSWER_PROMPT = ChatPromptTemplate.from_template(
"""Excerpts (each has a SOURCE header and clear boundaries):
{context}

User question: {question}

Return a JSON object with fields exactly:
- answer_text (string)
- quotes (array of objects: quote, source, page?, score?)
- reasoning_outline (array of short bullets, max 5)
- used_documents (array of strings = filenames)
- policy_flags (array of strings; leave empty unless told)
- disclaimer (string or null)

Remember: quote then conclude; do not invent attributions; keep it concise.
"""
)

# =============== Memory ===============

class ConversationMemory:
    def __init__(self, max_turns: int = 8, summary_max_chars: int = 800):
        self.max_turns = max_turns
        self.summary_max_chars = summary_max_chars
        self.cache: Dict[str, List[Dict[str, str]]] = {}
    def add(self, conv_id: str, user_q: str, answer: str):
        lst = self.cache.setdefault(conv_id, [])
        lst.append({"q": user_q, "a": summarize_text(answer, 2000)})
        if len(lst) > self.max_turns:
            self.cache[conv_id] = lst[-self.max_turns:]
    def as_context(self, conv_id: str) -> str:
        turns = self.cache.get(conv_id, [])
        if not turns: return ""
        joined = "\n".join([f"[Turn {i+1}] Q: {t['q']}\nA: {t['a']}" for i, t in enumerate(turns)])
        return summarize_text(joined, self.summary_max_chars)

# =============== Query normalization helpers ===============

def _normalize_query_aliases(q: str) -> str:
    q2 = q.replace("_", " ").replace("-", " ")
    alias_map = {
        "client x": ["client x", "clientx", "client-x"],
        "client c": ["client c", "clientc", "client-c"],
        "client b": ["client b", "clientb", "client-b"],
    }
    lower = q2.lower()
    for canon, variants in alias_map.items():
        if any(v in lower for v in variants):
            q2 += f" ({canon})"
            break
    return q2

# =============== Agent ===============

class RAGAgent:
    def __init__(self, model_name: str = "gpt-4o-mini", temperature: float = 0, policies_path: str = "policies.yaml", policies_dict: Optional[Dict[str, Any]] = None):
        """
        Initialize the RAG Agent.

        Args:
            model_name: OpenAI model to use (e.g., "gpt-4o-mini", "gpt-5-mini")
            temperature: Temperature for LLM (0 for deterministic, 1 for creative)
            policies_path: Path to policies.yaml file (used if policies_dict is None)
            policies_dict: Pre-loaded policies dictionary (e.g., from database). Takes precedence over policies_path.
        """
        logger = logging.getLogger(__name__)

        # Load policies from database dict (if provided) or from YAML file (fallback)
        if policies_dict is not None:
            logger.info("=" * 80)
            logger.info("🔧 RAGAgent: Loading policies from PROVIDED DICTIONARY (database)")
            logger.info("=" * 80)
        else:
            logger.info("=" * 80)
            logger.info(f"🔧 RAGAgent: Loading policies from YAML FILE: {policies_path}")
            logger.info("=" * 80)

        self.policies = load_policies(policies_path, policies_dict=policies_dict)

        # Log loaded policy values for verification
        logger.info("📋 ACTIVE POLICIES:")
        logger.info(f"   - Blocked topics: {self.policies.get('blocked_topics', [])}")
        logger.info(f"   - Blocked regex: {self.policies.get('blocked_regex', [])}")
        logger.info(f"   - Off-topic message: '{self.policies.get('fallback', {}).get('off_topic_message', 'N/A')[:80]}...'")
        logger.info(f"   - Retrieval k: {self.policies.get('retrieval', {}).get('k', 'N/A')}")
        logger.info(f"   - Memory max_turns: {self.policies.get('memory', {}).get('max_turns', 'N/A')}")
        logger.info("=" * 80)

        # Embeddings (prefer langchain_openai; fallback to shim)
        if _OPENAI_EMBEDDINGS_OK:
            logger.info("🧠 Using langchain_openai embeddings")
            self.embeddings = LCOpenAIEmbeddings(model="text-embedding-3-small")
        else:
            logger.info("🧠 Using fallback SimpleOpenAIEmbeddings")
            self.embeddings = SimpleOpenAIEmbeddings(model="text-embedding-3-small")

        # Vector DB: PostgreSQL + pgvector
        database_url = get_database_url()
        logger.info(f"📊 Connecting to PostgreSQL vector database...")

        # Load the PostgreSQL vector database
        self.vectordb = PGVector(
            embedding_function=self.embeddings,
            collection_name=COLLECTION_NAME,
            connection_string=database_url,
        )

        # Log collection info
        try:
            logger.info(f"✅ PostgreSQL vector store connected with collection '{COLLECTION_NAME}'")
        except Exception as e:
            logger.error(f"❌ Failed to connect to PostgreSQL: {e}")

        # LLM (prefer langchain_openai; fallback to shim)
        if _LLM_OK:
            # gpt-5-mini doesn't support temperature parameter
            if model_name == "gpt-5-mini":
                self.llm = LCChatOpenAI(model=model_name, temperature=1)  # gpt-5-mini only supports default temperature=1
            else:
                self.llm = LCChatOpenAI(model=model_name, temperature=temperature)
        else:
            # Same check for fallback SimpleOpenAIChat
            if model_name == "gpt-5-mini":
                self.llm = SimpleOpenAIChat(model=model_name, temperature=1)  # gpt-5-mini only supports default temperature=1
            else:
                self.llm = SimpleOpenAIChat(model=model_name, temperature=temperature)

        # Retriever (MMR to diversify)
        rconf = self.policies["retrieval"]
        self.retriever = self.vectordb.as_retriever(
            search_type="mmr",
            search_kwargs={"k": rconf["k"], "fetch_k": rconf["fetch_k"], "lambda_mult": rconf["mmr_lambda"]},
        )

        # Memory
        self.memory = ConversationMemory(
            max_turns=self.policies["memory"]["max_turns"],
            summary_max_chars=self.policies["memory"]["summary_max_chars"],
        )

        # Prompt / parser
        self.prompt = ANSWER_PROMPT
        self.output_parser = StrOutputParser()

    # ---------- helpers ----------

    def _is_blocked(self, question: str) -> Optional[str]:
        ql = question.lower()
        for rx in self.policies.get("blocked_regex", []):
            if re.search(rx, ql): return "blocked_regex"
        if any(t in ql for t in self.policies.get("blocked_topics", [])):
            return "blocked_topic"
        return None

    def _format_docs(self, docs: List) -> str:
        blocks = []
        for i, d in enumerate(docs, 1):
            src = d.metadata.get("source", "Unknown")
            page = d.metadata.get("page", None)
            page_str = f" (page {page})" if page is not None else ""
            blocks.append(
                f"==== BEGIN EXCERPT {i} ====\n"
                f"SOURCE: {src}{page_str}\n"
                f"CONTENT:\n{d.page_content}\n"
                f"==== END EXCERPT {i} ===="
            )
        return "\n\n".join(blocks)

    def _rerank_with_lexical(self, query: str, docs: List) -> List:
        if not docs:
            return docs
        rescored = [(lexical_overlap_score(query, d.page_content or ""), d) for d in docs]
        rescored.sort(key=lambda t: t[0], reverse=True)
        return [d for _, d in rescored]

    def _filter_offtopic_docs(self, docs: List) -> List:
        """Remove chunks that match blocked_regex (e.g., politics) before reranking/gating."""
        blocked_rx = [re.compile(rx, re.IGNORECASE) for rx in self.policies.get("blocked_regex", [])]
        out = []
        for d in docs:
            txt = d.page_content or ""
            if any(rx.search(txt) for rx in blocked_rx):
                continue
            out.append(d)
        return out if out else docs  # if all filtered, return original to avoid empty

    def _ensure_entity_inclusion(self, question: str, docs: List):
        """
        If the question names an entity like 'client c', make sure any chunks whose
        filename or content clearly mention that entity are included at the front
        of the context.
        """
        ql = question.lower()
        entity_tokens = []
        if any(x in ql for x in ("client c", "clientc", "client-c")):
            entity_tokens = ["client c", "clientc", "client-c"]
        if any(x in ql for x in ("client x", "clientx", "client-x")):
            entity_tokens = ["client x", "clientx", "client-x"]
        if any(x in ql for x in ("client b", "clientb", "client-b")):
            entity_tokens = ["client b", "clientb", "client-b"]

        if not entity_tokens:
            return docs

        def hits_entity(d):
            src = str(d.metadata.get("source", "")).lower()
            txt = (d.page_content or "").lower()
            return any(tok in src or tok in txt for tok in entity_tokens)

        # First, pull entity hits from current docs
        must = [d for d in docs if hits_entity(d)]

        # If none found, try a direct search with the tokens to yank them in
        if not must:
            try:
                for tok in entity_tokens:
                    extra = self.vectordb.similarity_search(tok, k=3)
                    must.extend([d for d in extra if hits_entity(d)])
            except Exception:
                pass

        if not must:
            return docs

        # De-dup and front-load entity hits
        seen = set()
        ordered = []
        for d in (must + docs):
            key = (d.metadata.get("source"), d.metadata.get("page"))
            if key in seen:
                continue
            seen.add(key)
            ordered.append(d)
        return ordered

    def _low_relevance(self, question: str, reranked_docs: List) -> bool:
        """
        Decide if retrieval is too weak to answer.
        - PGVector similarity_search_with_score returns a *distance*; smaller = better.
        - If any doc clearly matches entity tokens (filename/content), don't block.
        - If lexical overlap on top doc is decent, don't block.
        - Else use distance cutoff.
        """
        if not reranked_docs:
            return True

        ql = question.lower()
        entity_tokens = []
        if any(x in ql for x in ("client c", "clientc", "client-c")):
            entity_tokens = ["client c", "clientc", "client-c"]
        if any(x in ql for x in ("client x", "clientx", "client-x")):
            entity_tokens = ["client x", "clientx", "client-x"]
        if any(x in ql for x in ("client b", "clientb", "client-b")):
            entity_tokens = ["client b", "clientb", "client-b"]

        if entity_tokens:
            for d in reranked_docs[:5]:
                src = str(d.metadata.get("source", "")).lower()
                txt = (d.page_content or "").lower()
                if any(tok in src or tok in txt for tok in entity_tokens):
                    return False

        top_overlap = lexical_overlap_score(question, reranked_docs[0].page_content or "")
        if top_overlap >= 0.12:
            return False

        try:
            hits = self.vectordb.similarity_search_with_score(question, k=3)
            th = float(self.policies["retrieval"].get("min_distance", 1.0))
            good = [s for _, s in hits if isinstance(s, (int, float)) and s <= th]
            return len(good) == 0
        except Exception:
            # if we can't score distances, be permissive
            return False

    def _log(self, conv_id: str, question: str, answer: str, sources: List[str], policy_flags: List[str], raw: str = "", json_obj: Dict[str, Any] = None):
        ensure_dir(LOG_DIR)
        ensure_dir(os.path.join(LOG_DIR, "runs"))
        rid = f"{now_ts()}_{sha1(question)}"
        record = {
            "run_id": rid, "conversation_id": conv_id, "ts": now_ts(),
            "question": question, "answer": answer, "sources": sources,
            "policy_flags": policy_flags, "raw_model_output": raw, "json": json_obj or {},
        }
        with open(os.path.join(LOG_DIR, "runs", f"{rid}.json"), "w", encoding="utf-8") as f:
            json.dump(record, f, ensure_ascii=False, indent=2)

    # ---------- public ----------

    def query(self, question: str, conversation_id: str = "default", return_raw_json: bool = True) -> Dict[str, Any]:
        logger = logging.getLogger(__name__)

        blocked = self._is_blocked(question)
        if blocked:
            ans = self.policies["fallback"]["off_domain_message"]
            logger.warning("=" * 80)
            logger.warning(f"🚫 QUERY BLOCKED: {blocked}")
            logger.warning(f"📝 Returning off_domain_message: '{ans[:100]}...'")
            logger.warning("=" * 80)
            self._log(conversation_id, question, ans, [], policy_flags=[blocked])
            self.memory.add(conversation_id, question, ans)
            return {"answer": ans, "json": {"answer_text": ans, "quotes": [], "reasoning_outline": [], "used_documents": [], "policy_flags": [blocked], "disclaimer": self.policies["disclosures"]["legal"]}}

        qn = _normalize_query_aliases(question)
        mem_ctx = self.memory.as_context(conversation_id)
        enriched_q = qn if not mem_ctx else f"{qn}\n\n[Conversation context]\n{mem_ctx}"

        # Retrieve → filter off-topic → lexical rerank → ensure entity inclusion
        logger.info(f"🔍 Retrieving documents for query: {question[:100]}...")
        ctx_docs = self.retriever.invoke(enriched_q)
        logger.info(f"📚 Retrieved {len(ctx_docs)} initial documents")

        ctx_docs = self._filter_offtopic_docs(ctx_docs)
        logger.info(f"✂️  After off-topic filtering: {len(ctx_docs)} documents")

        ctx_docs = self._rerank_with_lexical(qn, ctx_docs)
        logger.info(f"🔄 After lexical reranking: {len(ctx_docs)} documents")
        ctx_docs = self._ensure_entity_inclusion(qn, ctx_docs)

        # Gate using reranked docs
        if self._low_relevance(qn, ctx_docs):
            ans = self.policies["fallback"]["off_topic_message"]
            logger.warning("=" * 80)
            logger.warning(f"📊 LOW RELEVANCE DETECTED")
            logger.warning(f"📝 Returning off_topic_message: '{ans[:100]}...'")
            logger.warning("=" * 80)
            self._log(conversation_id, question, ans, [], policy_flags=["low_relevance"])
            self.memory.add(conversation_id, question, ans)
            return {
                "answer": ans,
                "json": {"answer_text": ans, "quotes": [], "reasoning_outline": [], "used_documents": [],
                         "policy_flags": ["low_relevance"], "disclaimer": self.policies["disclosures"]["legal"]}
            }

        # Build context for the LLM
        context_str = self._format_docs(ctx_docs)
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": ANSWER_PROMPT.format(context=context_str, question=question)},
        ]
        raw = self.llm.invoke(messages).content

        # Parse + scrub
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            m = re.search(r"\{.*\}", raw, flags=re.DOTALL)
            parsed = json.loads(m.group(0)) if m else {
                "answer_text": self.policies["fallback"]["off_topic_message"],
                "quotes": [], "reasoning_outline": [], "used_documents": [], "policy_flags": [], "disclaimer": None
            }

        policy_flags = parsed.get("policy_flags", []) or []
        blob = " \n".join([str(parsed.get("answer_text", ""))] + [q.get("quote", "") for q in parsed.get("quotes", [])])
        for bp in self.policies.get("banned_phrases", []):
            if re.search(bp, blob, flags=re.IGNORECASE):
                policy_flags.append("banned_phrase_detected")
                parsed["answer_text"] = self.policies["fallback"]["off_topic_message"]
                parsed["quotes"] = []
                parsed["reasoning_outline"] = []

        parsed["disclaimer"] = self.policies["disclosures"]["legal"]
        parsed["quotes"] = parsed.get("quotes", [])[: int(self.policies["answer_style"]["max_quotes"])]
        parsed["reasoning_outline"] = parsed.get("reasoning_outline", [])[: int(self.policies["answer_style"]["max_reasoning_bullets"])]

        # If there are no quotes, don't imply usage
        if not parsed.get("quotes"):
            parsed["used_documents"] = []

        human_answer = parsed.get("answer_text", "")
        used_sources = list({q.get("source") for q in parsed.get("quotes", []) if q.get("source")})

        self._log(conversation_id, question, human_answer, used_sources, policy_flags=policy_flags, raw=raw, json_obj=parsed)
        self.memory.add(conversation_id, question, human_answer)

        return {"answer": human_answer, "json": parsed} if return_raw_json else {"answer": human_answer, "sources": used_sources}

    def query_debug(self, question: str, conversation_id: str = "default") -> Dict[str, Any]:
        logger = logging.getLogger(__name__)
        dbg: Dict[str, Any] = {
            "policy": {}, "memory": {}, "retrieval": {"initial_docs": [], "reranked_docs": []},
            "gates": {}, "context_preview": "", "model_raw": "", "parsed_json": {}
        }

        blocked = self._is_blocked(question)
        dbg["policy"]["blocked_reason"] = blocked
        if blocked:
            ans = self.policies["fallback"]["off_domain_message"]
            logger.warning("=" * 80)
            logger.warning(f"🚫 QUERY BLOCKED (DEBUG): {blocked}")
            logger.warning(f"📝 Returning off_domain_message: '{ans[:100]}...'")
            logger.warning("=" * 80)
            parsed = {"answer_text": ans, "quotes": [], "reasoning_outline": [], "used_documents": [], "policy_flags": [blocked], "disclaimer": self.policies["disclosures"]["disclaimer"]}
            self._log(conversation_id, question, ans, [], policy_flags=[blocked], raw="", json_obj=parsed)
            self.memory.add(conversation_id, question, ans)
            dbg["parsed_json"] = parsed
            return {"answer": ans, "json": parsed, "debug": dbg}

        qn = _normalize_query_aliases(question)
        mem_ctx = self.memory.as_context(conversation_id)
        dbg["memory"]["summary_used"] = mem_ctx
        enriched_q = qn if not mem_ctx else f"{qn}\n\n[Conversation context]\n{mem_ctx}"

        # Retrieve → filter off-topic → lexical rerank → ensure entity inclusion
        ctx_docs = self.retriever.invoke(enriched_q)
        dbg["retrieval"]["initial_docs"] = [
            {"source": d.metadata.get("source","Unknown"), "page": d.metadata.get("page"),
             "preview": (d.page_content[:240] + "…") if len(d.page_content) > 240 else d.page_content}
            for d in ctx_docs
        ]
        ctx_docs = self._filter_offtopic_docs(ctx_docs)
        rescored = [(lexical_overlap_score(qn, d.page_content or ""), d) for d in ctx_docs]
        rescored.sort(key=lambda t: t[0], reverse=True)
        ctx_docs = [d for _, d in rescored]
        ctx_docs = self._ensure_entity_inclusion(qn, ctx_docs)

        dbg["retrieval"]["reranked_docs"] = [
            {"lexical_overlap": round(s,4), "source": d.metadata.get("source","Unknown"), "page": d.metadata.get("page"),
             "preview": (d.page_content[:240] + "…") if len(d.page_content) > 240 else d.page_content}
            for s, d in rescored
        ]

        # Distance dump for visibility
        try:
            hits = self.vectordb.similarity_search_with_score(qn, k=3)
            dbg["retrieval"]["distance_scores"] = [
                {
                    "source": d.metadata.get("source","Unknown"),
                    "page": d.metadata.get("page"),
                    "distance": float(s) if isinstance(s, (int,float)) else None,
                    "preview": (d.page_content[:160] + "…") if len(d.page_content) > 160 else d.page_content
                }
                for d, s in hits
            ]
        except Exception as e:
            dbg["retrieval"]["distance_scores_error"] = str(e)

        low_rel = self._low_relevance(qn, ctx_docs) or (not ctx_docs)
        dbg["gates"]["low_relevance"] = low_rel
        if low_rel:
            ans = self.policies["fallback"]["off_topic_message"]
            logger.warning("=" * 80)
            logger.warning(f"📊 LOW RELEVANCE DETECTED (DEBUG)")
            logger.warning(f"📝 Returning off_topic_message: '{ans[:100]}...'")
            logger.warning("=" * 80)
            parsed = {"answer_text": ans, "quotes": [], "reasoning_outline": [], "used_documents": [], "policy_flags": ["low_relevance"], "disclaimer": self.policies["disclosures"]["legal"]}
            self._log(conversation_id, question, ans, [], policy_flags=["low_relevance"], raw="", json_obj=parsed)
            self.memory.add(conversation_id, question, ans)
            dbg["parsed_json"] = parsed
            return {"answer": ans, "json": parsed, "debug": dbg}

        ctx = self._format_docs(ctx_docs)
        dbg["context_preview"] = (ctx[:2000] + "…[truncated]") if len(ctx) > 2000 else ctx

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": ANSWER_PROMPT.format(context=ctx, question=question)},
        ]
        raw = self.llm.invoke(messages).content
        dbg["model_raw"] = raw

        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            m = re.search(r"\{.*\}", raw, flags=re.DOTALL)
            parsed = json.loads(m.group(0)) if m else {
                "answer_text": self.policies["fallback"]["off_topic_message"],
                "quotes": [], "reasoning_outline": [], "used_documents": [], "policy_flags": [], "disclaimer": None
            }

        policy_flags = parsed.get("policy_flags", []) or []
        blob = " \n".join([str(parsed.get("answer_text",""))] + [q.get("quote","") for q in parsed.get("quotes",[])])
        for bp in self.policies.get("banned_phrases", []):
            if re.search(bp, blob, flags=re.IGNORECASE):
                policy_flags.append("banned_phrase_detected")
                parsed["answer_text"] = self.policies["fallback"]["off_topic_message"]
                parsed["quotes"] = []
                parsed["reasoning_outline"] = []
        parsed["disclaimer"] = self.policies["disclosures"]["legal"]
        parsed["quotes"] = parsed.get("quotes", [])[: int(self.policies["answer_style"]["max_quotes"])]
        parsed["reasoning_outline"] = parsed.get("reasoning_outline", [])[: int(self.policies["answer_style"]["max_reasoning_bullets"])]

        # If there are no quotes, don't imply usage
        if not parsed.get("quotes"):
            parsed["used_documents"] = []

        human = parsed.get("answer_text","")
        used_sources = list({q.get("source") for q in parsed.get("quotes", []) if q.get("source")})
        self._log(conversation_id, question, human, used_sources, policy_flags=policy_flags, raw=raw, json_obj=parsed)
        self.memory.add(conversation_id, question, human)

        dbg["parsed_json"] = parsed
        dbg["policy"]["final_flags"] = policy_flags
        return {"answer": human, "json": parsed, "debug": dbg}

    # ----- REPL helpers -----
    def collection_count(self) -> int:
        try:
            # For PGVector, try to get count via SQL query
            from sqlalchemy import text
            conn = self.vectordb._conn
            result = conn.execute(text(f"SELECT COUNT(*) FROM {COLLECTION_NAME}"))
            return int(result.fetchone()[0])
        except Exception:
            return -1

    def peek(self, query: str, k: int = 3):
        try:
            hits = self.vectordb.similarity_search_with_score(query, k=k)
            out = []
            for d, s in hits:
                out.append({
                    "source": d.metadata.get("source","Unknown"),
                    "page": d.metadata.get("page"),
                    "score_distance": float(s) if isinstance(s, (int,float)) else None,
                    "preview": (d.page_content[:240] + "…") if len(d.page_content) > 240 else d.page_content
                })
            return out
        except Exception as e:
            return {"error": str(e)}

# =============== REPL ===============

def _print_section(title: str):
    print("\n" + "=" * 80)
    print(title)
    print("=" * 80)

def get_rag_agent() -> "RAGAgent":
    """Get or initialize RAG agent"""
    global rag_agent

    if rag_agent is not None:
        return rag_agent

    # Test database connection
    if not test_db_connection():
        raise HTTPException(
            status_code=503,
            detail="Could not connect to PostgreSQL database. Please check DATABASE_URL environment variable and ensure the database is running."
        )

    try:
        # Ensure project root for relative paths
        os.chdir(str(BASE_DIR))
        rag_agent = RAGAgent(model_name="gpt-5-mini")
        return rag_agent
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to initialize RAG agent: {str(e)}"
        )

def main():
    print("🔌 Testing PostgreSQL connection...")
    if not test_db_connection():
        print(f"❌ Error: Could not connect to PostgreSQL database")
        print("Please ensure DATABASE_URL or POSTGRES_URL environment variable is set")
        print("and run build_index.py first to create the vector database.")
        return

    print("✅ Database connection successful")
    print("\n🤖 Initializing Legal RAG Agent...")
    agent = get_rag_agent()
    conversation_id = "repl"
    debug_mode = True  # default ON

    print("\n🧑‍⚖️  Legal RAG REPL (type /exit to quit, /debug on|off, /clear, /stats, /peek <query>)")
    while True:
        try:
            q = input("\n❓ You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n👋 Bye!")
            break

        if not q:
            continue
        low = q.lower()
        if low in ("/exit", "exit", "quit"):
            print("👋 Bye!")
            break
        if low.startswith("/debug"):
            parts = q.split()
            if len(parts) == 2 and parts[1].lower() in ("on","off"):
                debug_mode = parts[1].lower() == "on"
                print(f"🔧 Debug is now {'ON' if debug_mode else 'OFF'}.")
            else:
                print("Usage: /debug on | /debug off")
            continue
        if low == "/clear":
            agent.memory.cache.pop(conversation_id, None)
            print("🧹 Cleared conversation memory.")
            continue
        if low == "/stats":
            n = agent.collection_count()
            print(f"📦 Collection count: {n} (re-index if 0 or -1)")
            continue
        if low.startswith("/peek"):
            parts = q.split(maxsplit=1)
            qry = parts[1] if len(parts) > 1 else "Client X"
            print(json.dumps(agent.peek(qry, k=3), indent=2, ensure_ascii=False))
            continue

        if debug_mode:
            result = agent.query_debug(q, conversation_id=conversation_id)
            ans = result["answer"]; dbg = result["debug"]

            _print_section("ANSWER")
            print(ans)

            _print_section("STRUCTURED JSON (Explainability)")
            print(json.dumps(result["json"], indent=2, ensure_ascii=False))

            _print_section("POLICY")
            print(json.dumps(dbg.get("policy", {}), indent=2))

            _print_section("MEMORY (Summary fed to retriever)")
            print(dbg.get("memory", {}).get("summary_used", "") or "(no prior memory)")

            _print_section("RETRIEVAL (Initial MMR hits)")
            print(json.dumps(dbg["retrieval"].get("initial_docs", []), indent=2, ensure_ascii=False))

            _print_section("RETRIEVAL (Lexical re-rank)")
            print(json.dumps(dbg["retrieval"].get("reranked_docs", []), indent=2, ensure_ascii=False))

            if "distance_scores" in dbg.get("retrieval", {}):
                _print_section("RETRIEVAL (Distance scores; smaller = better)")
                print(json.dumps(dbg["retrieval"]["distance_scores"], indent=2, ensure_ascii=False))

            _print_section("GATES")
            print(json.dumps(dbg.get("gates", {}), indent=2))

            _print_section("CONTEXT PREVIEW (what the LLM saw)")
            print(dbg.get("context_preview", "") or "(empty)")

            _print_section("RAW MODEL OUTPUT")
            print(dbg.get("model_raw", "") or "(empty)")

            print("\n🗂  (Run logs are saved under ./logs/runs)")
        else:
            result = agent.query(q, conversation_id=conversation_id, return_raw_json=True)
            print("\n🧾 Answer:")
            print(result["answer"])

if __name__ == "__main__":
    main()
