import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Helper with exponential backoff for rate limits (TPM / RPM handling)
async function callGeminiWithRetry(payload, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await ai.models.generateContent(payload);
    } catch (error) {
      if (i === retries - 1) throw error;
      console.warn(`Gemini rate limit / error encountered. Retrying in ${delay}ms... (Attempt ${i + 1})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // exponential backoff
    }
  }
}

export async function extractRequirementsAndBrief(jdText, companyScrapedText) {
  const prompt = `
You are an expert technical recruiter and interview coach. Analyze the following job description and crawled company information.

JOB DESCRIPTION:
${jdText}

COMPANY RESEARCH TEXT:
${companyScrapedText || "No company website could be crawled."}

Task:
1. Extract company summary and what they do.
2. Extract role title, seniority, and responsibilities.
3. Extract explicit requirements from the job description, assigning each a stable ID (e.g., r1, r2...), kind ("technical", "behavioural", "domain"), and priority ("must" or "nice" based strictly on whether it is required or bonus points).
`;

  const response = await callGeminiWithRetry({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          company_brief: {
            type: Type.OBJECT,
            properties: {
              summary: { type: Type.STRING },
              what_they_do: { type: Type.STRING }
            },
            required: ["summary", "what_they_do"]
          },
          role: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              seniority: { type: Type.STRING },
              responsibilities: { type: Type.ARRAY, items: { type: Type.STRING } },
              requirements: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    text: { type: Type.STRING },
                    kind: { type: Type.STRING, enum: ["technical", "behavioural", "domain"] },
                    priority: { type: Type.STRING, enum: ["must", "nice"] }
                  },
                  required: ["id", "text", "kind", "priority"]
                }
              }
            },
            required: ["title", "seniority", "responsibilities", "requirements"]
          }
        },
        required: ["company_brief", "role"]
      }
    }
  });

  return JSON.parse(response.text);
}

export async function generateQuestionsAndFlashcards(requirements, companyContext) {
  const prompt = `
Based on these extracted requirements and company context, generate a comprehensive question bank and flashcards.

REQUIREMENTS:
${JSON.stringify(requirements, null, 2)}

COMPANY CONTEXT:
${JSON.stringify(companyContext, null, 2)}

Instructions:
- Generate interview questions covering categories: "technical", "behavioural", "system-design", "company-fit".
- Every question must reference the requirement IDs it covers in "requirement_ids".
- Assign difficulty from 1 to 3.
- Generate flashcards with front, back, and corresponding "requirement_ids".
`;

  const response = await callGeminiWithRetry({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                requirement_ids: { type: Type.ARRAY, items: { type: Type.STRING } },
                category: { type: Type.STRING, enum: ["technical", "behavioural", "system-design", "company-fit"] },
                prompt: { type: Type.STRING },
                answer_outline: { type: Type.STRING },
                difficulty: { type: Number }
              },
              required: ["id", "requirement_ids", "category", "prompt", "answer_outline", "difficulty"]
            }
          },
          flashcards: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                front: { type: Type.STRING },
                back: { type: Type.STRING },
                requirement_ids: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["id", "front", "back", "requirement_ids"]
            }
          }
        },
        required: ["questions", "flashcards"]
      }
    }
  });

  return JSON.parse(response.text);
}

export async function generateGapQuestions(uncoveredRequirements) {
  const prompt = `
The following must-have requirements do not have any interview questions covering them yet. Generate specific questions and flashcards for them.

UNCOVERED REQUIREMENTS:
${JSON.stringify(uncoveredRequirements, null, 2)}
`;

  const response = await callGeminiWithRetry({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                requirement_ids: { type: Type.ARRAY, items: { type: Type.STRING } },
                category: { type: Type.STRING, enum: ["technical", "behavioural", "system-design", "company-fit"] },
                prompt: { type: Type.STRING },
                answer_outline: { type: Type.STRING },
                difficulty: { type: Number }
              },
              required: ["id", "requirement_ids", "category", "prompt", "answer_outline", "difficulty"]
            }
          },
          flashcards: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                front: { type: Type.STRING },
                back: { type: Type.STRING },
                requirement_ids: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["id", "front", "back", "requirement_ids"]
            }
          }
        },
        required: ["questions", "flashcards"]
      }
    }
  });

  return JSON.parse(response.text);
}