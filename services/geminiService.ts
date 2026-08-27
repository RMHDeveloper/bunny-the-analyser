import { PersonaAnalysis } from '../types';

/**
 * Sends a LinkedIn post draft to our own backend (/api/analyze), which holds the
 * Gemini API key and performs the analysis server-side. The key is never present
 * in the browser.
 *
 * @param postContent The draft of the LinkedIn post to analyze.
 * @param selectedIndustry The industry relevant to the post.
 * @returns A promise that resolves to an array of PersonaAnalysis objects.
 * @throws An error if the request fails or the response is invalid.
 */
export const analyzeLinkedInPost = async (
  postContent: string,
  selectedIndustry: string,
): Promise<PersonaAnalysis[]> => {
  let response: Response;
  try {
    response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postContent, selectedIndustry }),
    });
  } catch (error) {
    throw new Error(
      `Could not reach the analysis service: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(`Unexpected response from the analysis service (status ${response.status}).`);
  }

  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof (data as any).error === 'string'
        ? (data as any).error
        : `Analysis failed (status ${response.status}).`;
    throw new Error(message);
  }

  const personas = data as PersonaAnalysis[];

  if (
    !Array.isArray(personas) ||
    personas.length === 0 ||
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
    throw new Error('The analysis service returned an unexpected result.');
  }

  return personas;
};
