# document_loader.py
"""
Enhanced document loader that handles both regular and scanned PDFs with OCR.
"""
import os
from typing import List
from langchain_core.documents import Document
from langchain_community.document_loaders import (
    TextLoader, Docx2txtLoader, PyPDFLoader
)

# Try importing OCR-related libraries
try:
    import fitz  # PyMuPDF
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False

try:
    from pdf2image import convert_from_path
    import pytesseract
    from PIL import Image
    OCR_AVAILABLE = True
except ImportError:
    OCR_AVAILABLE = False


class EnhancedPDFLoader:
    """
    Enhanced PDF loader that handles both regular and scanned PDFs.

    Strategy:
    1. Try PyMuPDF first (handles both text-based and some scanned PDFs)
    2. If text extraction is poor, fall back to OCR with Tesseract
    """

    def __init__(self, file_path: str, use_ocr: bool = True):
        """
        Initialize the enhanced PDF loader.

        Args:
            file_path: Path to the PDF file
            use_ocr: Whether to use OCR for scanned documents (default: True)
        """
        self.file_path = file_path
        self.use_ocr = use_ocr and OCR_AVAILABLE

    def load(self) -> List[Document]:
        """Load the PDF and return a list of documents."""
        # First, try PyMuPDF for text extraction
        if PYMUPDF_AVAILABLE:
            docs = self._load_with_pymupdf()

            # Check if we got meaningful text
            total_text = "".join([doc.page_content for doc in docs])
            words = total_text.strip().split()

            # If we got less than 50 words, likely a scanned document
            if len(words) < 50 and self.use_ocr:
                print(f"  ⚠️  Low text extraction ({len(words)} words) - trying OCR...")
                docs = self._load_with_ocr()
            else:
                print(f"  ✓ Extracted {len(words)} words using PyMuPDF")

            return docs
        else:
            # Fall back to standard PyPDFLoader
            print("  ⚠️  PyMuPDF not available, using PyPDFLoader")
            loader = PyPDFLoader(self.file_path)
            return loader.load()

    def _load_with_pymupdf(self) -> List[Document]:
        """Load PDF using PyMuPDF (fitz)."""
        documents = []

        try:
            pdf_document = fitz.open(self.file_path)

            for page_num in range(len(pdf_document)):
                page = pdf_document[page_num]
                text = page.get_text()

                # Create a document for this page
                doc = Document(
                    page_content=text,
                    metadata={
                        "source": self.file_path,
                        "page": page_num + 1,
                        "total_pages": len(pdf_document)
                    }
                )
                documents.append(doc)

            pdf_document.close()

        except Exception as e:
            print(f"  ❌ Error loading with PyMuPDF: {e}")
            # Fall back to PyPDFLoader
            loader = PyPDFLoader(self.file_path)
            return loader.load()

        return documents

    def _load_with_ocr(self) -> List[Document]:
        """Load PDF using OCR (pdf2image + Tesseract)."""
        if not OCR_AVAILABLE:
            print("  ❌ OCR libraries not available. Install: pip install pdf2image pytesseract")
            print("  ❌ Also install system dependency: brew install tesseract (macOS)")
            return []

        documents = []

        try:
            # Convert PDF to images
            print("  📸 Converting PDF pages to images...")
            images = convert_from_path(self.file_path, dpi=300)

            print(f"  🔍 Running OCR on {len(images)} pages...")
            for page_num, image in enumerate(images, start=1):
                # Run OCR on the image
                text = pytesseract.image_to_string(image, lang='eng')

                # Create a document for this page
                doc = Document(
                    page_content=text,
                    metadata={
                        "source": self.file_path,
                        "page": page_num,
                        "total_pages": len(images),
                        "extraction_method": "ocr"
                    }
                )
                documents.append(doc)
                print(f"    Page {page_num}/{len(images)} - {len(text.split())} words extracted")

        except Exception as e:
            print(f"  ❌ Error during OCR: {e}")
            return []

        return documents


def load_document(file_path: str, use_ocr: bool = True) -> List[Document]:
    """
    Load a document based on its file extension.

    Args:
        file_path: Path to the document
        use_ocr: Whether to use OCR for scanned PDFs

    Returns:
        List of Document objects
    """
    file_name = os.path.basename(file_path)

    if file_path.endswith(".pdf"):
        print(f"📄 Loading PDF: {file_name}")
        loader = EnhancedPDFLoader(file_path, use_ocr=use_ocr)
        return loader.load()

    elif file_path.endswith(".docx"):
        print(f"📝 Loading DOCX: {file_name}")
        loader = Docx2txtLoader(file_path)
        return loader.load()

    elif file_path.endswith(".txt"):
        print(f"📃 Loading TXT: {file_name}")
        loader = TextLoader(file_path, encoding="utf-8")
        return loader.load()

    else:
        print(f"⚠️  Unsupported file type: {file_name}")
        return []


def load_all_documents(folder: str, use_ocr: bool = True) -> List[Document]:
    """
    Load all supported documents from a folder.

    Args:
        folder: Path to the folder containing documents
        use_ocr: Whether to use OCR for scanned PDFs

    Returns:
        List of all loaded documents
    """
    all_docs = []
    supported_extensions = [".pdf", ".docx", ".txt"]

    files = [f for f in os.listdir(folder) if not f.startswith('.')]
    files = [f for f in files if any(f.endswith(ext) for ext in supported_extensions)]

    print(f"\n📚 Found {len(files)} documents to process\n")

    for file_name in sorted(files):
        file_path = os.path.join(folder, file_name)
        docs = load_document(file_path, use_ocr=use_ocr)
        all_docs.extend(docs)
        print()  # Empty line for readability

    return all_docs


if __name__ == "__main__":
    # Test the loader
    test_file = "data/Service_Agreement_2023-scan.pdf"

    if os.path.exists(test_file):
        print(f"Testing enhanced loader on: {test_file}\n")
        docs = load_document(test_file, use_ocr=True)

        if docs:
            print(f"\n✅ Successfully loaded {len(docs)} pages")
            print(f"First page preview (first 500 chars):")
            print("-" * 80)
            print(docs[0].page_content[:500])
            print("-" * 80)
    else:
        print(f"Test file not found: {test_file}")
