# document_parser.py
"""
Document parsing & chunking utilities for RAG using Unstructured.

Features
--------
- Auto file-type detection with unstructured.partition.auto.partition
- Safe normalization of elements (text, type, metadata, coordinates, tables)
- Chunker that preserves tables and respects headings
- Optional FastAPI router for direct file uploads

Usage (Programmatic)
--------------------
from document_parser import parse_and_chunk_file, ChunkOptions

chunks, elements = parse_and_chunk_file("/path/to/file.pdf", ChunkOptions(max_tokens=800))

FastAPI (Optional)
------------------
In your main app:
    from document_parser import router as parser_router
    app.include_router(parser_router, prefix="/ingest", tags=["ingest"])

Then POST /ingest/parse with multipart file + JSON options.

Notes
-----
- If tiktoken is available, token-based chunking uses the OpenAI cl100k_base encoding by default.
- Otherwise, we fall back to an approximate character-based strategy.
- For heavy PDFs, use strategy="hi_res" to leverage layout-aware parsing (requires unstructured-inference deps).
"""

from __future__ import annotations

import io
import os
import sys
import json
import hashlib
import logging
import mimetypes
from dataclasses import dataclass, asdict
from typing import Any, Dict, Iterable, List, Optional, Tuple, Union

# Unstructured
from unstructured.partition.auto import partition  # Auto-detects file type & parser

# Optional: tiktoken for better token counting (fallback to char length if unavailable)
try:
    import tiktoken  # type: ignore
    _ENC = tiktoken.get_encoding("cl100k_base")
except Exception:
    tiktoken = None
    _ENC = None

# Optional FastAPI router (can be ignored if you don’t want an endpoint here)
try:
    from fastapi import APIRouter, UploadFile, File, Form
    from fastapi import HTTPException
    from fastapi import BackgroundTasks
    from pydantic import BaseModel
    _FASTAPI_AVAILABLE = True
except Exception:
    _FASTAPI_AVAILABLE = False

logger = logging.getLogger("document_parser")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


# ----------------------------- Data Models -----------------------------

@dataclass
class NormalizedElement:
    element_id: str
    type: str
    text: str
    page_number: Optional[int]
    filename: Optional[str]
    filetype: Optional[str]
    coordinates: Optional[Dict[str, Any]]
    metadata: Dict[str, Any]
    table_html: Optional[str] = None  # if available

@dataclass
class Chunk:
    chunk_id: str
    text: str
    tokens: int
    from_elements: List[str]          # list of element_ids that formed this chunk
    page_numbers: List[int]           # unique page numbers covered by the chunk
    source: Dict[str, Any]            # includes filename, filetype, sha256
    meta: Dict[str, Any]              # any additional meta (e.g., section heading)
    bounding_box: Optional[Dict[str, Any]] = None  # merged bounding box for visualization

@dataclass
class ChunkOptions:
    # If tiktoken is available, uses tokens; else char-length approximation
    max_tokens: int = 900
    overlap_tokens: int = 120
    # If tiktoken is not present, we'll interpret these as characters
    respect_headings: bool = True
    keep_tables_intact: bool = True
    combine_short_elements: bool = True
    min_element_length: int = 25  # chars; for combining short elements
    # For unstructured parsing:
    # - "fast": default (no layout model)
    # - "hi_res": layout/ocr model for complex PDFs (needs unstructured-inference)
    strategy: str = "fast"  # "fast" or "hi_res"
    # Pass-through kwargs to `partition` if needed
    partition_kwargs: Optional[Dict[str, Any]] = None


# ----------------------------- Utilities -----------------------------

def _guess_mime(path: str) -> str:
    m, _ = mimetypes.guess_type(path)
    return m or "application/octet-stream"


def _serialize_coordinates(coords_obj: Any) -> Optional[Dict[str, Any]]:
    """
    Unstructured coordinates can be None or a dataclass-like object with .points & .system.
    Extract layout dimensions from the coordinate system for proper scaling.
    """
    try:
        if coords_obj is None:
            return None
        points = getattr(coords_obj, "points", None)
        system = getattr(coords_obj, "system", None)
        if points is None:
            return None

        result = {"points": list(points), "system": str(system) if system else None}

        # Extract layout dimensions from the coordinate system (PixelSpace)
        if system is not None:
            layout_width = getattr(system, "width", None) or getattr(system, "layout_width", None)
            layout_height = getattr(system, "height", None) or getattr(system, "layout_height", None)
            if layout_width is not None:
                result["layout_width"] = float(layout_width)
            if layout_height is not None:
                result["layout_height"] = float(layout_height)

        return result
    except Exception:
        return None


def _safe_text(x: Any) -> str:
    try:
        return (x or "").strip()
    except Exception:
        return ""


def _is_table(el: Any) -> bool:
    # Unstructured Table elements usually have category 'Table' or type name containing 'Table'
    t = getattr(el, "category", None) or el.__class__.__name__
    return "Table" in str(t)


