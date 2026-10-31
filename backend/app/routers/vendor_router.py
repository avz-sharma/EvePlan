from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pydantic import BaseModel, ConfigDict, Field

from ..engine.vendor_comparator import compare_vendor_quote
from ..schemas.vendor_quote import (
    NormalizedQuote,
    QuoteComparison,
)
from ..services.upload_validator import (
    MAX_UPLOAD_BYTES,
    FileValidationError,
    PayloadTooLargeError,
    UnsupportedFileTypeError,
    validate_quote_upload,
)

router = APIRouter(prefix="/api/vendor", tags=["Vendor Coordination"])


class CompareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    quote: NormalizedQuote
    allocated_budget_max_inr: float = Field(ge=0.0)
    guest_count: int = Field(gt=0)


@router.post("/compare", response_model=QuoteComparison)
def compare_quote(req: CompareRequest) -> QuoteComparison:
    """Compare the host-entered quote with the host-entered budget without estimating market fees."""
    return compare_vendor_quote(
        quote=req.quote,
        allocated_budget_max_inr=req.allocated_budget_max_inr,
        guest_count=req.guest_count,
    )


@router.post(
    "/upload",
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
    response_model=None,
    responses={status.HTTP_501_NOT_IMPLEMENTED: {"description": "Automatic quote extraction is unavailable."}},
)
async def upload_quote_document(file: UploadFile = File(...)) -> None:
    """Validates quote document purely in memory via magic bytes and page caps complying with LAW-06."""
    content = await file.read(MAX_UPLOAD_BYTES + 1)

    try:
        validate_quote_upload(content, file.filename or "quote")
    except UnsupportedFileTypeError as e:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=str(e),
        ) from e
    except PayloadTooLargeError as e:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=str(e),
        ) from e
    except FileValidationError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e

    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="Automatic quote extraction is unavailable. Enter only values from the vendor's quote in the comparison form.",
    )
