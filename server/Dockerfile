# Server Dockerfile for development
FROM oven/bun:1-alpine

# Create a non-root user
RUN addgroup -g 1000 bun && adduser -D -u 1000 -G bun bun

WORKDIR /app

# Change ownership of the app directory
RUN chown -R bun:bun /app

# Switch to non-root user
USER bun

# Install dependencies
COPY --chown=bun:bun package.json bun.lock* ./
RUN bun install

# Copy application code
COPY --chown=bun:bun . .

# Expose the port for Wrangler dev server
EXPOSE 8787

# Run development server in local mode
CMD ["bun", "run", "dev:local", "--port", "8787"]
