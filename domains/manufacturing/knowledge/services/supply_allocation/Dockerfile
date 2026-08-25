FROM python:3.12-slim

WORKDIR /app
ENV PYTHONPATH=/app

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY src ./src
COPY services ./services

EXPOSE 8000
CMD ["uvicorn", "services.supply_allocation.main:app", "--host", "0.0.0.0", "--port", "8000"]
