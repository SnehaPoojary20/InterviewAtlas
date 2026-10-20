
import "dotenv/config";

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runFullPipeline } from "../src/services/pipeline.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VALID_REQUIREMENT_KINDS = new Set([
  "technical",
  "behavioural",
  "domain",
]);

const VALID_PRIORITIES = new Set(["must", "nice"]);

const VALID_QUESTION_CATEGORIES = new Set([
  "technical",
  "behavioural",
  "system-design",
  "company-fit",
]);

function parseArguments(args) {
  const result = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--input" || arg === "--output") {
      const value = args[i + 1];

      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${arg}`);
      }

      result[arg.slice(2)] = value;
      i++;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!result.input || !result.output) {
    throw new Error(
      "Usage: npm run evaluate -- --input <cases.json> --output <kits.json>"
    );
  }

  return result;
}

function validateCase(testCase, index) {
  if (!testCase || typeof testCase !== "object" || Array.isArray(testCase)) {
    throw new Error(`Case at index ${index} must be an object.`);
  }

  if (typeof testCase.id !== "string" || !testCase.id.trim()) {
    throw new Error(`Case at index ${index} must have a non-empty string id.`);
  }

  if (typeof testCase.jd !== "string") {
    throw new Error(`Case "${testCase.id}" must have a string jd.`);
  }

  if (typeof testCase.company_url !== "string" || !testCase.company_url.trim()) {
    throw new Error(`Case "${testCase.id}" must have company_url.`);
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(testCase.company_url);
  } catch {
    throw new Error(`Case "${testCase.id}" has an invalid company_url.`);
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error(
      `Case "${testCase.id}" must use an HTTP or HTTPS company_url.`
    );
  }

  if (
    !Number.isInteger(testCase.days) ||
    testCase.days < 1 ||
    testCase.days > 60
  ) {
    throw new Error(
      `Case "${testCase.id}" must have an integer days value from 1 to 60.`
    );
  }

  return testCase;
}

function validateKit(kit, requestedDays) {
  const errors = [];

  if (!kit || typeof kit !== "object" || Array.isArray(kit)) {
    return ["Pipeline did not return a kit object."];
  }

  // Appendix A: top-level fields
  const requiredTopLevelFields = [
    "source",
    "company_brief",
    "role",
    "questions",
    "flashcards",
    "schedule",
    "coverage",
  ];

  for (const field of requiredTopLevelFields) {
    if (!(field in kit)) {
      errors.push(`Missing top-level field: ${field}`);
    }
  }

  if (errors.length > 0) {
    return errors;
  }

  // Source
  const sourceFields = [
    "company",
    "company_url",
    "role",
    "location",
    "jd_chars",
    "researched_at",
    "pages_used",
  ];

  for (const field of sourceFields) {
    if (!(field in kit.source)) {
      errors.push(`Missing source.${field}`);
    }
  }

  if (!Array.isArray(kit.source.pages_used)) {
    errors.push("source.pages_used must be an array.");
  }

  if (
    !Number.isInteger(kit.source.jd_chars) ||
    kit.source.jd_chars < 0
  ) {
    errors.push("source.jd_chars must be a non-negative integer.");
  }

  // Company brief
  for (const field of ["summary", "what_they_do", "sources"]) {
    if (!(field in kit.company_brief)) {
      errors.push(`Missing company_brief.${field}`);
    }
  }

  if (!Array.isArray(kit.company_brief.sources)) {
    errors.push("company_brief.sources must be an array.");
  }

  // Role
  for (const field of [
    "title",
    "seniority",
    "responsibilities",
    "requirements",
  ]) {
    if (!(field in kit.role)) {
      errors.push(`Missing role.${field}`);
    }
  }

  if (!Array.isArray(kit.role.responsibilities)) {
    errors.push("role.responsibilities must be an array.");
  }

  if (!Array.isArray(kit.role.requirements)) {
    errors.push("role.requirements must be an array.");
  }

  const requirementIds = new Set();

  for (const [index, requirement] of (
    Array.isArray(kit.role.requirements) ? kit.role.requirements : []
  ).entries()) {
    const label = `role.requirements[${index}]`;

    if (!requirement || typeof requirement !== "object") {
      errors.push(`${label} must be an object.`);
      continue;
    }

    if (
      typeof requirement.id !== "string" ||
      !requirement.id.trim()
    ) {
      errors.push(`${label}.id must be a non-empty string.`);
    } else if (requirementIds.has(requirement.id)) {
      errors.push(`Duplicate requirement id: ${requirement.id}`);
    } else {
      requirementIds.add(requirement.id);
    }

    if (
      typeof requirement.text !== "string" ||
      !requirement.text.trim()
    ) {
      errors.push(`${label}.text must be a non-empty string.`);
    }

    if (!VALID_REQUIREMENT_KINDS.has(requirement.kind)) {
      errors.push(`${label}.kind must be technical, behavioural, or domain.`);
    }

    if (!VALID_PRIORITIES.has(requirement.priority)) {
      errors.push(`${label}.priority must be must or nice.`);
    }
  }

  // Questions
  if (!Array.isArray(kit.questions)) {
    errors.push("questions must be an array.");
  }

  const questionIds = new Set();
  const coveredRequirementIds = new Set();

  for (const [index, question] of (
    Array.isArray(kit.questions) ? kit.questions : []
  ).entries()) {
    const label = `questions[${index}]`;

    if (!question || typeof question !== "object") {
      errors.push(`${label} must be an object.`);
      continue;
    }

    if (
      typeof question.id !== "string" ||
      !question.id.trim()
    ) {
      errors.push(`${label}.id must be a non-empty string.`);
    } else if (questionIds.has(question.id)) {
      errors.push(`Duplicate question id: ${question.id}`);
    } else {
      questionIds.add(question.id);
    }

    if (!Array.isArray(question.requirement_ids)) {
      errors.push(`${label}.requirement_ids must be an array.`);
    } else {
      for (const requirementId of question.requirement_ids) {
        if (!requirementIds.has(requirementId)) {
          errors.push(
            `${label} references unknown requirement id: ${requirementId}`
          );
        } else {
          coveredRequirementIds.add(requirementId);
        }
      }
    }

    if (!VALID_QUESTION_CATEGORIES.has(question.category)) {
      errors.push(`${label}.category has an invalid value.`);
    }

    if (
      typeof question.prompt !== "string" ||
      !question.prompt.trim()
    ) {
      errors.push(`${label}.prompt must be a non-empty string.`);
    }

    if (
      typeof question.answer_outline !== "string" ||
      !question.answer_outline.trim()
    ) {
      errors.push(`${label}.answer_outline must be a non-empty string.`);
    }

    if (
      !Number.isInteger(question.difficulty) ||
      question.difficulty < 1 ||
      question.difficulty > 3
    ) {
      errors.push(`${label}.difficulty must be an integer from 1 to 3.`);
    }
  }

  // Flashcards
  if (!Array.isArray(kit.flashcards)) {
    errors.push("flashcards must be an array.");
  }

  const flashcardIds = new Set();

  for (const [index, flashcard] of (
    Array.isArray(kit.flashcards) ? kit.flashcards : []
  ).entries()) {
    const label = `flashcards[${index}]`;

    if (!flashcard || typeof flashcard !== "object") {
      errors.push(`${label} must be an object.`);
      continue;
    }

    if (
      typeof flashcard.id !== "string" ||
      !flashcard.id.trim()
    ) {
      errors.push(`${label}.id must be a non-empty string.`);
    } else if (flashcardIds.has(flashcard.id)) {
      errors.push(`Duplicate flashcard id: ${flashcard.id}`);
    } else {
      flashcardIds.add(flashcard.id);
    }

    for (const field of ["front", "back"]) {
      if (
        typeof flashcard[field] !== "string" ||
        !flashcard[field].trim()
      ) {
        errors.push(`${label}.${field} must be a non-empty string.`);
      }
    }

    if (!Array.isArray(flashcard.requirement_ids)) {
      errors.push(`${label}.requirement_ids must be an array.`);
    } else {
      for (const requirementId of flashcard.requirement_ids) {
        if (!requirementIds.has(requirementId)) {
          errors.push(
            `${label} references unknown requirement id: ${requirementId}`
          );
        }
      }
    }
  }

  // Schedule
  const schedule = kit.schedule;

  if (!schedule || typeof schedule !== "object") {
    errors.push("schedule must be an object.");
  } else {
    if (schedule.days_available !== requestedDays) {
      errors.push(
        `schedule.days_available must equal requested days (${requestedDays}).`
      );
    }

    if (!Array.isArray(schedule.days)) {
      errors.push("schedule.days must be an array.");
    } else {
      if (schedule.days.length !== requestedDays) {
        errors.push(
          `Schedule must contain exactly ${requestedDays} days.`
        );
      }

      const seenDays = new Set();

      for (const [index, day] of schedule.days.entries()) {
        const label = `schedule.days[${index}]`;

        if (!day || typeof day !== "object") {
          errors.push(`${label} must be an object.`);
          continue;
        }

        if (
          !Number.isInteger(day.day) ||
          day.day < 1 ||
          day.day > requestedDays ||
          seenDays.has(day.day)
        ) {
          errors.push(`${label}.day must be a unique day number in range.`);
        } else {
          seenDays.add(day.day);
        }

        if (typeof day.focus !== "string" || !day.focus.trim()) {
          errors.push(`${label}.focus must be a non-empty string.`);
        }

        if (
          !Number.isInteger(day.minutes) ||
          day.minutes < 0
        ) {
          errors.push(`${label}.minutes must be a non-negative integer.`);
        }

        if (!Array.isArray(day.question_ids)) {
          errors.push(`${label}.question_ids must be an array.`);
        } else {
          for (const questionId of day.question_ids) {
            if (!questionIds.has(questionId)) {
              errors.push(
                `${label} references unknown question id: ${questionId}`
              );
            }
          }
        }
      }

      // Every question should be assigned to at least one schedule day.
      const scheduledQuestionIds = new Set(
        schedule.days.flatMap((day) =>
          Array.isArray(day?.question_ids) ? day.question_ids : []
        )
      );

      for (const questionId of questionIds) {
        if (!scheduledQuestionIds.has(questionId)) {
          errors.push(`Question ${questionId} is missing from the schedule.`);
        }
      }
    }
  }

  // Coverage must be checked deterministically, not trusted from the model.
  if (
    !kit.coverage ||
    !Array.isArray(kit.coverage.uncovered_requirement_ids) ||
    !Number.isInteger(kit.coverage.passes)
  ) {
    errors.push("coverage must contain uncovered_requirement_ids and passes.");
  } else {
    const actualUncovered = [
      ...(Array.isArray(kit.role.requirements)
        ? kit.role.requirements
        : []),
    ]
      .filter(
        (requirement) =>
          requirement.priority === "must" &&
          !coveredRequirementIds.has(requirement.id)
      )
      .map((requirement) => requirement.id)
      .sort();

    const reportedUncovered = [
      ...kit.coverage.uncovered_requirement_ids,
    ].sort();

    if (
      JSON.stringify(actualUncovered) !==
      JSON.stringify(reportedUncovered)
    ) {
      errors.push(
        "coverage.uncovered_requirement_ids does not match actual question coverage."
      );
    }

    if (actualUncovered.length > 0) {
      errors.push(
        `Must-have requirements remain uncovered: ${actualUncovered.join(", ")}`
      );
    }

    if (kit.coverage.passes < 1) {
      errors.push("coverage.passes must be at least 1.");
    }
  }

  return errors;
}

function safeErrorMessage(error) {
  const message =
    typeof error?.message === "string"
      ? error.message
      : "An unexpected error occurred.";

  // Avoid writing secrets into the output file or terminal.
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/(api[_-]?key|token|password)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .slice(0, 500);
}

function classifyError(error) {
  const message = safeErrorMessage(error).toLowerCase();

  if (
    message.includes("company_url") ||
    message.includes("invalid url") ||
    message.includes("url protocol")
  ) {
    return "INVALID_INPUT";
  }

  if (message.includes("unreachable") || message.includes("timeout")) {
    return "COMPANY_UNREACHABLE";
  }

  if (
    message.includes("groq") ||
    message.includes("rate limit") ||
    message.includes("429") ||
    message.includes("malformed json")
  ) {
    return "GENERATION_FAILED";
  }

  return "PIPELINE_FAILED";
}

async function main() {
  const { input, output } = parseArguments(process.argv.slice(2));

  const inputPath = path.resolve(process.cwd(), input);
  const outputPath = path.resolve(process.cwd(), output);

  let cases;

  try {
    const fileContent = await fs.readFile(inputPath, "utf8");
    cases = JSON.parse(fileContent);
  } catch (error) {
    throw new Error(
      `Could not read input JSON at "${inputPath}": ${safeErrorMessage(error)}`
    );
  }

  if (!Array.isArray(cases)) {
    throw new Error("Input JSON must contain an array of cases.");
  }

  const results = [];

  // Sequential processing helps avoid exhausting the free LLM tier.
  for (let index = 0; index < cases.length; index++) {
    const rawCase = cases[index];
    const fallbackId =
      typeof rawCase?.id === "string" && rawCase.id.trim()
        ? rawCase.id
        : `case-index-${index}`;

    console.log(
      `[${index + 1}/${cases.length}] Processing ${fallbackId}...`
    );

    try {
      const testCase = validateCase(rawCase, index);

      const kit = await runFullPipeline({
        jd: testCase.jd,
        companyUrl: testCase.company_url,
        days: testCase.days,
      });

      const validationErrors = validateKit(kit, testCase.days);

      if (validationErrors.length > 0) {
        console.error(
          `  FAILED validation: ${validationErrors.join(" | ")}`
        );

        results.push({
          id: testCase.id,
          status: "failed",
          kit: null,
          error: {
            code: "INVALID_KIT_STRUCTURE",
            message: validationErrors.join(" | ").slice(0, 2000),
          },
        });

        continue;
      }

      results.push({
        id: testCase.id,
        status: "ok",
        kit,
        error: null,
      });

      console.log(
        `  OK: ${kit.role.requirements.length} requirements, ` +
        `${kit.questions.length} questions, ` +
        `${kit.flashcards.length} flashcards`
      );
    } catch (error) {
      const message = safeErrorMessage(error);

      console.error(`  FAILED: ${message}`);

      results.push({
        id: fallbackId,
        status: "failed",
        kit: null,
        error: {
          code: classifyError(error),
          message,
        },
      });
    }
  }

  const outputData = {
    version: "1.0",
    generated_at: new Date().toISOString(),
    kits: results,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  await fs.writeFile(
    outputPath,
    JSON.stringify(outputData, null, 2) + "\n",
    "utf8"
  );

  const successful = results.filter((item) => item.status === "ok").length;
  const failed = results.length - successful;

  console.log("\nEvaluation finished.");
  console.log(`Successful: ${successful}`);
  console.log(`Failed: ${failed}`);
  console.log(`Output: ${outputPath}`);

  // A failed case should not prevent the other cases being written.
  // Exit non-zero so CI can detect that the batch was not fully successful.
  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Evaluation could not start: ${safeErrorMessage(error)}`);
  process.exitCode = 1;
});
