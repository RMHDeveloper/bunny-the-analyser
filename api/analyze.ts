import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { PersonaAnalysis } from '../types';

/**
 * Server-side proxy for the LLM call.
 *
 * The actual provider call now goes through the shared dashboard proxy
 * (DASHBOARD_PROXY_URL), which holds the real Gemini / OpenRouter API keys
 * centrally and picks which provider to use for this app (slug
 * "bunny-the-analyser"). This app no longer holds a provider key itself.
 *
 * We still build both a Gemini-shaped and an OpenRouter-shaped request body
 * (the dashboard proxy forwards whatever body we send verbatim to whichever
 * provider it has configured), and try the Gemini shape first, falling back
 * to the OpenRouter shape on failure — this preserves the original
 * dual-provider behavior without this app needing to know which provider is
 * configured on the dashboard side.
 *
 * The key lives ONLY on the dashboard now. It is never sent to the browser and
 * never bundled into the frontend. The client calls POST /api/analyze instead of
 * calling the model provider directly.
 */

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'z-ai/glm-5.2:free';
const MAX_POST_LENGTH = 5000;
const APP_SLUG = 'bunny-the-analyser';

const systemInstruction = `Act as a panel of distinct LinkedIn personas. I will provide an industry and a draft of a LinkedIn post. Based on the provided industry, you will generate 5-7 relevant and distinct personas. For each persona, provide a name, their archetype, a 2-sentence bio of their role, seniority, and what motivates them on LinkedIn, their raw first-person gut reaction, a likelihood to engage score (1-10) for liking or commenting, and a specific verdict explaining their engagement.

The Persona Generation Logic by Industry:
- Tech / SaaS: Include a cynical Senior Engineer, an over-eager VC, and a busy Product Manager.
- Healthcare / Pharma: Include a compliance-heavy Administrator, a time-poor Clinician, and a MedTech Innovator.
- Finance / Banking: Include a risk-averse Analyst, a "High-Net-Worth" Advisor, and a Fintech Disruptor.
- Creative / Marketing: Include a Brand Strategist who hates clichés, a Freelance Graphic Designer, and a CMO looking for ROI.
- Manufacturing / Logistics: Include a "Boots-on-the-ground" Operations Manager, a Sustainability Consultant, and a Supply Chain Director.
- Education / Academia: Include a struggling Adjunct Professor, an EdTech Founder, and a University Career Coach.
- Retail / E-commerce: Include a DTC Founder, a Retail Associate, and a Customer Experience (CX) Director.
- Artificial Intelligence / ML: Include a skeptical ML Research Scientist, an "AI thought leader" who reposts everything, and a pragmatic Head of Data tired of hype.
- Cybersecurity: Include a burned-out SOC Analyst, a vendor-wary CISO, and an ethical hacker / researcher who calls out FUD.
- Climate / CleanTech: Include a climate scientist skeptical of greenwashing, a CleanTech VC chasing returns, and a policy / ESG advisor.
- Web3 / Crypto: Include a "wagmi" maximalist, a skeptical traditional-finance quant, and a builder focused on real utility over price talk.
- Gaming / Esports: Include a jaded AAA Game Developer, an indie studio founder, and a brand-partnerships manager sizing up sponsorship value.
- Creator Economy / Media: Include a full-time Content Creator watching for algorithm angles, a talent-agency manager, and a brand marketer evaluating creator ROI.
- Real Estate / PropTech: Include a traditional commercial broker skeptical of software, a PropTech founder, and an institutional real-estate investor.
- HR / Future of Work: Include a skeptical People Ops leader, an HR-tech founder, and a remote-work advocate wary of "return to office" spin.
- General: Include a Career Coach, a "LinkedIn Influencer," and a Corporate Recruiter.

Always ensure the total number of personas generated is between 5 and 7, and they are distinct for the chosen industry.
Respond with ONLY a JSON object of the form {"personas": [ ... ]} where each item has the properties: 'name', 'archetype', 'bio', 'gutReaction', 'likelihoodToEngage', and 'verdict'. Ensure 'likelihoodToEngage' is an integer between 1 and 10. The tone should be professional but realistic.`;

// JSON Schema (OpenRouter / OpenAI flavour).
const jsonSchema = {
  type: 'object',
  properties: {
    personas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          archetype: { type: 'string' },
          bio: { type: 'string' },
          gutReaction: { type: 'string' },
          likelihoodToEngage: { type: 'integer' },
          verdict: { type: 'string' },
        },
        required: ['name', 'archetype', 'bio', 'gutReaction', 'likelihoodToEngage', 'verdict'],
        additionalProperties: false,
      },
    },
  },
  required: ['personas'],
  additionalProperties: false,
};

// Same shape in Gemini's responseSchema dialect (uppercase types, no
// additionalProperties, propertyOrdering instead).
const geminiSchema = {
  type: 'OBJECT',
  properties: {
    personas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          archetype: { type: 'STRING' },
          bio: { type: 'STRING' },
          gutReaction: { type: 'STRING' },
          likelihoodToEngage: { type: 'INTEGER' },
          verdict: { type: 'STRING' },
        },
        required: ['name', 'archetype', 'bio', 'gutReaction', 'likelihoodToEngage', 'verdict'],
        propertyOrdering: ['name', 'archetype', 'bio', 'gutReaction', 'likelihoodToEngage', 'verdict'],
      },
    },
  },
  required: ['personas'],
};

