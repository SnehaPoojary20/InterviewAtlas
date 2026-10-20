// ==================================================
// GROQ API CONFIGURATION
// ==================================================

const GROQ_API_KEY = process.env.GROQ_API_KEY;

// Fast, free, and robust Groq LLM model
const MODEL_NAME = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

// ==================================================
// 1. CALL GROQ VIA FETCH
// ==================================================

export const callGroqAPI = async (prompt) => {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is missing. Add GROQ_API_KEY to your backend environment variables on Render.");
  }

  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("Prompt must be a non-empty string.");
  }

  console.log(`Calling Groq API model: ${MODEL_NAME}...`);

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: [
        {
          role: "system",
          content: "You are an expert technical interviewer and recruiter. You always return strict, valid JSON matching the exact schema provided by the user without any markdown surrounding it.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 8000,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error("Groq API Error Response:", errBody);
    throw new Error(`Groq API error (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  const textContent = data.choices?.[0]?.message?.content;

  if (!textContent) {
    throw new Error("Groq API returned an empty completion response.");
  }

  return textContent.trim();
};

// ==================================================
// 2. SAFE JSON PARSER
// ==================================================

const parseJsonSafe = (textResponse) => {
  let cleanJson = textResponse.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(cleanJson);
  } catch (error) {
    console.error("Failed to parse JSON output from Groq:", error.message);
    throw new Error("Groq returned malformed JSON structure.");
  }
};

// ==================================================
// 3. SANITIZE & MAP DATA TO FRONTEND & DATABASE ENUMS
// ==================================================

const sanitizeKitData = (data) => {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Groq output validation failed: invalid JSON root.");
  }

  const brief = data.company_brief && typeof data.company_brief === "object" ? data.company_brief : {};
  data.company_brief = {
    summary: brief.summary || "Company overview analyzed from site/JD.",
    culture: brief.culture || "Engineering culture overview.",
    what_they_do: brief.what_they_do || brief.culture || brief.summary || "Company product focus.",
    tech_stack: Array.isArray(brief.tech_stack) ? brief.tech_stack : [],
  };

  const role = data.role && typeof data.role === "object" ? data.role : {};
  data.role = {
    ...role,
    title: role.title || "Software Engineer",
    seniority: role.seniority || "Not specified",
    responsibilities: Array.isArray(role.responsibilities) ? role.responsibilities : [],
    requirements: [],
  };

  const requirements = Array.isArray(role.requirements) ? role.requirements : [];
  data.role.requirements = requirements.map((requirement, index) => {
    const r = requirement && typeof requirement === "object" ? requirement : {};
    let priority = String(r.priority || "must").toLowerCase().trim();

    // Map 'should' or anything non-standard to 'must'/'nice' for Mongoose enum compliance
    if (priority === "should" || !["must", "nice"].includes(priority)) {
      priority = "must";
    }

    return {
      ...r,
      id: r.id || `req-${index + 1}`,
      skill: r.skill || "Core Skill",
      text: r.text || r.description || "Requirement details.",
      priority,
    };
  });

  const validReqIds = new Set(data.role.requirements.map((r) => r.id));

  data.questions = Array.isArray(data.questions)
    ? data.questions.map((qItem, index) => {
        const q = qItem && typeof qItem === "object" ? qItem : {};
        const parsedDiff = Number.parseInt(q.difficulty, 10);
        const difficulty = Number.isFinite(parsedDiff) ? Math.min(Math.max(parsedDiff, 1), 3) : 2;
        const reqIds = Array.isArray(q.requirement_ids) ? q.requirement_ids.filter((id) => validReqIds.has(id)) : [];
        const outlineText = q.outline || q.expected_answer || "Detailed answer and explanation.";

        return {
          ...q,
          id: q.id || `q-${index + 1}`,
          type: q.type || "technical",
          requirement_ids: reqIds,
          question: q.question || "Interview question.",
          difficulty,
          outline: outlineText,
          expected_answer: q.expected_answer || outlineText,
        };
      })
    : [];

  data.flashcards = Array.isArray(data.flashcards)
    ? data.flashcards.map((fcItem, index) => {
        const fc = fcItem && typeof fcItem === "object" ? fcItem : {};
        return {
          ...fc,
          id: fc.id || `fc-${index + 1}`,
          front: fc.front || "Concept",
          back: fc.back || "Explanation",
        };
      })
    : [];

  return data;
};

// ==================================================
// 4. MAIN PIPELINE EXPORTS
// ==================================================

export const extractRequirementsAndBrief = async (jd, scrapedText) => {
  if (typeof jd !== "string" || !jd.trim()) {
    throw new Error("A valid job description is required to generate the interview kit.");
  }

  const websiteText = typeof scrapedText === "string" ? scrapedText.trim() : "";

  const prompt = `
Analyze the following Job Description and Company Web Text.
Extract the company brief, role details, technical requirements, real interview questions with detailed outlines/answers, and flashcards.

Return ONLY a single valid JSON object following this exact schema:

{
  "company_brief": {
    "summary": "String detailing company summary",
    "culture": "String detailing company engineering culture",
    "what_they_do": "String detailing what the company does",
    "tech_stack": ["Tech 1", "Tech 2"]
  },
  "role": {
    "title": "Software Engineer",
    "seniority": "Seniority level",
    "responsibilities": ["Responsibility 1", "Responsibility 2"],
    "requirements": [
      {
        "id": "req-1",
        "skill": "Skill Name",
        "text": "Full requirement description",
        "priority": "must"
      }
    ]
  },
  "questions": [
    {
      "id": "q-1",
      "type": "technical",
      "requirement_ids": ["req-1"],
      "question": "Realistic interview question",
      "difficulty": 2,
      "outline": "Detailed answer outline and solution guidelines",
      "expected_answer": "Detailed expected answer"
    }
  ],
  "flashcards": [
    {
      "id": "fc-1",
      "front": "Key technical concept or prompt",
      "back": "Clear concise explanation"
    }
  ]
}

RULES:
1. "priority" MUST be either "must" or "nice".
2. "difficulty" MUST be an integer from 1 to 3.
3. Generate 6 to 10 relevant technical interview questions with thorough answer outlines.
4. Generate 6 to 10 flashcards.
5. Base all details on the provided Job Description and Website Text.

JOB DESCRIPTION:
${jd}

COMPANY WEBSITE CRAWLED TEXT:
${websiteText || "No website text available."}
`;

  const rawJsonString = await callGroqAPI(prompt);
  const parsedObj = parseJsonSafe(rawJsonString);
  return sanitizeKitData(parsedObj);
};

export const generateQuestionsAndFlashcards = async (requirements) => {
  if (!Array.isArray(requirements) || requirements.length === 0) {
    return { questions: [], flashcards: [] };
  }

  const prompt = `
Generate interview questions and revision flashcards based on these requirements:
${JSON.stringify(requirements, null, 2)}

Return ONLY JSON:
{
  "questions": [
    {
      "id": "q-1",
      "type": "technical",
      "requirement_ids": ["req-1"],
      "question": "Question text",
      "difficulty": 2,
      "outline": "Outline text",
      "expected_answer": "Answer text"
    }
  ],
  "flashcards": [
    { "id": "fc-1", "front": "Concept", "back": "Explanation" }
  ]
}
`;

  const rawJsonString = await callGroqAPI(prompt);
  const parsedObj = parseJsonSafe(rawJsonString);
  const normalized = sanitizeKitData({
    company_brief: {},
    role: { requirements },
    questions: parsedObj.questions,
    flashcards: parsedObj.flashcards,
  });

  return { questions: normalized.questions, flashcards: normalized.flashcards };
};

export const generateGapQuestions = async (uncoveredReqs) => {
  return generateQuestionsAndFlashcards(uncoveredReqs);
};

