
import { GoogleGenAI, Type } from "@google/genai";
import { PersonaAnalysis } from '../types';

/**
 * Analyzes a LinkedIn post draft using the Gemini API, providing persona-based feedback.
 * @param postContent The draft of the LinkedIn post to analyze.
 * @param selectedIndustry The industry relevant to the post, influencing persona generation.
 * @returns A promise that resolves to an array of PersonaAnalysis objects.
 * @throws An error if the API call fails or the response is invalid.
 */
export const analyzeLinkedInPost = async (postContent: string, selectedIndustry: string): Promise<PersonaAnalysis[]> => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY is not defined in the environment variables.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const systemInstruction = `Act as a panel of distinct LinkedIn personas. I will provide an industry and a draft of a LinkedIn post. Based on the provided industry, you will generate 5-7 relevant and distinct personas. For each persona, provide a name, their archetype, a 2-sentence bio of their role, seniority, and what motivates them on LinkedIn, their raw first-person gut reaction, a likelihood to engage score (1-10) for liking or commenting, and a specific verdict explaining their engagement.

The Persona Generation Logic by Industry:
- Tech / SaaS: Include a cynical Senior Engineer, an over-eager VC, and a busy Product Manager.
- Healthcare / Pharma: Include a compliance-heavy Administrator, a time-poor Clinician, and a MedTech Innovator.
- Finance / Banking: Include a risk-averse Analyst, a "High-Net-Worth" Advisor, and a Fintech Disruptor.
- Creative / Marketing: Include a Brand Strategist who hates clichés, a Freelance Graphic Designer, and a CMO looking for ROI.
- Manufacturing / Logistics: Include a "Boots-on-the-ground" Operations Manager, a Sustainability Consultant, and a Supply Chain Director.
- Education / Academia: Include a struggling Adjunct Professor, an EdTech Founder, and a University Career Coach.
- Retail / E-commerce: Include a DTC Founder, a Retail Associate, and a Customer Experience (CX) Director.
- General: Include a Career Coach, a "LinkedIn Influencer," and a Corporate Recruiter.

Always ensure the total number of personas generated is between 5 and 7, and they are distinct for the chosen industry.
Output a JSON array where each object represents a persona with the following properties: 'name', 'archetype', 'bio', 'gutReaction', 'likelihoodToEngage', and 'verdict'. Ensure 'likelihoodToEngage' is an integer between 1 and 10. The tone should be professional but realistic.`;

  const prompt = `Input:\nIndustry: ${selectedIndustry}\nPost Draft: ${postContent}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: {
                type: Type.STRING,
                description: 'The name of the LinkedIn persona.',
              },
              archetype: {
                type: Type.STRING,
                description: 'The archetype of the persona (e.g., "The Executive").',
              },
              bio: {
                type: Type.STRING,
                description: 'A 2-sentence description of their role, seniority, and motivations on LinkedIn.',
              },
              gutReaction: {
                type: Type.STRING,
                description: 'A raw, first-person quote of what they think while scrolling past this in their feed.',
              },
              likelihoodToEngage: {
                type: Type.INTEGER,
                description: 'A score from 1 to 10 indicating likelihood to Like or Comment.',
              },
              verdict: {
                type: Type.STRING,
                description: 'Specific feedback on why they would Like, Comment, or Keep Scrolling.',
              },
            },
            required: ['name', 'archetype', 'bio', 'gutReaction', 'likelihoodToEngage', 'verdict'],
            propertyOrdering: ['name', 'archetype', 'bio', 'gutReaction', 'likelihoodToEngage', 'verdict'],
          },
        },
      },
    });

    const jsonStr = response.text?.trim();

    if (!jsonStr) {
      throw new Error("Empty or invalid response from the API.");
    }

    const personas: PersonaAnalysis[] = JSON.parse(jsonStr);

    // Basic validation to ensure the structure is as expected
    if (
      !Array.isArray(personas) ||
      !personas.every(
        (p) =>
          typeof p.name === 'string' &&
          typeof p.archetype === 'string' &&
          typeof p.bio === 'string' &&
          typeof p.gutReaction === 'string' &&
          typeof p.likelihoodToEngage === 'number' &&
          p.likelihoodToEngage >= 1 &&
          p.likelihoodToEngage <= 10 &&
          typeof p.verdict === 'string',
      )
    ) {
      throw new Error("API response did not match the expected persona analysis structure.");
    }

    return personas;
  } catch (error) {
    console.error("Error analyzing LinkedIn post:", error);
    // Re-throw to be handled by the calling component
    throw new Error(`Failed to analyze post: ${error instanceof Error ? error.message : String(error)}`);
  }
};
