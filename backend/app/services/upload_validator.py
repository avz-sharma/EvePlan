"""In-memory upload type, byte and PDF-page limits and prompt-data boundaries."""

import io
from typing import Literal

import pypdf

MAX_UPLOAD_BYTES = 5_242_880  # 5 MB
MAX_PDF_PAGES = 3

MAGIC_SIGNATURES: dict[str, bytes] = {
    "pdf": b"%PDF-",
    "jpeg": b"\xff\xd8\xff",
    "png": b"\x89PNG\r\n\x1a\n",
}


class FileValidationError(Exception):
    """Base error for quote upload validation."""

    pass


class UnsupportedFileTypeError(FileValidationError):
    """Raised when file magic bytes do not match allowed media types."""

    pass


class PayloadTooLargeError(FileValidationError):
    """Raised when payload exceeds size limit or PDF exceeds page limit."""

    pass


def detect_magic_type(content: bytes) -> Literal["pdf", "jpeg", "png", "webp"]:
    """Inspects the leading magic bytes of in-memory file content."""
    if len(content) < 12:
        raise UnsupportedFileTypeError("File header too short to determine MIME type.")

    if content.startswith(MAGIC_SIGNATURES["pdf"]):
        return "pdf"
    if content.startswith(MAGIC_SIGNATURES["jpeg"]):
        return "jpeg"
    if content.startswith(MAGIC_SIGNATURES["png"]):
        return "png"
    if content.startswith(b"RIFF") and content[8:12] == b"WEBP":
        return "webp"

    raise UnsupportedFileTypeError(
        "Invalid file magic bytes. Allowed formats: PDF, JPEG, PNG, WEBP."
    )


def validate_quote_upload(content: bytes, filename: str = "quote") -> tuple[str, int]:
    """Strictly validates uploaded bytes purely in memory complying with LAW-06.

    Returns:
        tuple[str, int]: (detected_type, page_count_or_1)
    """
    if len(content) > MAX_UPLOAD_BYTES:
        raise PayloadTooLargeError(
            f"File size ({len(content)} bytes) exceeds the strict 5MB limit ({MAX_UPLOAD_BYTES} bytes)."
        )

    file_type = detect_magic_type(content)

    pages = 1
    if file_type == "pdf":
        try:
            reader = pypdf.PdfReader(io.BytesIO(content))
            pages = len(reader.pages)
        except (pypdf.errors.PdfReadError, OSError, ValueError) as e:
            raise FileValidationError(f"Corrupt or unreadable PDF: {e}") from e

        if pages > MAX_PDF_PAGES:
            raise PayloadTooLargeError(
                f"PDF exceeds maximum allowed 3 pages (found {pages} pages)."
            )

    return file_type, pages


def sanitize_untrusted_input(raw_text: str) -> str:
    """Mark user text as data; provider output still requires schema validation."""
    clean = raw_text.strip().replace("</untrusted_user_input>", "")
    return f"<untrusted_user_input>\n{clean}\n</untrusted_user_input>"
