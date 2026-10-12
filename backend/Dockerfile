FROM python:3.13-slim

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y curl ca-certificates && rm -rf /var/lib/apt/lists/*

# Install Coral CLI via official install script
RUN curl -fsSL https://withcoral.com/install.sh | sh

# Ensure coral is on PATH
ENV PATH="/root/.local/bin:${PATH}"

# Copy requirements and install Python deps
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./backend/

# Copy coral sources and data
COPY coral/ ./coral/

# Copy startup script
COPY backend/startup.sh ./startup.sh
RUN chmod +x ./startup.sh

# Set working directory to backend
WORKDIR /app/backend

# Expose port
EXPOSE 8000

# Run startup script (registers Coral sources, then starts server)
CMD ["/app/startup.sh"]