def _is_heading(el: Any) -> bool:
    # Titles/Headings typically have category 'Title' or class name 'Title'
    t = getattr(el, "category", None) or el.__class__.__name__
    return "Title" in str(t)


def _tokens_len(text: str) -> int:
    if not text:
        return 0
    if _ENC is not None:
        try:
            return len(_ENC.encode(text))
        except Exception:
            pass
    # Char fallback approximation
    return len(text)


def _hash_text(*parts: str) -> str:
    sha = hashlib.sha256()
    for p in parts:
        sha.update((p or "").encode("utf-8"))
    return sha.hexdigest()


def _merge_bounding_boxes(coords_list: List[Optional[Dict[str, Any]]]) -> Optional[Dict[str, Any]]:
    """
    Merge multiple bounding boxes into a single bounding box that encompasses all of them.

    Args:
        coords_list: List of coordinate dicts with format {"points": [[x,y], ...], "system": str, "layout_width": float, "layout_height": float}

    Returns:
        Merged bounding box with same format, or None if no valid coordinates
    """
    # DEBUG: Log how many coords received and how many are valid
    total_coords = len(coords_list)
    none_coords = sum(1 for c in coords_list if c is None)
    valid_coords = [c for c in coords_list if c and c.get("points")]

    logger.info(f"🔍 BBOX MERGE DEBUG: Received {total_coords} coords, {none_coords} are None, {len(valid_coords)} are valid")

    if not valid_coords:
        logger.warning(f"⚠️ BBOX MERGE: No valid coordinates to merge!")
        return None

    try:
        # Collect all points from all bounding boxes
        all_points = []
        system = None
        layout_width = None
        layout_height = None

        for i, coord in enumerate(valid_coords):
            points = coord.get("points", [])
            if not system and coord.get("system"):
                system = coord["system"]
            if layout_width is None and coord.get("layout_width"):
                layout_width = coord["layout_width"]
            if layout_height is None and coord.get("layout_height"):
                layout_height = coord["layout_height"]

            # DEBUG: Log each coordinate's bounds
            if points:
                x_coords_elem = [p[0] for p in points if len(p) >= 2]
                y_coords_elem = [p[1] for p in points if len(p) >= 2]
                if x_coords_elem and y_coords_elem:
                    logger.info(f"  Element {i}: x=[{min(x_coords_elem):.1f}, {max(x_coords_elem):.1f}], y=[{min(y_coords_elem):.1f}, {max(y_coords_elem):.1f}]")

            all_points.extend(points)

        if not all_points:
            logger.warning(f"⚠️ BBOX MERGE: No points extracted from valid coordinates!")
            return None

        # Find min/max x and y to create encompassing rectangle
        x_coords = [p[0] for p in all_points if len(p) >= 2]
        y_coords = [p[1] for p in all_points if len(p) >= 2]

        if not x_coords or not y_coords:
            logger.warning(f"⚠️ BBOX MERGE: Failed to extract x/y coordinates from points!")
            return None

        min_x, max_x = min(x_coords), max(x_coords)
        min_y, max_y = min(y_coords), max(y_coords)

        # DEBUG: Log final merged bounds
        logger.info(f"✅ BBOX MERGE RESULT: x=[{min_x:.1f}, {max_x:.1f}], y=[{min_y:.1f}, {max_y:.1f}], layout={layout_width}x{layout_height}")

        # Return bounding box as rectangle corners (top-left, top-right, bottom-right, bottom-left)
        result = {
            "points": [[min_x, min_y], [max_x, min_y], [max_x, max_y], [min_x, max_y]],
            "system": system
        }

        # Include layout dimensions for proper scaling on frontend
        if layout_width is not None:
            result["layout_width"] = layout_width
        if layout_height is not None:
            result["layout_height"] = layout_height

        return result
    except Exception as e:
        logger.warning(f"Failed to merge bounding boxes: {e}")
        return None


def _element_to_normalized(el: Any, filename: Optional[str], filetype: Optional[str]) -> NormalizedElement:
    text = _safe_text(getattr(el, "text", None))
    md = getattr(el, "metadata", None)
    meta_dict: Dict[str, Any] = {}
    page_number = None
    coords = None
    table_html = None

    try:
        if md:
            # Avoid non-serializable objects
            page_number = getattr(md, "page_number", None)
            filename_md = getattr(md, "filename", None)
            if filename is None and filename_md:
                filename = filename_md

            # Many useful fields: last_modified, languages, sent_from, etc.
            meta_dict = {
                k: v
                for k, v in md.__dict__.items()
                if not k.startswith("_") and k not in ("coordinates",)
            }

            coords = _serialize_coordinates(getattr(md, "coordinates", None))
    except Exception:
        pass

    # Try to capture table HTML if available
    if _is_table(el):
        try:
            # Some versions expose md.text_as_html or el.metadata.to_dict().get("text_as_html")
            table_html = getattr(md, "text_as_html", None) or None
            if not table_html and hasattr(md, "to_dict"):
                table_html = md.to_dict().get("text_as_html")
        except Exception:
            table_html = None

    el_type = getattr(el, "category", None) or el.__class__.__name__
    element_id = _hash_text(text, str(page_number or ""), str(el_type), filename or "")

    return NormalizedElement(
        element_id=element_id,
        type=str(el_type),
        text=text,
        page_number=page_number if isinstance(page_number, int) else None,
        filename=filename,
        filetype=filetype,
        coordinates=coords,
        metadata=meta_dict or {},
        table_html=table_html,
    )


