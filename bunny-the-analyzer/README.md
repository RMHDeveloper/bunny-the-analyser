<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Bunny the Analyzer

Paste a LinkedIn post draft, pick an industry, and get simulated reactions from
5–7 distinct professional personas (gut reaction, likelihood-to-engage score, and
a verdict) powered by the Gemini API.

## Architecture

The Gemini API key is **never** sent to the browser. The React frontend calls
`POST /api/analyze`, a serverless function ([api/analyze.ts](api/analyze.ts))
that holds the key server-side and talks to Gemini.

```
browser  ──►  /api/analyze  (serverless function, holds GEMINI_API_KEY)  ──►  Gemini
```

## Run locally

**Prerequisites:** Node.js, and the [Vercel CLI](https://vercel.com/docs/cli)
(`npm i -g vercel`) so the `/api` function runs alongside the Vite dev server.

1. Install dependencies:
   `npm install`
2. Put your key in `.env.local` (this file is git-ignored):
   `GEMINI_API_KEY=your-key-here`
3. Run the app (frontend + function):
   `vercel dev`

Plain `npm run dev` runs only the frontend; the analyze call will 404 without
`vercel dev`.

## Deploy (Vercel)

1. Import the repo in Vercel. Set **Root Directory** to `bunny-the-analyzer`.
2. Add environment variables in the Vercel project settings:
   - `GEMINI_API_KEY` – your Gemini key (required)
   - `ALLOWED_ORIGINS` – your production URL, e.g. `https://your-app.vercel.app`
     (optional but recommended; restricts who can call `/api/analyze`)
3. Deploy. Vercel auto-detects Vite (`npm run build` → `dist/`) and serves
   `api/analyze.ts` at `/api/analyze`.

## Notes

- `api/analyze.ts` includes a best-effort per-instance rate limit. For a hard
  guarantee across serverless instances, back it with Vercel KV or Upstash.
- If you ever committed or shipped a key, rotate it at
  <https://aistudio.google.com/app/apikey>.
