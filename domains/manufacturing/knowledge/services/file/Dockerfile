# 1️⃣ Use a lightweight Python image
FROM python:3.11-slim

# 2️⃣ Set working directory
WORKDIR /app

# 3️⃣ Copy dependency file first (better for caching)
COPY requirements.txt .

# 4️⃣ Install system and Python dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends libredwg-tools \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir -r requirements.txt

# 5️⃣ Copy application code
COPY main.py .
COPY src ./src
COPY .env .

# 6️⃣ Make /app importable so `import src...` works
ENV PYTHONPATH=/app

# 7️⃣ Expose port
EXPOSE 8000

# 8️⃣ Run FastAPI with Uvicorn
CMD ["python", "main.py"]