# ----------------------------- Core Parsing -----------------------------

def parse_file_to_elements(
    file_path: str,
    *,
    strategy: str = "fast",
    partition_kwargs: Optional[Dict[str, Any]] = None,
) -> List[NormalizedElement]:
    """
    Partition a document into unstructured elements and normalize them.

    strategy:
        - "fast": default text-based partitioners (quick)
        - "hi_res": layout/ocr (uses unstructured-inference; better on complex PDFs)
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(file_path)

    filetype = _guess_mime(file_path)
    pk = dict(partition_kwargs or {})

    # Map strategy to unstructured args (conservative defaults)
    # Note: kwargs vary by backend; these are safe typical ones.
    if strategy == "hi_res":
        # try layout-aware/ocr for PDFs and images
        pk.setdefault("strategy", "hi_res")
        pk.setdefault("ocr_languages", "eng")  # adjust if you expect other langs
    else:
        # Let auto partition pick the fastest available method
        pk.setdefault("strategy", "fast")

    logger.info(f"Parsing file='{file_path}' mime='{filetype}' strategy='{pk.get('strategy')}'")
    raw_elements = partition(filename=file_path, **pk)

    filename = os.path.basename(file_path)
    normalized: List[NormalizedElement] = [
        _element_to_normalized(el, filename=filename, filetype=filetype) for el in raw_elements
    ]

    # Filter empty elements
    normalized = [e for e in normalized if e.text or e.table_html]
    return normalized


# ----------------------------- Chunking -----------------------------

def chunk_elements(
    elements: List[NormalizedElement],
    options: ChunkOptions,
    source_info: Optional[Dict[str, Any]] = None,
) -> List[Chunk]:
    """
    Convert normalized elements into retrieval-friendly chunks.

    Rules:
    - Tables are never split (if keep_tables_intact)
    - If respect_headings=True, start a new chunk after headings
    - Token/char budget enforced with optional overlap
    - Combine small elements to reduce fragmentation
    """
    max_len = options.max_tokens
    overlap = max(0, options.overlap_tokens)

    chunks: List[Chunk] = []
    cur_text_parts: List[str] = []
    cur_ids: List[str] = []
    cur_pages: List[int] = []
    cur_coords: List[Optional[Dict[str, Any]]] = []  # Track coordinates for bbox merging
    section_heading: Optional[str] = None

    def current_len() -> int:
        return _tokens_len("\n".join(cur_text_parts))

    def flush_chunk(force: bool = False):
        if not cur_text_parts:
            return
        text = "\n".join(cur_text_parts).strip()
        if not text:
            _reset()
            return
        tok_len = _tokens_len(text)
        chunk_id = _hash_text(text, ",".join(cur_ids))

        # DEBUG: Log chunk details before merging
        logger.info(f"🔨 FLUSHING CHUNK: {len(cur_ids)} elements, {tok_len} tokens, text preview: {text[:100]}...")
        logger.info(f"  📊 Element IDs: {cur_ids}")
        logger.info(f"  📍 Pages: {sorted(set(cur_pages))}")
        logger.info(f"  🗺️ Coordinates: {len(cur_coords)} total, {sum(1 for c in cur_coords if c is not None)} non-None")

        # Compute merged bounding box from all element coordinates
        merged_bbox = _merge_bounding_boxes(cur_coords)
        if merged_bbox:
            logger.info(f"📦 Chunk bounding box: {len(cur_coords)} coords merged -> {merged_bbox.get('points', [])[0] if merged_bbox.get('points') else 'none'}")
        else:
            logger.warning(f"⚠️ No bounding box for chunk with {len(cur_coords)} coords")

        chunks.append(
            Chunk(
                chunk_id=chunk_id,
                text=text,
                tokens=tok_len,
                from_elements=cur_ids.copy(),
                page_numbers=sorted(set(cur_pages)),
                source=source_info or {},
                meta={"section_heading": section_heading} if section_heading else {},
                bounding_box=merged_bbox,
            )
        )
        if force or overlap == 0 or tok_len <= overlap:
            _reset()
        else:
            # Create overlap by trimming the start while keeping last `overlap` tokens approx.
            if _ENC is not None:
                tokens = _ENC.encode(text)
                keep = tokens[-overlap:]
                tail_text = _ENC.decode(keep)
            else:
                tail_text = text[-overlap:]
            _reset()
            cur_text_parts.append(tail_text)
            # NOTE: From-elements/pages after overlap are not exact; we reset tracking to avoid confusion.
            # You can carry over the last element id if desired.

    def _reset():
        cur_text_parts.clear()
        cur_ids.clear()
        cur_pages.clear()
        cur_coords.clear()

    for el in elements:
        is_table = options.keep_tables_intact and bool(el.table_html) or _is_table_type(el.type)

        # Start a new section on headings if requested
        if options.respect_headings and _is_heading_type(el.type):
            # Flush current before new heading
            flush_chunk(force=True)
            section_heading = el.text.strip() if el.text else None

        # Decide the representation for this element
        if is_table and el.table_html:
            representation = _table_repr(el)
        else:
            representation = el.text or ""

        representation = representation.strip()
        if not representation:
            continue

        # Combine short elements to reduce fragmentation
        if options.combine_short_elements and len(representation) < options.min_element_length:
            rep_with_space = representation if not cur_text_parts else " " + representation
            if current_len() + _tokens_len(rep_with_space) <= max_len:
                cur_text_parts.append(rep_with_space)
                cur_ids.append(el.element_id)
                if el.page_number is not None:
                    cur_pages.append(el.page_number)
                cur_coords.append(el.coordinates)
                continue
            else:
                flush_chunk()
                cur_text_parts.append(representation)
                cur_ids.append(el.element_id)
                if el.page_number is not None:
                    cur_pages.append(el.page_number)
                cur_coords.append(el.coordinates)
                continue

        # If the element alone exceeds the window, split on sentences/lines
        el_tokens = _tokens_len(representation)
        if el_tokens > max_len:
            # flush current first
            flush_chunk()
            for piece in _split_large_text(representation, max_len):
                cur_text_parts.append(piece)
                cur_ids.append(el.element_id)
                if el.page_number is not None:
                    cur_pages.append(el.page_number)
                cur_coords.append(el.coordinates)
                flush_chunk()
            continue

        # Normal accumulation
        if current_len() + el_tokens <= max_len:
            cur_text_parts.append(representation)
            cur_ids.append(el.element_id)
            if el.page_number is not None:
                cur_pages.append(el.page_number)
            cur_coords.append(el.coordinates)
        else:
            flush_chunk()
            cur_text_parts.append(representation)
            cur_ids.append(el.element_id)
            if el.page_number is not None:
                cur_pages.append(el.page_number)
            cur_coords.append(el.coordinates)

        # If this was a table, flush immediately to keep it intact
        if is_table:
            flush_chunk()

    # Final flush
    flush_chunk(force=True)
    return chunks


def _is_table_type(type_name: str) -> bool:
    # Generic match for various backends
    return "Table" in str(type_name)


def _is_heading_type(type_name: str) -> bool:
    return "Title" in str(type_name) or "Heading" in str(type_name)


def _table_repr(el: NormalizedElement) -> str:
    # Prefer HTML for fidelity; fallback to text if HTML missing
    if el.table_html:
        return f"[TABLE]\n{el.table_html}\n[/TABLE]"
    return el.text or ""


def _split_large_text(text: str, max_len: int) -> Iterable[str]:
    """
    Split a large string into <= max_len pieces with preference for sentence/line boundaries.
    Token-aware if tiktoken available, else character-based.
    """
    if _ENC is None:
        # char-based
        pieces: List[str] = []
        buf: List[str] = []
        cur = 0
        # split on sentences or newlines
        units = _smart_units(text)
        for u in units:
            ul = len(u)
            if cur + ul > max_len and buf:
                pieces.append("".join(buf).strip())
                buf = [u]
                cur = ul
            else:
                buf.append(u)
                cur += ul
        if buf:
            pieces.append("".join(buf).strip())
        return [p for p in pieces if p]
    else:
        # token-based
        toks = _ENC.encode(text)
        for i in range(0, len(toks), max_len):
            yield _ENC.decode(toks[i:i + max_len]).strip()


def _smart_units(text: str) -> List[str]:
    # Break on sentence-ish endings and newlines to keep content coherent
    import re
    parts = re.split(r'(\n+|(?<=[.!?])\s+)', text)
    out: List[str] = []
    buf = ""
    for p in parts:
        if p is None:
            continue
        buf += p
        if p.strip() == "" or p.endswith("\n") or p.strip() in {".", "!", "?"}:
            out.append(buf)
            buf = ""
    if buf:
        out.append(buf)
    return out


# ----------------------------- High-level API -----------------------------

def parse_and_chunk_file(
    file_path: str,
    options: Optional[ChunkOptions] = None,
) -> Tuple[List[Chunk], List[NormalizedElement]]:
    """
    Convenience: parse -> normalize -> chunk. Returns (chunks, elements).
    """
    options = options or ChunkOptions()

    elements = parse_file_to_elements(
        file_path=file_path,
        strategy=options.strategy,
        partition_kwargs=options.partition_kwargs,
    )

    # Source info to attach in chunks (handy for provenance)
    filename = os.path.basename(file_path)
    filetype = _guess_mime(file_path)
    sha = _sha256_of_file(file_path)

    source_info = {
        "filename": filename,
        "filetype": filetype,
        "sha256": sha,
    }

    chunks = chunk_elements(elements, options=options, source_info=source_info)
    return chunks, elements


def _sha256_of_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(65536), b""):
            h.update(block)
    return h.hexdigest()


# ----------------------------- Optional FastAPI Router -----------------------------

# if _FASTAPI_AVAILABLE:
#     router = APIRouter()

#     class ParseResponse(BaseModel):
#         chunks: List[Dict[str, Any]]
#         elements: List[Dict[str, Any]]

#     @router.post("/parse", response_model=ParseResponse)
#     async def parse_endpoint(
#         file: UploadFile = File(...),
#         strategy: str = Form("fast"),           # "fast" | "hi_res"
#         max_tokens: int = Form(900),
#         overlap_tokens: int = Form(120),
#         respect_headings: bool = Form(True),
#         keep_tables_intact: bool = Form(True),
#         combine_short_elements: bool = Form(True),
#         min_element_length: int = Form(25),
#         partition_kwargs_json: Optional[str] = Form(None),  # JSON string for advanced args
#         background_tasks: Optional[BackgroundTasks] = None,
#     ) -> ParseResponse:
#         """
#         Multipart form:
#             file: uploaded file
#             strategy: fast|hi_res
#             ...chunking & partition options
#         """
#         # Save to a temp path
#         try:
#             contents = await file.read()
#             if not contents:
#                 raise HTTPException(status_code=400, detail="Empty file.")

