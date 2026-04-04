# Typing Enhanced API Documentation

Base URL: `http://localhost:8787` (local development)

## Endpoints

### 1. Get Random Words
Returns a random selection of words from the database.

**Endpoint:** `GET /api/words/random`

**Query Parameters:**
- `limit` (optional): Number of words to return. Default: 100
- `difficulty` (optional): Filter by difficulty level (1=easy, 2=medium, 3=hard)

**Example Requests:**
```bash
# Get 100 random words (default)
curl http://localhost:8787/api/words/random

# Get 50 random words
curl http://localhost:8787/api/words/random?limit=50

# Get 20 hard words
curl http://localhost:8787/api/words/random?limit=20&difficulty=3

# Get 30 easy words
curl http://localhost:8787/api/words/random?limit=30&difficulty=1
```

**Response:**
```json
{
  "success": true,
  "count": 100,
  "words": [
    {
      "id": "uuid-here",
      "word": "programming",
      "difficulty": 3,
      "length": 11
    },
    ...
  ]
}
```

### 2. Get All Words (Paginated)
Returns paginated list of all words.

**Endpoint:** `GET /api/words`

**Query Parameters:**
- `page` (optional): Page number. Default: 1
- `limit` (optional): Words per page. Default: 50

**Example Requests:**
```bash
# Get first page (50 words)
curl http://localhost:8787/api/words

# Get page 2 with 100 words per page
curl http://localhost:8787/api/words?page=2&limit=100
```

**Response:**
```json
{
  "success": true,
  "page": 1,
  "limit": 50,
  "total": 969,
  "totalPages": 20,
  "words": [...]
}
```

### 3. Health Check
Returns API status.

**Endpoint:** `GET /`

**Response:**
```json
{
  "message": "Typing Enhanced API",
  "version": "1.0.0"
}
```

## Error Response Format
```json
{
  "success": false,
  "error": "Error message here"
}
```

## CORS
CORS is enabled for all origins during development.
