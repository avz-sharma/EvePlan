ARG PYTHON_IMAGE=python:3.12-slim
FROM ${PYTHON_IMAGE} AS wheels
WORKDIR /build
COPY backend/requirements.lock ./requirements.lock
RUN python -m pip wheel --no-cache-dir --no-deps --require-hashes \
    --wheel-dir /wheels -r requirements.lock

FROM ${PYTHON_IMAGE} AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080
WORKDIR /app
COPY --from=wheels /wheels /wheels
RUN python -m pip install --no-index --no-deps /wheels/*.whl \
    && rm -rf /wheels \
    && groupadd --gid 10001 eveplan \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin eveplan
COPY --chown=10001:10001 backend/app ./app
USER 10001:10001
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import os,urllib.request; urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8080')+'/health',timeout=2).read()"]
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1 --timeout-keep-alive 15"]
