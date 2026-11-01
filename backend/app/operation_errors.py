"""Translate deterministic operation failures into the existing API error contract."""

from collections.abc import Callable
from typing import ParamSpec, TypeVar

from fastapi import HTTPException
from starlette.concurrency import run_in_threadpool

Parameters = ParamSpec("Parameters")
Result = TypeVar("Result")


async def run_plan_operation(
    operation: Callable[Parameters, Result], *args: Parameters.args, **kwargs: Parameters.kwargs
) -> Result:
    """Offload pure work and preserve FastAPI's HTTP 422 ``detail`` response."""
    try:
        return await run_in_threadpool(operation, *args, **kwargs)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
