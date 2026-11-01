"""Translate deterministic operation failures into the existing API error contract."""

from collections.abc import Callable
from math import isfinite
from typing import ParamSpec, TypeVar

from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

Parameters = ParamSpec("Parameters")
Result = TypeVar("Result")


def _json_number(value: float) -> float | str:
    return value if isfinite(value) else str(value)


def configure_error_handlers(app: FastAPI) -> None:
    """Keep validation errors JSON-safe even when a raw request includes NaN or infinity."""

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error: RequestValidationError) -> JSONResponse:
        """Preserve FastAPI's detail list without trying to encode non-JSON numeric inputs."""
        return JSONResponse(
            status_code=422,
            content={
                "detail": jsonable_encoder(error.errors(), custom_encoder={float: _json_number})
            },
        )


async def run_plan_operation(
    operation: Callable[Parameters, Result], *args: Parameters.args, **kwargs: Parameters.kwargs
) -> Result:
    """Offload pure work and preserve FastAPI's HTTP 422 ``detail`` response."""
    try:
        return await run_in_threadpool(operation, *args, **kwargs)
    except OverflowError as error:
        raise HTTPException(
            status_code=422, detail="Date or number is outside the supported range"
        ) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
