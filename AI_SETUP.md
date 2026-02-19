# AI Assistant Setup Guide

## 1. Get Groq API Key (Free Tier)
- Go to: https://console.groq.com
- Create an API key
- Set `GROQ_API_KEY` in `backend/.env`
- Optional: set `GROQ_MODEL` (default: `llama-3.1-8b-instant`)

## 2. Install Dependencies
```bash
npm install
```

## 3. Start Backend
```bash
npm run dev
```

## 4. Test Endpoints
```bash
curl -X POST http://localhost:5000/api/ai/generate-query \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"query":"Select all students","databaseType":"postgres"}'
```

## API Endpoints
- `POST /api/ai/generate-query`
- `POST /api/ai/validate-query`
- `GET /api/ai/schema-summary`
- `GET /api/ai/stats`
