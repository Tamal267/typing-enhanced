FROM node:20-alpine

RUN mkdir -p /app/.next && chown -R node:node /app

# 1. Set working directory
WORKDIR /app

# 2. Assign ownership of the directory to the existing 'node' user
# We do this as root (the default) first
RUN chown -R node:node /app

# 3. Switch to the built-in 'node' user (UID 1000)
USER node

# 4. Install dependencies
# Using --chown ensures the files belong to 'node' immediately
COPY --chown=node:node package.json package-lock.json* ./
RUN npm install

# 5. Copy the rest of the code
COPY --chown=node:node . .

EXPOSE 3000

CMD ["npm", "run", "dev"]