#             tmp_dir = os.environ.get("PARSER_TMP_DIR", "/tmp")
#             os.makedirs(tmp_dir, exist_ok=True)
#             tmp_path = os.path.join(tmp_dir, file.filename or "upload.bin")
#             with open(tmp_path, "wb") as f:
#                 f.write(contents)
#         except Exception as e:
#             logger.exception("Failed to save uploaded file")
#             raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")

#         # Prepare options
#         pk: Optional[Dict[str, Any]] = None
#         if partition_kwargs_json:
#             try:
#                 pk = json.loads(partition_kwargs_json)
#                 if not isinstance(pk, dict):
#                     pk = None
#             except Exception:
#                 pk = None

#         options = ChunkOptions(
#             max_tokens=max_tokens,
#             overlap_tokens=overlap_tokens,
#             respect_headings=respect_headings,
#             keep_tables_intact=keep_tables_intact,
#             combine_short_elements=combine_short_elements,
#             min_element_length=min_element_length,
#             strategy=strategy,
#             partition_kwargs=pk,
#         )

#         try:
#             chunks, elements = parse_and_chunk_file(tmp_path, options)
#         except Exception as e:
#             logger.exception("Parsing failed")
#             raise HTTPException(status_code=500, detail=f"Parsing failed: {e}")
#         finally:
#             # Optionally delete temp file in background to avoid blocking
#             def _cleanup(p: str):
#                 try:
#                     if os.path.exists(p):
#                         os.remove(p)
#                 except Exception:
#                     pass

