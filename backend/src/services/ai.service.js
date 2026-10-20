
import "dotenv/config";

// ==================================================
// 1. Groq configuration
// ==================================================

const GROQ_API_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const MODEL_NAME =
  process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const API_KEY = process.env.GROQ_API_KEY;

// Keep requests reasonably small to reduce TPM usage.
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_TOKENS = 3000;
const EXTRACTION_MAX_TOKENS = 4000;
const GAP_MAX_TOKENS = 1800;

if (!API_KEY) {
  throw new Error(
    "GROQ_API_KEY is missing. Add it to your backend .env file."
  );
}

// ==================================================
// 2. General helpers
// ==================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asString(value, fallback = "") {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : fallback;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values) {
  return [
    ...new Set(
      asArray(values)
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ];
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeEnum(value, allowed, fallback) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  return allowed.includes(normalized)
    ? normalized
    : fallback;
}

function normalizeRequirementKind(value) {
  return normalizeEnum(
    value,
    ["technical", "behavioural", "domain"],
    "technical"
  );
}

function normalizePriority(value) {
  return normalizeEnum(
    value,
    ["must", "nice"],
    "must"
  );
}

function normalizeQuestionCategory(value) {
  return normalizeEnum(
    value,
    [
      "technical",
      "behavioural",
      "system-design",
      "company-fit",
    ],
    "technical"
  );
}

function normalizeDifficulty(value) {
  return clampNumber(value, 1, 3, 2);
}

// ==================================================
// 3. Parse JSON returned by Groq
// ==================================================

function parseJsonResponse(content) {
  if (typeof content !== "string" || !content.trim()) {
    throw new Error(
      "Groq returned an empty response."
    );
  }

  let cleaned = content.trim();

  // Remove Markdown fences if the model includes them.
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Attempt to extract the outer JSON object.
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const extracted = cleaned.slice(
        firstBrace,
        lastBrace + 1
      );

      try {
        return JSON.parse(extracted);
      } catch {
        // Throw a clear error below.
      }
    }

    throw new Error(
      "Groq returned invalid JSON. Try reducing the prompt size or increasing max_tokens."
    );
  }
}

// ==================================================
// 4. Determine how long to wait after HTTP 429
// ==================================================

function getRetryDelayMs(response, errorText, attempt) {
  // Respect the standard Retry-After response header.
  const retryAfter = response?.headers?.get?.(
    "retry-after"
  );

  if (retryAfter) {
    const seconds = Number(retryAfter);

    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.ceil(seconds * 1000) + 1000;
    }

    const retryDate = Date.parse(retryAfter);

    if (Number.isFinite(retryDate)) {
      return Math.max(
        1000,
        retryDate - Date.now() + 1000
      );
    }
  }

  // Groq error messages can contain:
  // "Please try again in 28.785s"
  const secondsMatch = errorText.match(
    /try again in\s+([\d.]+)\s*s/i
  );

  if (secondsMatch) {
    const seconds = Number(secondsMatch[1]);

    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.ceil(seconds * 1000) + 1500;
    }
  }

  // Fallback exponential backoff.
  return Math.min(
    60_000,
    5000 * 2 ** attempt
  );
}

// ==================================================
// 5. Call Groq with timeout and rate-limit retries
// ==================================================

