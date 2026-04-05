# Use the 'slim' Debian-based image instead of Alpine
FROM oven/bun:1-slim

# Install Node.js (Wrangler needs it to run the workerd binary)
RUN apt-get update && apt-get install -y curl gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean

WORKDIR /app

# The 'bun' user exists here too
RUN chown -R bun:bun /app
USER bun

COPY --chown=bun:bun package.json bun.lock* ./
RUN bun install

COPY --chown=bun:bun . .

EXPOSE 8787

# Use 'npx' to run wrangler so it uses the Node.js runtime for the dev server
CMD ["bun", "run", "dev"]