#             if background_tasks is not None:
#                 background_tasks.add_task(_cleanup, tmp_path)
#             else:
#                 _cleanup(tmp_path)

#         # Serialize dataclasses
#         chunks_out = [asdict(c) for c in chunks]
#         elements_out = [asdict(e) for e in elements]

#         return ParseResponse(chunks=chunks_out, elements=elements_out)

# else:
#     router = None  # FastAPI not installed or not desired


# ----------------------------- Optional FastAPI Router -----------------------------
# Only expose the API when this module is imported by FastAPI (not when run as __main__)
if _FASTAPI_AVAILABLE and __name__ != "__main__":
    from fastapi import BackgroundTasks  # ensure imported here

    router = APIRouter()

    class ParseResponse(BaseModel):
        chunks: List[Dict[str, Any]]
        elements: List[Dict[str, Any]]

    @router.post("/parse", response_model=ParseResponse)
    async def parse_endpoint(
        file: UploadFile = File(...),
        strategy: str = Form("fast"),           # "fast" | "hi_res"
        max_tokens: int = Form(900),
        overlap_tokens: int = Form(120),
        respect_headings: bool = Form(True),
        keep_tables_intact: bool = Form(True),
        combine_short_elements: bool = Form(True),
        min_element_length: int = Form(25),
        partition_kwargs_json: Optional[str] = Form(None),  # JSON string for advanced args
        background_tasks: BackgroundTasks = ...,
    ) -> ParseResponse:
        """
        Multipart form:
            file: uploaded file
            strategy: fast|hi_res
            ...chunking & partition options
        """
        # Save to a temp path
        try:
            contents = await file.read()
            if not contents:
                raise HTTPException(status_code=400, detail="Empty file.")

            tmp_dir = os.environ.get("PARSER_TMP_DIR", "/tmp")
            os.makedirs(tmp_dir, exist_ok=True)
            tmp_path = os.path.join(tmp_dir, file.filename or "upload.bin")
            with open(tmp_path, "wb") as f:
                f.write(contents)
        except Exception as e:
            logger.exception("Failed to save uploaded file")
            raise HTTPException(status_code=500, detail=f"Failed to save file: {e}")

        # Prepare options
        pk: Optional[Dict[str, Any]] = None
        if partition_kwargs_json:
            try:
                pk = json.loads(partition_kwargs_json)
                if not isinstance(pk, dict):
                    pk = None
            except Exception:
                pk = None

        options = ChunkOptions(
            max_tokens=max_tokens,
            overlap_tokens=overlap_tokens,
            respect_headings=respect_headings,
            keep_tables_intact=keep_tables_intact,
            combine_short_elements=combine_short_elements,
            min_element_length=min_element_length,
            strategy=strategy,
            partition_kwargs=pk,
        )

        try:
            chunks, elements = parse_and_chunk_file(tmp_path, options)
        except Exception as e:
            logger.exception("Parsing failed")
            raise HTTPException(status_code=500, detail=f"Parsing failed: {e}")
        finally:
            def _cleanup(p: str):
                try:
                    if os.path.exists(p):
                        os.remove(p)
                except Exception:
                    pass

            # background_tasks is always injected (non-optional)
            background_tasks.add_task(_cleanup, tmp_path)

        return ParseResponse(
            chunks=[asdict(c) for c in chunks],
            elements=[asdict(e) for e in elements],
        )