async function callGroq(
  systemPrompt,
  userPrompt,
  {
    maxTokens = DEFAULT_MAX_TOKENS,
    temperature = 0.2,
  } = {}
) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response;
    let errorText = "";

    try {
      console.log(
        `Calling Groq API model: ${MODEL_NAME}...`
      );

      response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(
          REQUEST_TIMEOUT_MS
        ),
        body: JSON.stringify({
          model: MODEL_NAME,
          temperature,
          max_tokens: maxTokens,
          response_format: {
            type: "json_object",
          },
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: userPrompt,
            },
          ],
        }),
      });
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        const delayMs = Math.min(
          10_000 * 2 ** attempt,
          30_000
        );

        console.warn(
          `Groq request failed: ${error.message}. Retrying in ${Math.ceil(delayMs / 1000)} seconds...`
        );

        await sleep(delayMs);
        continue;
      }

      throw new Error(
        `Could not reach Groq API after ${MAX_RETRIES + 1} attempts: ${error.message}`
      );
    }

    if (response.ok) {
      const data = await response.json();

      const content =
        data?.choices?.[0]?.message?.content;

      if (
        typeof content !== "string" ||
        !content.trim()
      ) {
        throw new Error(
          "Groq returned no usable message content."
        );
      }

      return parseJsonResponse(content);
    }

    errorText = await response.text().catch(
      () => ""
    );

    if (response.status === 429) {
      if (attempt >= MAX_RETRIES) {
        throw new Error(
          `Groq rate limit or quota exceeded after ${MAX_RETRIES + 1} attempts. ${errorText}`
        );
      }

      const delayMs = getRetryDelayMs(
        response,
        errorText,
        attempt
      );

      console.warn(
        `Groq rate limit reached (429). Waiting ${Math.ceil(delayMs / 1000)} seconds before retry ${attempt + 1}/${MAX_RETRIES}...`
      );

      await sleep(delayMs);
      continue;
    }

    if (response.status === 401) {
      throw new Error(
        "Groq authentication failed. Check GROQ_API_KEY in your backend .env file."
      );
    }

    if (response.status === 403) {
      throw new Error(
        `Groq access denied. Check your account permissions and model access. ${errorText}`
      );
    }

    if (response.status === 404) {
      throw new Error(
        `Groq model or endpoint not found. Check GROQ_MODEL. Current model: ${MODEL_NAME}. ${errorText}`
      );
    }

    if (response.status === 413) {
      throw new Error(
        "Groq rejected the request because the input is too large. Reduce the prompt size."
      );
    }

    throw new Error(
      `Groq API error (${response.status}): ${errorText}`
    );
  }

  throw new Error("Groq request failed unexpectedly.");
}

// ==================================================
// 6. Normalize requirements
// ==================================================

function normalizeRequirements(requirements) {
  const result = [];
  const seenIds = new Set();
  const seenTexts = new Set();

  for (const [index, requirement] of asArray(
    requirements
  ).entries()) {
    if (!requirement || typeof requirement !== "object") {
      continue;
    }

    const text = asString(requirement.text);

    if (!text) {
      continue;
    }

    const normalizedText = text.toLowerCase();

    if (seenTexts.has(normalizedText)) {
      continue;
    }

    let id = asString(
      requirement.id,
      `REQ-${index + 1}`
    );

    if (seenIds.has(id)) {
      id = `REQ-${index + 1}`;

      while (seenIds.has(id)) {
        id = `${id}-X`;
      }
    }

    seenIds.add(id);
    seenTexts.add(normalizedText);

    result.push({
      id,
      text,
      kind: normalizeRequirementKind(
        requirement.kind
      ),
      priority: normalizePriority(
        requirement.priority
      ),
    });

    // Avoid oversized results.
    if (result.length >= 20) {
      break;
    }
  }

  return result;
}

// ==================================================
// 7. Normalize interview questions
// ==================================================

function normalizeQuestions(
  questions,
  validRequirementIds = null
) {
  const result = [];
  const seenIds = new Set();
  const seenPrompts = new Set();

  for (const [index, question] of asArray(
    questions
  ).entries()) {
    if (!question || typeof question !== "object") {
      continue;
    }

    const prompt = asString(question.prompt);

    if (!prompt) {
      continue;
    }

    const normalizedPrompt = prompt.toLowerCase();

    if (seenPrompts.has(normalizedPrompt)) {
      continue;
    }

    let id = asString(
      question.id,
      `Q-${index + 1}`
    );

    if (seenIds.has(id)) {
      id = `Q-${index + 1}`;

      while (seenIds.has(id)) {
        id = `${id}-X`;
      }
    }

    let requirementIds = uniqueStrings(
      question.requirement_ids
    );

    if (validRequirementIds instanceof Set) {
      requirementIds = requirementIds.filter(
        (requirementId) =>
          validRequirementIds.has(requirementId)
      );
    }

    seenIds.add(id);
    seenPrompts.add(normalizedPrompt);

    result.push({
      id,
      requirement_ids: requirementIds,
      category: normalizeQuestionCategory(
        question.category
      ),
      prompt,
      answer_outline: asString(
        question.answer_outline,
        "Explain the concept, describe your approach, and provide a practical example."
      ),
      difficulty: normalizeDifficulty(
        question.difficulty
      ),
      isCustom: Boolean(question.isCustom),
    });

    if (result.length >= 20) {
      break;
    }
  }

  return result;
}

