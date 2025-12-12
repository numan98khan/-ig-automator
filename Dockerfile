# Railway Dockerfile for Document RAG Application

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies in stages for better debugging
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install core dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-eng \
    build-essential \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Install OpenGL and graphics libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install image processing and development libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    libjpeg62-turbo \
    libpng16-16 \
    libtiff6 \
    libfreetype6 \
    zlib1g \
    libbz2-1.0 \
    liblzma5 \
    libxml2 \
    libxslt1.1 \
    libssl3 \
    libffi8 \
    && rm -rf /var/lib/apt/lists/*

# Copy Python requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Build frontend
RUN cd frontend && npm install && npm run build && cd ..

# Make startup script executable
RUN chmod +x startup.sh

# Expose port (Railway will set PORT env var)
EXPOSE 8000

# Use startup script
CMD ["./startup.sh"]
