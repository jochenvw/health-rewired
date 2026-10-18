# syntax=docker/dockerfile:1.7

# ---- 1. Frontend build -------------------------------------------------------
FROM node:22-bookworm-slim AS frontend
# Optional mirror for restricted networks, e.g. --build-arg NPM_CONFIG_REGISTRY=https://...
ARG NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
WORKDIR /src
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
RUN npm ci --workspace frontend --include-workspace-root=false
COPY frontend/ frontend/
# Ideas may import synthetic JSON at build time (../../../../sample-data/*.json)
COPY sample-data/ sample-data/
RUN npm run build --workspace frontend

# ---- 2. Python runtime -------------------------------------------------------
FROM python:3.12-slim-bookworm AS runtime
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv
# Optional PyPI mirror for restricted networks.
ARG UV_DEFAULT_INDEX=https://pypi.org/simple

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    XDG_CACHE_HOME=/opt/cache \
    PATH="/opt/venv/bin:$PATH" \
    STATIC_DIR=/app/static \
    SAMPLE_DATA_DIR=/app/sample-data \
    COPILOT_USE_LOGGED_IN_USER=false

WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project \
 && python -m copilot download-runtime \
 && chmod -R a+rX /opt/cache

COPY backend/app ./app
COPY sample-data ./sample-data
COPY --from=frontend /src/frontend/dist ./static

RUN useradd --create-home --uid 10001 app
USER app

ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status == 200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
