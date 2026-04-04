# Client Dockerfile for development
FROM node:20-alpine

# Create a non-root user matching host UID
RUN addgroup -g 1000 nodeuser && adduser -D -u 1000 -G nodeuser nodeuser

WORKDIR /app

# Change ownership of the app directory
RUN chown -R nodeuser:nodeuser /app

# Switch to non-root user
USER nodeuser

# Install dependencies
COPY --chown=nodeuser:nodeuser package.json package-lock.json* ./
RUN npm install

# Copy application code
COPY --chown=nodeuser:nodeuser . .

# Expose Next.js development port
EXPOSE 3000

# Run development server
CMD ["npm", "run", "dev"]