else:
    router = None

# ----------------------------- CLI for quick tests -----------------------------

def _cli():
    import argparse
    ap = argparse.ArgumentParser(description="Parse & chunk a document with Unstructured")
    ap.add_argument("path", help="Path to file (PDF, DOCX, PPTX, HTML, etc.)")
    ap.add_argument("--strategy", default="fast", choices=["fast", "hi_res"], help="Parsing strategy")
    ap.add_argument("--max-tokens", type=int, default=900)
    ap.add_argument("--overlap-tokens", type=int, default=120)
    ap.add_argument("--no-respect-headings", action="store_true")
    ap.add_argument("--no-keep-tables", action="store_true")
    ap.add_argument("--no-combine-short", action="store_true")
    ap.add_argument("--min-element-length", type=int, default=25)
    ap.add_argument("--partition-kwargs", type=str, default=None, help="JSON string with extra partition kwargs")
    args = ap.parse_args()

    pk = json.loads(args.partition_kwargs) if args.partition_kwargs else None
    opts = ChunkOptions(
        max_tokens=args.max_tokens,
        overlap_tokens=args.overlap_tokens,
        respect_headings=not args.no_respect_headings,
        keep_tables_intact=not args.no_keep_tables,
        combine_short_elements=not args.no_combine_short,
        min_element_length=args.min_element_length,
        strategy=args.strategy,
        partition_kwargs=pk,
    )

    chunks, elements = parse_and_chunk_file(args.path, opts)
    print(json.dumps({
        "chunks": [asdict(c) for c in chunks],
        "elements": [asdict(e) for e in elements],
    }, ensure_ascii=False))