// ==================================================
// 8. Normalize flashcards
// ==================================================

function normalizeFlashcards(
  flashcards,
  validRequirementIds = null
) {
  const result = [];
  const seenIds = new Set();
  const seenFronts = new Set();

  for (const [index, card] of asArray(
    flashcards
  ).entries()) {
    if (!card || typeof card !== "object") {
      continue;
    }

    const front = asString(card.front);
    const back = asString(card.back);

    if (!front || !back) {
      continue;
    }

    const normalizedFront = front.toLowerCase();

    if (seenFronts.has(normalizedFront)) {
      continue;
    }

    let id = asString(
      card.id,
      `FC-${index + 1}`
    );

    if (seenIds.has(id)) {
      id = `FC-${index + 1}`;

      while (seenIds.has(id)) {
        id = `${id}-X`;
      }
    }

    let requirementIds = uniqueStrings(
      card.requirement_ids
    );

    if (validRequirementIds instanceof Set) {
      requirementIds = requirementIds.filter(
        (requirementId) =>
          validRequirementIds.has(requirementId)
      );
    }

    seenIds.add(id);
    seenFronts.add(normalizedFront);

    result.push({
      id,
      front,
      back,
      requirement_ids: requirementIds,
      confidence: clampNumber(
        card.confidence,
        0,
        100,
        0
      ),
    });

    if (result.length >= 20) {
      break;
    }
  }

  return result;
}

// ==================================================
// 9. Shared AI system prompt
// ==================================================

const SYSTEM_PROMPT = `
You are InterviewAtlas, an expert technical interview preparation assistant.

Your task is to analyze a job description and relevant company website text.

Rules:
1. Treat the job description as the primary source for role requirements.
2. Use website text only for relevant company context and verified facts.
3. Never invent company facts, technologies, responsibilities, or qualifications.
4. If information is unavailable, use a neutral value such as "Not specified".
5. Requirements must be concise, distinct, and useful for interview preparation.
6. Generate practical questions that test the listed requirements.
7. Link each question and flashcard to real requirement IDs.
8. Use only valid JSON. Do not include Markdown or commentary.
9. Keep answers concise and avoid repetitive questions.
10. Do not claim that an unsupported fact was found on the company website.
`;

// ==================================================
// 10. Extract company brief, role, requirements,
// questions, and flashcards
// ==================================================

