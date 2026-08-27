import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Type } from '@google/genai';
import type { PersonaAnalysis } from '../types';

/**
 * Server-side proxy for the Gemini call.
 *
 * The API key lives ONLY here, as the GEMINI_API_KEY environment variable set in
 * the Vercel dashboard. It is never sent to the browser and never bundled into
 * the frontend. The client calls POST /api/analyze instead of calling Gemini.
 */

const MODEL = 'gemini-3-flash-preview';
const MAX_POST_LENGTH = 5000;

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
Output a JSON array where each object represents a persona with the following properties: 'name', 'archetype', 'bio', 'gutReaction', 'likelihoodToEngage', and 'verdict'. Ensure 'likelihoodToEngage' is an integer between 1 and 10. The tone should be professional but realistic.`;

const responseSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: 'The name of the LinkedIn persona.' },
      archetype: { type: Type.STRING, description: 'The archetype of the persona (e.g., "The Executive").' },
      bio: { type: Type.STRING, description: 'A 2-sentence description of their role, seniority, and motivations on LinkedIn.' },
      gutReaction: { type: Type.STRING, description: 'A raw, first-person quote of what they think while scrolling past this in their feed.' },
      likelihoodToEngage: { type: Type.INTEGER, description: 'A score from 1 to 10 indicating likelihood to Like or Comment.' },
      verdict: { type: Type.STRING, description: 'Specific feedback on why they would Like, Comment, or Keep Scrolling.' },
    },
    required: ['name', 'archetype', 'bio', 'gutReaction', 'likelihoodToEngage', 'verdict'],
    propertyOrdering: ['name', 'archetype', 'bio', 'gutReaction', 'likelihoodToEngage', 'verdict'],
  },
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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set on the server.');
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

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `Input:\nIndustry: ${selectedIndustry}\nPost Draft: ${postContent}`,
      config: { systemInstruction, responseMimeType: 'application/json', responseSchema },
    });

    const jsonStr = response.text?.trim();
    if (!jsonStr) {
      return res.status(502).json({ error: 'Empty response from the model.' });
    }

    const personas = safeParse(jsonStr);
    if (!validatePersonas(personas)) {
      return res.status(502).json({ error: 'Model response did not match the expected structure.' });
    }

    return res.status(200).json(personas);
  } catch (err) {
    console.error('Gemini call failed:', err);
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
