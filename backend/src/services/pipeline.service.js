import { crawlCompanySite } from './crawler.service.js';
import { extractRequirementsAndBrief, generateQuestionsAndFlashcards, generateGapQuestions } from './ai.service.js';
import { checkCoverage } from './coverage.service.js';
import { allocateSchedule } from './scheduler.service.js';

export async function runFullPipeline({ jd, companyUrl, days }) {
  const startTime = new Date().toISOString();
  
  // 1. Crawl company site
  const crawlResult = await crawlCompanySite(companyUrl);

  // 2. Extract requirements & company brief via AI
  const extractionResult = await extractRequirementsAndBrief(jd, crawlResult.textContent);
  let requirements = extractionResult.role.requirements;

  // 3. Generate initial question bank and flashcards
  const initialGen = await generateQuestionsAndFlashcards(requirements, extractionResult);
  let questions = initialGen.questions;
  let flashcards = initialGen.flashcards;

  // 4. Run Coverage Check (Pass 1)
  let coverage = checkCoverage(requirements, questions);
  let passes = 1;

  // 5. Second Pass: If gaps exist, close them (Pass 2)
  if (!coverage.isFullyCovered && coverage.uncovered_requirement_ids.length > 0) {
    passes = 2;
    const uncoveredReqs = requirements.filter(r => coverage.uncovered_requirement_ids.includes(r.id));
    const gapGen = await generateGapQuestions(uncoveredReqs);
    
    questions = [...questions, ...(gapGen.questions || [])];
    flashcards = [...flashcards, ...(gapGen.flashcards || [])];
    
    // Re-check coverage
    coverage = checkCoverage(requirements, questions);
  }

  // 6. Allocate Schedule arithmetic
  const schedule = allocateSchedule(questions, days || 5);

  // 7. Format according to Appendix A schema
  return {
    source: {
      company: extractionResult.company_brief.summary ? companyUrl.split('/')[2] || 'Company' : 'Unknown',
      company_url: companyUrl,
      role: extractionResult.role.title || 'Software Engineer',
      location: 'Remote / Hybrid',
      jd_chars: jd.length,
      researched_at: startTime,
      pages_used: crawlResult.pagesUsed
    },
    company_brief: extractionResult.company_brief,
    role: {
      sources: crawlResult.pagesUsed,
      title: extractionResult.role.title,
      seniority: extractionResult.role.seniority,
      responsibilities: extractionResult.role.responsibilities,
      requirements: requirements
    },
    questions: questions,
    flashcards: flashcards,
    schedule: schedule,
    coverage: {
      uncovered_requirement_ids: coverage.uncovered_requirement_ids,
      passes: passes
    }
  };
}