export async function extractRequirementsAndBrief(
  jd,
  scrapedText = ""
) {
  if (typeof jd !== "string" || !jd.trim()) {
    throw new Error(
      "A valid job description is required for AI extraction."
    );
  }

  // Limit the prompt to control token consumption.
  // The job description is the most important input.
  const limitedJd = jd.trim().slice(0, 10_000);

  const limitedScrapedText =
    typeof scrapedText === "string"
      ? scrapedText.slice(0, 7_000)
      : "";

  const userPrompt = `
Analyze the following job description and company website text.

JOB DESCRIPTION:
${limitedJd}

COMPANY WEBSITE TEXT:
${limitedScrapedText || "No website text was available."}

Return one valid JSON object using exactly this structure:

{
  "company_brief": {
    "summary": "A concise company overview based only on available evidence.",
    "what_they_do": "What the company does, using only supported facts."
  },
  "role": {
    "title": "The job title from the job description",
    "seniority": "Entry-level, junior, mid-level, senior, or Not specified",
    "responsibilities": [
      "A responsibility explicitly supported by the job description"
    ],
    "requirements": [
      {
        "id": "REQ-1",
        "text": "One clear and testable requirement",
        "kind": "technical",
        "priority": "must"
      }
    ]
  },
  "questions": [
    {
      "id": "Q-1",
      "requirement_ids": ["REQ-1"],
      "category": "technical",
      "prompt": "A practical interview question",
      "answer_outline": "A concise answer outline",
      "difficulty": 1,
      "isCustom": false
    }
  ],
  "flashcards": [
    {
      "id": "FC-1",
      "front": "A concise technical question",
      "back": "A concise and accurate answer",
      "requirement_ids": ["REQ-1"],
      "confidence": 0
    }
  ]
}

Requirements:
- Extract approximately 6-12 distinct requirements, depending on the job description.
- Do not turn unrelated company website details into role requirements.
- Each requirement must have a unique ID.
- Use kind: technical, behavioural, or domain.
- Use priority: must or nice.
- Generate 5-7 useful interview questions.
- Generate 4-6 useful flashcards.
- Question categories must be technical, behavioural, system-design, or company-fit.
- Difficulty must be an integer from 1 to 3.
- Each question and flashcard must reference existing requirement IDs.
- Avoid duplicate or generic questions.
- Include relevant company-fit questions only when supported by available company information.
- Do not output fields other than those shown.
- Keep all text concise to stay within the response token limit.
`;

  const data = await callGroq(
    SYSTEM_PROMPT,
    userPrompt,
    {
      maxTokens: EXTRACTION_MAX_TOKENS,
      temperature: 0.2,
    }
  );

  const rawRequirements = normalizeRequirements(
    data?.role?.requirements
  );

  if (rawRequirements.length === 0) {
    throw new Error(
      "AI extraction returned no valid requirements."
    );
  }

  const validRequirementIds = new Set(
    rawRequirements.map((requirement) => requirement.id)
  );

  const questions = normalizeQuestions(
    data?.questions,
    validRequirementIds
  );

  const flashcards = normalizeFlashcards(
    data?.flashcards,
    validRequirementIds
  );

  return {
    company_brief: {
      summary: asString(
        data?.company_brief?.summary,
        "Company overview could not be generated."
      ),
      what_they_do: asString(
        data?.company_brief?.what_they_do,
        "Company activities could not be determined."
      ),
    },

    role: {
      title: asString(
        data?.role?.title,
        "Software Engineer"
      ),
      seniority: asString(
        data?.role?.seniority,
        "Not specified"
      ),
      responsibilities: uniqueStrings(
        data?.role?.responsibilities
      ).slice(0, 15),
      requirements: rawRequirements,
    },

    questions,
    flashcards,
  };
}

// ==================================================
// 11. Generate questions and flashcards
// Reuse extraction output when available to save tokens.
// ==================================================

export async function generateQuestionsAndFlashcards(
  requirements,
  extractionResult = null
) {
  const normalizedRequirements =
    normalizeRequirements(requirements);

  if (normalizedRequirements.length === 0) {
    throw new Error(
      "At least one valid requirement is needed to generate questions."
    );
  }

  const validRequirementIds = new Set(
    normalizedRequirements.map(
      (requirement) => requirement.id
    )
  );

  const existingQuestions = normalizeQuestions(
    extractionResult?.questions,
    validRequirementIds
  );

  const existingFlashcards = normalizeFlashcards(
    extractionResult?.flashcards,
    validRequirementIds
  );

  // Reuse both sets when extraction already generated them.
  // This avoids unnecessary Groq API calls.
  if (
    existingQuestions.length > 0 &&
    existingFlashcards.length > 0
  ) {
    return {
      questions: existingQuestions,
      flashcards: existingFlashcards,
    };
  }

  const compactRequirements =
    normalizedRequirements.map((requirement) => ({
      id: requirement.id,
      text: requirement.text,
      kind: requirement.kind,
      priority: requirement.priority,
    }));

  const userPrompt = `
Generate interview questions and study flashcards for these requirements.

REQUIREMENTS:
${JSON.stringify(compactRequirements)}

Return valid JSON in this format:

{
  "questions": [
    {
      "id": "Q-1",
      "requirement_ids": ["REQ-1"],
      "category": "technical",
      "prompt": "A practical interview question",
      "answer_outline": "A concise answer outline",
      "difficulty": 2,
      "isCustom": false
    }
  ],
  "flashcards": [
    {
      "id": "FC-1",
      "front": "A concise question",
      "back": "A concise answer",
      "requirement_ids": ["REQ-1"],
      "confidence": 0
    }
  ]
}

Rules:
- Generate 5-8 distinct questions.
- Generate 4-6 concise flashcards.
- Cover as many requirements as practical.
- Every requirement ID must exist in the supplied requirements.
- Use question categories technical, behavioural, system-design, or company-fit.
- Difficulty must be 1, 2, or 3.
- Do not duplicate questions.
- Return JSON only.
`;

  const data = await callGroq(
    SYSTEM_PROMPT,
    userPrompt,
    {
      maxTokens: DEFAULT_MAX_TOKENS,
      temperature: 0.2,
    }
  );

  return {
    questions: normalizeQuestions(
      [
        ...existingQuestions,
        ...asArray(data?.questions),
      ],
      validRequirementIds
    ),

    flashcards: normalizeFlashcards(
      [
        ...existingFlashcards,
        ...asArray(data?.flashcards),
      ],
      validRequirementIds
    ),
  };
}

