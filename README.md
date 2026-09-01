<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Bunny the Analyzer

Paste a LinkedIn post draft, pick an industry, and get simulated reactions from
5–7 distinct professional personas (gut reaction, likelihood-to-engage score, and
a verdict).

## Architecture

The model API key is **never** sent to the browser. The React frontend calls
`POST /api/analyze`, a serverless function ([api/analyze.ts](api/analyze.ts))
that holds the key server-side and talks to the model provider.

```
browser  ──►  /api/analyze  (serverless function, holds the key)  ──►  model provider
```

**Provider** is chosen by which key is set — Gemini wins if both are present:

| Env var | Provider | Default model | Override |
|---|---|---|---|
| `GEMINI_API_KEY` | Google Gemini ([REST](https://ai.google.dev/api)) | `gemini-flash-latest` | `GEMINI_MODEL` |
| `OPENROUTER_API_KEY` | [OpenRouter](https://openrouter.ai) | `z-ai/glm-5.2:free` | `OPENROUTER_MODEL` |

## Run locally

**Prerequisites:** Node.js.

1. Install dependencies:
   `npm install`
2. Put a key in `.env.local` (this file is git-ignored) — either is enough:
   `GEMINI_API_KEY=your-key-here`
   (get one free, no card, at <https://aistudio.google.com/app/apikey>)
3. Run the app:
   `npm run dev` → http://localhost:3000

`vite.config.ts` runs `api/analyze.ts` as dev middleware, so `npm run dev`
serves the frontend and the `/api/analyze` endpoint on the same port. No Vercel
CLI needed for local work.

## Deploy (Vercel)

1. Import the repo in Vercel (Root Directory is the repo root — leave it as `./`).
2. Add environment variables in the Vercel project settings:
   - `GEMINI_API_KEY` **or** `OPENROUTER_API_KEY` (at least one, required)
   - `GEMINI_MODEL` / `OPENROUTER_MODEL` – model override (optional)
   - `ALLOWED_ORIGINS` – your production URL, e.g. `https://your-app.vercel.app`
     (optional but recommended; restricts who can call `/api/analyze`)
3. Deploy. Vercel auto-detects Vite (`npm run build` → `dist/`) and serves
   `api/analyze.ts` at `/api/analyze`.

## Notes

- `api/analyze.ts` includes a best-effort per-instance rate limit. For a hard
  guarantee across serverless instances, back it with Vercel KV or Upstash.
- Upstream `429` (quota) and `402` (out of credits) are forwarded to the UI with
  a readable message.
- If you ever committed or shipped a key, rotate it:
  Gemini <https://aistudio.google.com/app/apikey> ·
  OpenRouter <https://openrouter.ai/keys>.