// Best-effort per-instance rate limit. Serverless instances are ephemeral and
// there can be several at once, so this only blunts abuse from a single caller
// hitting one warm instance. For a hard guarantee use Upstash / Vercel KV.
const RATE_LIMIT = 10; // requests
const RATE_WINDOW_MS = 60_000; // per minute
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > RATE_LIMIT;
}

function isAllowedOrigin(req: VercelRequest): boolean {
  const allowed = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // If not configured, allow (e.g. local dev). Set ALLOWED_ORIGINS in production.
  if (allowed.length === 0) return true;
  const origin = req.headers.origin || '';
  return allowed.includes(origin);
}

function validatePersonas(data: unknown): data is PersonaAnalysis[] {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    data.every(
      (p: any) =>
        p &&
        typeof p.name === 'string' &&
        typeof p.archetype === 'string' &&
        typeof p.bio === 'string' &&
        typeof p.gutReaction === 'string' &&
        typeof p.likelihoodToEngage === 'number' &&
        Number.isInteger(p.likelihoodToEngage) &&
        p.likelihoodToEngage >= 1 &&
        p.likelihoodToEngage <= 10 &&
        typeof p.verdict === 'string',
    )
  );
}

/** Thrown by a provider call; `status` is forwarded to the client. */
class ProviderError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** POSTs `body` to the shared dashboard proxy for this app and returns the parsed JSON. */
async function callDashboardProxy(body: unknown): Promise<any> {
  const proxyUrl = (process.env.DASHBOARD_PROXY_URL || '').trim();
  const proxySecret = (process.env.DASHBOARD_PROXY_SECRET || '').trim();
  if (!proxyUrl || !proxySecret) {
    throw new ProviderError(500, 'Server is not configured (missing DASHBOARD_PROXY_URL/DASHBOARD_PROXY_SECRET).');
  }

  const resp = await fetch(`${proxyUrl}/api/proxy/${APP_SLUG}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-proxy-secret': proxySecret,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const detail = await resp.text();
    console.error('Dashboard proxy call failed:', resp.status, detail);
    const msg = safeParse(detail)?.error as string | undefined;
    if (resp.status === 429) {
      throw new ProviderError(429, msg || 'Rate limit / quota exceeded. Try again later.');
    }
    throw new ProviderError(502, 'Failed to analyze the post. Please try again.');
  }

  return resp.json();
}

/** Returns the raw JSON text produced by the model, via the dashboard proxy, Gemini body shape. */
async function callGemini(userPrompt: string): Promise<string> {
  const data = await callDashboardProxy({
    model: GEMINI_MODEL,
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: 0.9,
      responseMimeType: 'application/json',
      responseSchema: geminiSchema,
    },
  });

  const text: string | undefined = data?.candidates?.[0]?.content?.parts
    ?.map((p: any) => p?.text)
    .filter(Boolean)
    .join('');
  if (!text) throw new ProviderError(502, 'Empty response from the model.');
  return text;
}

/** Returns the raw JSON text produced by the model, via the dashboard proxy, OpenRouter body shape. */
async function callOpenRouter(userPrompt: string): Promise<string> {
  const completion = await callDashboardProxy({
    model: OPENROUTER_MODEL,
    temperature: 0.9,
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: userPrompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'persona_panel', strict: true, schema: jsonSchema },
    },
  });

  const content: string | undefined = completion?.choices?.[0]?.message?.content?.trim();
  if (!content) throw new ProviderError(502, 'Empty response from the model.');
  return content;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Try again in a minute.' });
  }

  if (!process.env.DASHBOARD_PROXY_URL || !process.env.DASHBOARD_PROXY_SECRET) {
    console.error('DASHBOARD_PROXY_URL / DASHBOARD_PROXY_SECRET is not set on the server.');
    return res.status(500).json({ error: 'Server is not configured.' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body;
  const postContent = body?.postContent;
  const selectedIndustry = body?.selectedIndustry;

  if (
    typeof postContent !== 'string' ||
    typeof selectedIndustry !== 'string' ||
    !postContent.trim() ||
    !selectedIndustry.trim()
  ) {
    return res.status(400).json({ error: 'postContent and selectedIndustry are required.' });
  }
  if (postContent.length > MAX_POST_LENGTH) {
    return res.status(400).json({ error: `Post must be under ${MAX_POST_LENGTH} characters.` });
  }

  const userPrompt = `Input:\nIndustry: ${selectedIndustry}\nPost Draft: ${postContent}`;

  try {
    let raw: string;
    try {
      raw = await callGemini(userPrompt);
    } catch (err) {
      // The dashboard proxy may have this app's slug configured for
      // OpenRouter rather than Gemini — retry with the OpenRouter body shape
      // before giving up, preserving the original dual-provider behavior.
      raw = await callOpenRouter(userPrompt);
    }

    // Some models wrap JSON in ```json fences despite the schema request.
    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const parsed = safeParse(cleaned);
    const personas = Array.isArray(parsed) ? parsed : parsed?.personas;
    if (!validatePersonas(personas)) {
      return res.status(502).json({ error: 'Model response did not match the expected structure.' });
    }

    return res.status(200).json(personas);
  } catch (err) {
    if (err instanceof ProviderError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Analysis failed:', err);
    return res.status(502).json({ error: 'Failed to analyze the post. Please try again.' });
  }
}

function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}
