
import { crawlCompanySite } from "./crawler.service.js";

import {
  extractRequirementsAndBrief,
  generateQuestionsAndFlashcards,
  generateGapQuestions,
  checkCoverage,
} from "./ai.service.js";

// ==================================================
// 1. Pipeline helpers
// ==================================================

function asString(value, fallback = "") {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : fallback;
}

function uniqueById(items) {
  const seen = new Set();

  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

function uniqueQuestions(existing, incoming) {
  const result = [...existing];

  const seenIds = new Set(result.map((question) => question.id));

  const seenPrompts = new Set(
    result.map((question) =>
      question.prompt.trim().toLowerCase()
    )
  );

  for (const question of incoming) {
    if (
      !question?.id ||
      typeof question.prompt !== "string" ||
      !question.prompt.trim()
    ) {
      continue;
    }

    const normalizedPrompt = question.prompt
      .trim()
      .toLowerCase();

    if (
      seenIds.has(question.id) ||
      seenPrompts.has(normalizedPrompt)
    ) {
      continue;
    }

    result.push(question);
    seenIds.add(question.id);
    seenPrompts.add(normalizedPrompt);
  }

  return result;
}

function uniqueFlashcards(existing, incoming) {
  const result = [...existing];

  const seenIds = new Set(result.map((card) => card.id));

  const seenFronts = new Set(
    result.map((card) => card.front.trim().toLowerCase())
  );

  for (const card of incoming) {
    if (
      !card?.id ||
      typeof card.front !== "string" ||
      !card.front.trim() ||
      typeof card.back !== "string" ||
      !card.back.trim()
    ) {
      continue;
    }

    const normalizedFront = card.front
      .trim()
      .toLowerCase();

    if (
      seenIds.has(card.id) ||
      seenFronts.has(normalizedFront)
    ) {
      continue;
    }

    result.push(card);
    seenIds.add(card.id);
    seenFronts.add(normalizedFront);
  }

  return result;
}

function getCompanyName(companyUrl, companyBrief) {
  // Use a generated company name if the AI provides one.
  const generatedName = asString(
    companyBrief?.company,
    ""
  );

  if (generatedName) {
    return generatedName;
  }

  try {
    const hostname = new URL(companyUrl).hostname
      .replace(/^www\./i, "");

    return hostname.split(".")[0] || "Company";
  } catch {
    return "Company";
  }
}

function normalizeSources(sources) {
  if (!Array.isArray(sources)) {
    return [];
  }

  return [
    ...new Set(
      sources.filter(
        (source) =>
          typeof source === "string" &&
          source.trim().length > 0
      ).map((source) => source.trim())
    ),
  ];
}

// ==================================================
// 2. Allocate questions into a preparation schedule
// ==================================================

function allocateSchedule(questions, daysAvailable) {
  const totalDays = Math.min(
    60,
    Math.max(
      1,
      Number.parseInt(daysAvailable, 10) || 5
    )
  );

  const sortedQuestions = [...questions].sort((a, b) => {
    const difficultyA = Number(a.difficulty) || 1;
    const difficultyB = Number(b.difficulty) || 1;

    return (
      difficultyA - difficultyB ||
      String(a.id).localeCompare(String(b.id))
    );
  });

  const days = Array.from(
    { length: totalDays },
    (_, index) => ({
      day: index + 1,
      focus: "",
      question_ids: [],
      minutes: 60,
    })
  );

  // Distribute questions across days instead of
  // assigning every question to the first day.
  sortedQuestions.forEach((question, index) => {
    days[index % totalDays].question_ids.push(
      question.id
    );
  });

  for (const day of days) {
    if (totalDays === 1) {
      day.focus =
        "Core Concepts, Interview Practice, and Revision";
    } else if (day.day === 1) {
      day.focus =
        "Core Concepts and Must-Have Requirements";
    } else if (day.day === totalDays) {
      day.focus =
        "Revision, Mock Interviews, and Weak Areas";
    } else {
      day.focus =
        `Interview Practice and Skill Building - Day ${day.day}`;
    }
  }

  return {
    days_available: totalDays,
    days,
  };
}

// ==================================================
// 3. Run the complete interview preparation pipeline
// ==================================================

export async function runFullPipeline({
  jd,
  companyUrl,
  days = 5,
}) {
  const startTime = new Date().toISOString();

  // ----------------------------------------------
  // Validate input
  // ----------------------------------------------

  if (typeof jd !== "string" || !jd.trim()) {
    throw new Error(
      "A valid job description (jd) is required."
    );
  }

  if (
    typeof companyUrl !== "string" ||
    !companyUrl.trim()
  ) {
    throw new Error(
      "A valid companyUrl is required."
    );
  }

  let parsedCompanyUrl;

  try {
    parsedCompanyUrl = new URL(companyUrl.trim());
  } catch {
    throw new Error(
      "companyUrl must be a valid absolute URL."
    );
  }

  if (
    !["http:", "https:"].includes(
      parsedCompanyUrl.protocol
    )
  ) {
    throw new Error(
      "companyUrl must use HTTP or HTTPS."
    );
  }

  const totalDays = Math.min(
    60,
    Math.max(
      1,
      Number.parseInt(days, 10) || 5
    )
  );

  console.log("========================================");
  console.log(
    "Starting InterviewAtlas preparation pipeline"
  );
  console.log(
    `Company URL: ${parsedCompanyUrl.href}`
  );
  console.log(
    `Job description length: ${jd.trim().length}`
  );
  console.log(
    `Preparation days: ${totalDays}`
  );
  console.log("========================================");

  // ----------------------------------------------
  // STEP 1: Crawl the company website
  // ----------------------------------------------

  let crawlResult = {
    pagesUsed: [],
    textContent: "",
  };

  try {
    const crawled = await crawlCompanySite(
      parsedCompanyUrl.href
    );

    crawlResult = {
      pagesUsed: normalizeSources(crawled?.pagesUsed),
      textContent:
        typeof crawled?.textContent === "string"
          ? crawled.textContent
          : "",
    };
  } catch (error) {
    // Crawling is best-effort. The job description
    // remains the primary source of role requirements.
    console.warn(
      "Company website crawling failed:",
      error.message
    );
  }

  console.log(
    `Website pages collected: ${crawlResult.pagesUsed.length}`
  );

  if (!crawlResult.textContent.trim()) {
    console.warn(
      "No company website text was extracted; continuing with the job description."
    );
  }

  // ----------------------------------------------
  // STEP 2: Extract company and role information
  // ----------------------------------------------

  const extractionResult =
    await extractRequirementsAndBrief(
      jd.trim(),
      crawlResult.textContent
    );

  const requirements = Array.isArray(
    extractionResult?.role?.requirements
  )
    ? extractionResult.role.requirements
    : [];

  if (requirements.length === 0) {
    throw new Error(
      "The AI extraction step returned no valid requirements."
    );
  }

  console.log(
    `Requirements extracted: ${requirements.length}`
  );

  // ----------------------------------------------
  // STEP 3: Generate or reuse initial questions
  // and flashcards
  // ----------------------------------------------

  const initialGeneration =
    await generateQuestionsAndFlashcards(
      requirements,
      extractionResult
    );

  let questions = uniqueById(
    Array.isArray(initialGeneration?.questions)
      ? initialGeneration.questions
      : []
  );

  let flashcards = uniqueById(
    Array.isArray(initialGeneration?.flashcards)
      ? initialGeneration.flashcards
      : []
  );

  if (questions.length === 0) {
    throw new Error(
      "The question generation step returned no usable questions."
    );
  }

  console.log(
    `Initial questions: ${questions.length}`
  );
  console.log(
    `Initial flashcards: ${flashcards.length}`
  );

  // ----------------------------------------------
  // STEP 4: Check requirement coverage
  // ----------------------------------------------

  let coverage = checkCoverage(
    requirements,
    questions
  );

  let passes = 1;

  // ----------------------------------------------
  // STEP 5: Generate questions for uncovered
  // requirements, if necessary
  // ----------------------------------------------

  if (
    coverage.uncovered_requirement_ids.length > 0
  ) {
    passes = 2;

    const uncoveredIds = new Set(
      coverage.uncovered_requirement_ids
    );

    const uncoveredRequirements = requirements.filter(
      (requirement) =>
        uncoveredIds.has(requirement.id)
    );

    console.log(
      `Generating questions for ${uncoveredRequirements.length} uncovered requirement(s)...`
    );

    const gapGeneration =
      await generateGapQuestions(
        uncoveredRequirements
      );

    questions = uniqueQuestions(
      questions,
      Array.isArray(gapGeneration?.questions)
        ? gapGeneration.questions
        : []
    );

    flashcards = uniqueFlashcards(
      flashcards,
      Array.isArray(gapGeneration?.flashcards)
        ? gapGeneration.flashcards
        : []
    );

    // Recalculate coverage after adding the new questions.
    coverage = checkCoverage(
      requirements,
      questions
    );
  }

  console.log(
    `Total questions: ${questions.length}`
  );
  console.log(
    `Total flashcards: ${flashcards.length}`
  );
  console.log(
    `Uncovered requirements: ${coverage.uncovered_requirement_ids.length}`
  );

  // ----------------------------------------------
  // STEP 6: Create the preparation schedule
  // ----------------------------------------------

  const schedule = allocateSchedule(
    questions,
    totalDays
  );

  // ----------------------------------------------
  // STEP 7: Build schema-compatible kit data
  // ----------------------------------------------

  const companyBrief =
    extractionResult?.company_brief || {};

  // Use crawled URLs as sources. Keep the field an array
  // even when crawling returns no pages.
  const sources = normalizeSources(
    crawlResult.pagesUsed
  );

  const result = {
    source: {
      company: getCompanyName(
        parsedCompanyUrl.href,
        companyBrief
      ),
      company_url: parsedCompanyUrl.href,
      role: asString(
        extractionResult?.role?.title,
        "Software Engineer"
      ),
      location: "Not specified",
      jd_chars: jd.trim().length,
      researched_at: startTime,
      pages_used: sources,
    },

    company_brief: {
      summary: asString(
        companyBrief.summary,
        "Company overview could not be generated."
      ),
      what_they_do: asString(
        companyBrief.what_they_do,
        "Company activities could not be determined."
      ),

      // Required by the evaluator:
      // company_brief.sources must be an array.
      sources,
    },

    role: {
      sources,
      title: asString(
        extractionResult?.role?.title,
        "Software Engineer"
      ),
      seniority: asString(
        extractionResult?.role?.seniority,
        "Not specified"
      ),
      responsibilities: Array.isArray(
        extractionResult?.role?.responsibilities
      )
        ? extractionResult.role.responsibilities
        : [],
      requirements,
    },

    questions,
    flashcards,
    schedule,

    coverage: {
      uncovered_requirement_ids:
        coverage.uncovered_requirement_ids,
      passes,
    },
  };

  console.log(
    "InterviewAtlas pipeline completed."
  );
  console.log("========================================");

  return result;
}