if __name__ == "__main__":
    import argparse
    import json
    from pathlib import Path
    from dataclasses import asdict
    from datetime import datetime

        # --------- Cache helpers (reuse parsed/<file>.json if sha256 unchanged) ---------
    import hashlib

    def _sha256_file(p: Path) -> str:
        h = hashlib.sha256()
        with open(p, "rb") as f:
            for block in iter(lambda: f.read(65536), b""):
                h.update(block)
        return h.hexdigest()

    def _dict_to_chunk(d: Dict[str, Any]):
        # Rehydrate to your Chunk dataclass for consistent downstream handling
        return Chunk(
            chunk_id=d["chunk_id"],
            text=d["text"],
            tokens=d.get("tokens", 0),
            from_elements=d.get("from_elements", []),
            page_numbers=d.get("page_numbers", []),
            source=d.get("source", {}),
            meta=d.get("meta", {}),
        )

    def _dict_to_element(d: Dict[str, Any]):
        return NormalizedElement(
            element_id=d["element_id"],
            type=d["type"],
            text=d.get("text", ""),
            page_number=d.get("page_number"),
            filename=d.get("filename"),
            filetype=d.get("filetype"),
            coordinates=d.get("coordinates"),
            metadata=d.get("metadata", {}),
            table_html=d.get("table_html"),
        )

    def _load_cached_parse(json_path: Path, expect_sha: str) -> Optional[Tuple[List[Chunk], List[NormalizedElement]]]:
        try:
            with open(json_path, "r", encoding="utf-8") as jf:
                payload = json.load(jf)
            chunks_raw = payload.get("chunks") or []
            if not chunks_raw:
                return None
            # validate sha on first chunk (all chunks have same source sha)
            first_sha = (chunks_raw[0].get("source") or {}).get("sha256")
            if not first_sha or first_sha != expect_sha:
                return None
            chunks = [_dict_to_chunk(c) for c in chunks_raw]
            elements = [_dict_to_element(e) for e in (payload.get("elements") or [])]
            return chunks, elements
        except Exception:
            return None


    # --------- Paths consistent with backend/main.py defaults ---------
    BACKEND_DIR = Path(__file__).parent
    BASE_DIR = BACKEND_DIR.parent
    
    
    DEFAULT_DATA_DIR = BASE_DIR / "data"
    DEFAULT_PARSED_DIR = BASE_DIR / "parsed"
    DEFAULT_CHROMA_DIR = BASE_DIR / "demo_chroma"

    print("BASE_DIR", BASE_DIR)
    print("DEFAULT_DATA_DIR", DEFAULT_DATA_DIR)
    print("DEFAULT_PARSED_DIR", DEFAULT_PARSED_DIR)
    print("DEFAULT_CHROMA_DIR", DEFAULT_CHROMA_DIR) 

    # exit()

    parser = argparse.ArgumentParser(
        description="Parse & chunk documents with Unstructured and optionally build a Chroma index."
    )
    parser.add_argument("--data-dir", type=str, default=str(DEFAULT_DATA_DIR),
                        help="Input directory containing documents (default: ../data)")
    parser.add_argument("--out-dir", type=str, default=str(DEFAULT_PARSED_DIR),
                        help="Output directory to save parsed JSON results (default: ../parsed)")
    parser.add_argument("--strategy", type=str, default="hi_res", choices=["fast", "hi_res"],
                        help="Parsing strategy: fast (text) or hi_res (layout/ocr)")
    parser.add_argument("--max-tokens", type=int, default=900)
    parser.add_argument("--overlap", type=int, default=120)
    parser.add_argument("--write-json", action="store_true",
                        help="Write per-file parsed output (elements+chunks) to --out-dir")
    # ---- Index build flags ----
    parser.add_argument("--build-index", action="store_true",
                        help="Build a Chroma vector index from parsed chunks")
    parser.add_argument("--chroma-dir", type=str, default=str(DEFAULT_CHROMA_DIR),
                        help="Directory for Chroma persistent storage (default: ../demo_chroma)")
    parser.add_argument("--collection-name", type=str, default="langchain",
                        help="Chroma collection name (default: langchain)")
    parser.add_argument("--embedding-model", type=str, default="text-embedding-3-small",
                        help="OpenAI embedding model (default: text-embedding-3-small)")
    parser.add_argument("--force-reparse", action="store_true",
                        help="Ignore cache and reparse sources even if parsed JSON exists")

    parser.add_argument("--populate-cache", action="store_true",
                    help="Parse only files with missing/stale cache JSON and write cache")
    parser.add_argument("--cache-only", action="store_true",
                    help="Populate/refresh cache and exit (no indexing)")



    args = parser.parse_args()

    data_dir = Path(args.data_dir).resolve()
    out_dir = Path(args.out_dir).resolve()
    chroma_dir = Path(args.chroma_dir).resolve()

    out_dir.mkdir(parents=True, exist_ok=True)
    chroma_dir.mkdir(parents=True, exist_ok=True)

    print("data_dir", data_dir)
    print("out_dir", out_dir)
    print("chroma_dir", chroma_dir)


    # exit()
    opts = ChunkOptions(
        max_tokens=args.max_tokens,
        overlap_tokens=args.overlap,
        strategy=args.strategy,
        respect_headings=True,
        keep_tables_intact=True,
    )

    print(f"📂 Parsing documents from: {data_dir}")
    files = [p for p in data_dir.glob("*") if p.suffix.lower() in {
        ".pdf", ".docx", ".doc", ".pptx", ".txt", ".md", ".html"
        # ".docx", ".doc", ".pptx", ".txt", ".md", ".html"
    } and p.is_file()]

    if not files:
        print("⚠️ No supported files found in the data directory.")
        sys.exit(0)

    # Parse everything (with cache) and optionally write JSON
    all_chunks = []
    from langchain_core.documents import Document
    langchain_docs = []

    parse_start = datetime.now()

    # Decide if we should write cache this run:
    # - write JSON when: --write-json OR --populate-cache
    should_write_cache = args.write_json or args.populate_cache

    for f in files:
        print(f"➡️  Processing: {f.name}")
        try:
            out_path = out_dir / f"{f.stem}.json"
            file_sha = _sha256_file(f)
            used_cache = False
            chunks = None
            elements = None

            # Try cache unless forced
            if out_path.exists() and not args.force_reparse:
                cached = _load_cached_parse(out_path, expect_sha=file_sha)
                if cached:
                    chunks, elements = cached
                    used_cache = True
                    print(f"   ♻️  Using cache → {out_path.name} "
                          f"({len(chunks)} chunks, {len(elements)} elements)")
                else:
                    print("   🔁 Cache miss/mismatch (sha changed). Re-parsing...")

            if not used_cache:
                # Fresh parse
                chunks, elements = parse_and_chunk_file(str(f), opts)

                # Ensure SHA in provenance (guard if future edits change parse code)
                for c in chunks:
                    c.source.setdefault("sha256", file_sha)

                # **Fill cache** if requested (populate-cache OR write-json)
                if should_write_cache:
                    out_json = {
                        "file": f.name,
                        "chunks": [asdict(c) for c in chunks],
                        "elements": [asdict(e) for e in elements],
                    }
                    with open(out_path, "w", encoding="utf-8") as jf:
                        json.dump(out_json, jf, ensure_ascii=False, indent=2)
                    print(f"   💾 Cache saved → {out_path.name} "
                          f"({len(chunks)} chunks, {len(elements)} elements)")

            # Convert to LangChain docs (needed if you’ll build index)
            for c in chunks:
                metadata = {
                    "source": c.source.get("filename", f.name),
                    "chunk_id": c.chunk_id,
                    "tokens": c.tokens,
                    "from_elements": len(c.from_elements),
                }
                if c.page_numbers:
                    metadata["page"] = c.page_numbers[0]
                    metadata["pages"] = ",".join(str(p) for p in c.page_numbers)
                if c.meta.get("section_heading"):
                    metadata["section"] = c.meta["section_heading"]

                langchain_docs.append(Document(page_content=c.text, metadata=metadata))
            all_chunks.extend(chunks)

            print(f"   ✅ {f.name}: {len(chunks)} chunks ({'cache' if used_cache else 'parsed'})")

        except Exception as e:
            print(f"   ❌ Error processing {f.name}: {e}")

    parse_elapsed = (datetime.now() - parse_start).total_seconds()
    print(f"✅ Parsed {len(files)} documents → {len(all_chunks)} chunks in {parse_elapsed:.2f}s")

    # Exit early if user only wanted to populate cache
    if args.cache_only:
        print("🧳 Cache population complete; exiting (--cache-only).")
        sys.exit(0)


    # ---------------- Build Chroma Index (optional) ----------------
    if args.build_index:
        # NumPy 2.0 shim BEFORE importing chromadb
        import numpy as np
        _aliases = {"float_": "float64", "int_": "int64", "uint": "uint64"}
        for old_name, new_name in _aliases.items():
            if not hasattr(np, old_name) and hasattr(np, new_name):
                setattr(np, old_name, getattr(np, new_name))

        # imports only if building index
        from langchain_openai import OpenAIEmbeddings
        from langchain_community.vectorstores import Chroma
        import chromadb
        from chromadb.config import Settings
        import os as _os

        if not _os.environ.get("OPENAI_API_KEY"):
            print("❌ OPENAI_API_KEY is not set. Set it in env to create embeddings.")
            sys.exit(1)

        # Create embeddings
        print(f"🧠 Creating embeddings (model={args.embedding_model})...")
        embed_start = datetime.now()
        embeddings = OpenAIEmbeddings(model=args.embedding_model)

        # Initialize persistent Chroma client
        print(f"💾 Initializing Chroma at {chroma_dir} (collection={args.collection_name})...")
        client = chromadb.PersistentClient(
            path=str(chroma_dir),
            settings=Settings(anonymized_telemetry=False),
        )

        # Wipe existing collection to rebuild cleanly
        try:
            client.delete_collection(args.collection_name)
            print(f"🗑️  Deleted existing collection '{args.collection_name}'")
        except Exception as e:
            print(f"ℹ️  No existing collection to delete (or ignore): {e}")

        # Build the vector store
        print("🏗️  Building vector database from chunks...")
        vectordb = Chroma.from_documents(
            documents=langchain_docs,
            embedding=embeddings,
            client=client,
            collection_name=args.collection_name,
        )

        # Verify count
        try:
            collection = client.get_collection(args.collection_name)
            count = collection.count()
            print(f"✅ Verification: collection '{args.collection_name}' has {count} documents")
            if count == 0:
                print("❌ WARNING: Collection created but appears empty!")
        except Exception as e:
            print(f"❌ Failed to verify collection: {e}")

        embed_elapsed = (datetime.now() - embed_start).total_seconds()
        print(f"✅ Vector DB built in {embed_elapsed:.2f}s at {chroma_dir}")