// ==================================================
// 12. Generate questions and flashcards for gaps
// ==================================================

export async function generateGapQuestions(
  uncoveredRequirements
) {
  const requirements = normalizeRequirements(
    uncoveredRequirements
  );

  if (requirements.length === 0) {
    return {
      questions: [],
      flashcards: [],
    };
  }

  const validRequirementIds = new Set(
    requirements.map((requirement) => requirement.id)
  );

  const userPrompt = `
Some job requirements are not covered by the existing interview questions.

Generate targeted questions and flashcards for ONLY these requirements:

${JSON.stringify(requirements)}

Return valid JSON:

{
  "questions": [
    {
      "id": "GAP-Q-1",
      "requirement_ids": ["REQ-1"],
      "category": "technical",
      "prompt": "A targeted question that tests this requirement",
      "answer_outline": "A concise answer outline",
      "difficulty": 2,
      "isCustom": false
    }
  ],
  "flashcards": [
    {
      "id": "GAP-FC-1",
      "front": "A concise question",
      "back": "A concise answer",
      "requirement_ids": ["REQ-1"],
      "confidence": 0
    }
  ]
}

Rules:
- Cover every supplied requirement with at least one relevant question when possible.
- Only use the supplied requirement IDs.
- Keep answers short and technically accurate.
- Avoid repeating generic questions.
- Generate no more than 2 questions per requirement.
- Generate no more than 1 flashcard per requirement.
- Use valid categories and difficulty values.
- Return JSON only.
`;

  const data = await callGroq(
    SYSTEM_PROMPT,
    userPrompt,
    {
      maxTokens: GAP_MAX_TOKENS,
      temperature: 0.2,
    }
  );

  const questions = normalizeQuestions(
    data?.questions,
    validRequirementIds
  );

  const flashcards = normalizeFlashcards(
    data?.flashcards,
    validRequirementIds
  );

  return {
    questions,
    flashcards,
  };
}

// ==================================================
// 13. Check requirement coverage
// ==================================================

export function checkCoverage(
  requirements,
  questions
) {
  const normalizedRequirements =
    normalizeRequirements(requirements);

  const normalizedQuestions =
    normalizeQuestions(questions);

  const coveredIds = new Set();

  for (const question of normalizedQuestions) {
    for (const requirementId of question.requirement_ids) {
      coveredIds.add(requirementId);
    }
  }

  const covered_requirement_ids = [];
  const uncovered_requirement_ids = [];

  for (const requirement of normalizedRequirements) {
    if (coveredIds.has(requirement.id)) {
      covered_requirement_ids.push(requirement.id);
    } else {
      uncovered_requirement_ids.push(requirement.id);
    }
  }

  return {
    isFullyCovered:
      uncovered_requirement_ids.length === 0,
    covered_requirement_ids,
    uncovered_requirement_ids,
  };
}

