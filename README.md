# InterviewAtlas — AI Interview Prep Kit

InterviewAtlas is a full-stack web application that transforms a job description into a structured, personalized interview preparation kit. It combines job-description analysis, company website research, AI-generated interview questions, flashcards, requirement coverage checking, and a day-by-day preparation schedule.

The goal is to help candidates prepare more efficiently by identifying what a role requires, organizing relevant practice material, and allocating preparation time according to the interview timeline.

## Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Research and Generation Pipeline](#research-and-generation-pipeline)
- [Requirement Coverage and Second Pass](#requirement-coverage-and-second-pass)
- [Preparation Schedule](#preparation-schedule)
- [Data Model](#data-model)
- [Error Handling and Edge Cases](#error-handling-and-edge-cases)
- [Security Considerations](#security-considerations)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [Batch Evaluation](#batch-evaluation)
- [Deployment](#deployment)
- [Testing](#testing)
- [Design Decisions and Trade-offs](#design-decisions-and-trade-offs)
- [Limitations and Future Improvements](#limitations-and-future-improvements)

## Features

### Job-specific preparation

- Accepts a pasted job description and a company website URL.
- Accepts the number of days available before the interview.
- Extracts role information, responsibilities, and job requirements.
- Generates a company brief, interview questions, flashcards, and a preparation schedule.
- Associates questions and flashcards with requirement IDs so the preparation material can be traced back to the role.

### Company research

- Crawls the supplied company website to collect relevant public information.
- Extracts readable text from retrieved pages.
- Follows discovered links on the company site rather than relying exclusively on a single homepage.
- Records the pages used by the research pipeline.
- Treats website retrieval as best-effort so that incomplete company research can be distinguished from a complete generation failure.

### AI-assisted generation

- Uses Groq-hosted language models to analyze the job description and produce structured preparation material.
- Requests JSON output to simplify downstream parsing and validation.
- Normalizes generated requirements, questions, and flashcards into predictable application structures.
- Includes retry and backoff handling for transient failures and rate limits.

### Requirement coverage

- Gives requirements stable IDs.
- Links questions to the requirements they address.
- Checks question coverage in application code rather than relying on the language model to decide whether coverage is complete.
- Generates targeted follow-up questions for uncovered requirements and checks coverage again.

### Preparation schedule

- Accepts a requested preparation period.
- Allocates questions across preparation days using application logic.
- Represents daily preparation with a focus, question IDs, and duration in integer minutes.
- Keeps schedule allocation separate from AI text generation.

### Persistence and batch evaluation

- Uses MongoDB with Mongoose to represent saved preparation kits.
- Provides a command-line evaluator that processes multiple job-description cases without requiring the frontend.
- Records successful and failed cases in a consolidated output file.

> **Implementation note:** Features such as authentication, bulk file upload, drag-and-drop question reordering, pinned edits, independent section regeneration, confidence-weighted practice, and public interview-discussion search should be described as completed only if they are implemented and demonstrable in the submitted version.

## Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React | Component-based user interface |
| Styling | Tailwind CSS | Utility-first styling and responsive layouts |
| Backend | Node.js | JavaScript runtime |
| API | Express.js | HTTP endpoints and request handling |
| Database | MongoDB | Persistence of preparation kits and related data |
| ODM | Mongoose | Schema definition and database interaction |
| Company research | Axios and Cheerio | HTTP retrieval and HTML parsing |
| LLM provider | Groq API | Structured AI-generated preparation content |
| Language | JavaScript (ES modules) | Shared language across application layers |

### Why React instead of Next.js?

The preferred frontend stack in the assessment was Next.js with Tailwind CSS. I chose React with Tailwind CSS because this project primarily needs an interactive, state-driven interface rather than server-side rendering or a framework-specific routing architecture.

React encourages the creation of reusable components. For example, question cards, flashcards, loading indicators, form fields, and section layouts can be built independently and reused across screens. This reduces duplicated UI code and makes components easier to maintain and test.

Keeping the frontend as a React application also separates the presentation layer from the Express API. The frontend communicates with the backend through HTTP requests, while the backend owns the research pipeline, AI integration, validation, and persistence.

Tailwind CSS complements this approach by allowing responsive styling directly alongside component markup without requiring a large collection of one-off CSS rules.

This was a deliberate trade-off: Next.js offers useful server-rendering and full-stack capabilities, but those features were not essential to the core workflow being built. React is an equivalent frontend choice for this client-driven application.

## Architecture

The application separates the user interface, API layer, research services, AI services, scheduling and coverage logic, and persistence.

```text
React + Tailwind CSS
        |
        | HTTP requests
        v
Node.js + Express API
        |
        v
Kit Controller
        |
        v
Pipeline Service
        |
        +------------------------+
        |                        |
        v                        v
Company Crawler             AI Service
        |                        |
        v                        v
Company Website             Groq API
        |                        |
        +------------+-----------+
                     |
                     v
        Requirement Coverage Check
                     |
                     v
          Gap Question Generation
                     |
                     v
            Schedule Allocation
                     |
                     v
           Kit Structure / Model
                     |
                     v
                MongoDB
```

### Separation of responsibilities

- **Frontend:** collects inputs and displays the generated preparation material.
- **Controller/API layer:** receives requests, validates inputs, coordinates operations, and returns structured responses.
- **Crawler service:** retrieves and parses company website content.
- **AI service:** extracts requirements and generates questions, flashcards, and targeted gap questions.
- **Pipeline service:** coordinates the order of retrieval, extraction, generation, coverage checking, and schedule creation.
- **Coverage logic:** compares requirement IDs with the IDs referenced by generated questions.
- **Schedule logic:** allocates question IDs across the requested number of days.
- **Mongoose model:** defines the structure used to persist kits.

This separation makes the system easier to reason about: AI is used for language understanding and content generation, while deterministic application code handles coverage decisions and scheduling arithmetic.

## Research and Generation Pipeline

The generation workflow is a sequence of steps rather than a single prompt that attempts to produce the entire kit at once.

### Step 1: Validate the input

The pipeline checks that a job description is provided, that a company URL is supplied in a valid HTTP or HTTPS format, and that the requested number of days is within the supported range.

The pasted job description is used directly; the application does not need to retrieve it from a job board.

### Step 2: Retrieve company information

The crawler requests the company website and extracts readable text from retrieved pages. It discovers additional links on the same hostname and uses them to collect more context.

The crawler limits the number of pages and the amount of text processed to keep retrieval bounded. In the current implementation, the crawl is limited to five pages and approximately 40,000 characters of collected text.

Retrieved page URLs are retained as source information so that the resulting kit can identify which pages informed its company brief.

A failed page retrieval should be treated as a research limitation rather than proof that the entire company is unreachable. If no useful company information is available, the brief should remain cautious instead of inventing facts.

### Step 3: Extract requirements and role information

The AI service analyzes the pasted job description and available company text. It produces a structured representation of the role, including:

- Role title and seniority
- Responsibilities
- Individual requirements
- Requirement categories
- Requirement priorities
- A company brief
- Initial interview questions
- Initial flashcards

Each requirement receives an ID. Requirements are marked as `must` or `nice`, and categorized as technical, behavioural, or domain-related.

The distinction between must-have and nice-to-have requirements matters because the schedule and coverage process need to prioritize the capabilities the employer explicitly requires.

The model is instructed to return structured JSON. The backend parses and normalizes the output before passing it to later stages.

### Step 4: Generate questions and flashcards

Questions cover the identified requirements and use categories such as technical, behavioural, system design, and company fit.

Every question contains a list of `requirement_ids`, making the relationship between the question and the job requirements explicit.

Flashcards provide concise prompts and answers for reviewing important concepts. They can also reference the requirements they support.

Separating these structures makes it possible to check coverage and organize practice material without interpreting free-form prose.

### Step 5: Check coverage

Application code determines which requirements are covered by at least one generated question. It compares requirement IDs against the IDs referenced by the question bank.

The model does not make the final coverage decision. The decision is deterministic and therefore easier to test.

### Step 6: Generate questions for uncovered requirements

If requirements remain uncovered, the pipeline sends the missing requirements to a targeted generation step. The resulting questions are merged with the existing questions and coverage is checked again.

This second pass is intended to reduce missing coverage without regenerating the entire kit.

The pipeline records coverage information in the output. A successful evaluation does not by itself establish that every generated question is factually perfect, so content quality still requires validation.

### Step 7: Allocate the schedule

The application distributes the question IDs over the requested preparation period. Scheduling is handled in code rather than delegated to the LLM.

The resulting kit combines company research, role analysis, questions, flashcards, coverage results, and the preparation schedule into a structured object.

### Research sources and limitations

The primary retrieval source in the current pipeline is the company website provided by the user and the same-site links discovered during crawling. Axios is used for HTTP retrieval, and Cheerio is used to parse HTML.

The current pipeline should not be represented as searching public forums or third-party interview reports unless that capability is present in the submitted code. Similarly, crawling company pages is not a guarantee that a hiring-process page will be found.

Public website content is external data and can be incomplete, stale, or irrelevant. The resulting kit should distinguish known information from unavailable information instead of treating a lack of evidence as proof.

## Requirement Coverage and Second Pass

Coverage is based on stable identifiers rather than keyword matching alone.

For example, a requirement might be represented as:

```json
{
  "id": "r1",
  "text": "Experience building REST APIs",
  "kind": "technical",
  "priority": "must"
}
```

A question that addresses this requirement references its ID:

```json
{
  "id": "q1",
  "requirement_ids": ["r1"],
  "category": "technical",
  "prompt": "How would you design a versioned REST API?",
  "answer_outline": "Discuss resource design, HTTP methods, validation, and versioning.",
  "difficulty": 2
}
```

If no question references `r1`, the coverage checker identifies it as uncovered. The gap-generation step then attempts to produce a relevant question.

The pipeline is designed to make the coverage decision in code and use AI only to create the missing content. This avoids relying on the same model that generated the original questions to simply declare its own output complete.

Coverage is still only as accurate as the requirement extraction and the question-to-requirement associations. Automated checks can verify structural coverage, but they cannot guarantee that every question adequately tests the intended skill.

## Preparation Schedule

The requested number of days determines the number of schedule entries.

Each day includes:

- `day`: the day number
- `focus`: the day's preparation focus
- `question_ids`: references to questions in the kit
- `minutes`: an integer duration

The schedule allocator is deterministic. It assigns question IDs across the available days and produces the schedule without asking the LLM to perform arithmetic.

The supported range in the current implementation is 1–60 days.

A schedule should be validated against three invariants:

1. The number of schedule entries equals `days_available`.
2. Every scheduled question ID refers to a question in the kit.
3. Must-have requirements are represented in the preparation plan.

The quality of prioritization depends on the allocation logic. A more advanced allocator could explicitly rank requirements by importance and difficulty before distributing them.

## Data Model

The saved kit follows the main structure specified in Appendix A of the assessment.

| Field | Purpose |
|---|---|
| `source` | Company, URL, role, input length, research timestamp, and retrieved page URLs |
| `company_brief` | Company summary, what the company does, and source URLs |
| `role` | Title, seniority, responsibilities, and requirements |
| `questions` | Categorized interview questions linked to requirement IDs |
| `flashcards` | Review prompts and answers linked to requirement IDs |
| `schedule` | Requested preparation period and daily allocations |
| `coverage` | Uncovered requirement IDs and number of coverage passes |

The Mongoose schema stores the kit together with ownership and identifying metadata. Schema defaults are used for supported optional fields, and generated content is normalized before it is returned from the pipeline.

The required field names from the assessment are retained. Additional fields can be used where they support persistence or the application's user experience, but should not replace the required structure.

## Error Handling and Edge Cases

### Invalid or unavailable company URL

The input URL is validated before retrieval. Company research is treated as best-effort so that an unreachable page can be recorded as a limitation while generation continues where possible.

A URL returning an error is not the same as a complete pipeline failure if a usable kit can still be generated from the job description.

### Company site has no hiring page

The crawler follows discovered same-site links, but it cannot guarantee that a hiring or careers page exists or is discoverable. The absence of such a page should be reported honestly rather than filled with fabricated hiring details.

### Very short job description

A thin description may not contain enough evidence for a detailed role breakdown. The system should avoid inventing requirements and should produce a limited kit where possible.

### Public interview information is unavailable

Company website research alone does not establish how a company conducts interviews. Third-party interview discussion is a separate research capability and should only be claimed if implemented.

### Invalid JSON or incomplete AI output

The AI service requests JSON, parses the response, and normalizes generated arrays and fields. Invalid responses can still cause a request to fail after retries; downstream structure validation is important before persistence.

### Rate limits and transient model failures

Groq may return HTTP 429 responses or temporary service errors. The AI service uses bounded retries and delay/backoff handling for retryable failures. This improves resilience but cannot guarantee success when the provider remains unavailable or the rate limit persists.

### Duplicate submissions

Identical job descriptions and company URLs may be submitted more than once. A future improvement would add a content hash and explicit idempotency strategy to avoid duplicate work. Unless such a mechanism exists in the submitted code, duplicate generation should not be described as automatically deduplicated.

### One-day and sixty-day schedules

The allocator accepts the supported 1–60 day range. These boundary cases should be checked to ensure the output contains exactly the requested number of days.

## Security Considerations

The application should treat job descriptions and retrieved web content as untrusted input.

Important protections include:

- Keep Groq and MongoDB credentials on the backend.
- Store secrets in environment variables rather than committing them to source control.
- Validate incoming request bodies and URL formats.
- Restrict retrieval to expected content types and bounded response sizes.
- Apply timeouts to external requests.
- Avoid interpreting text found on company pages as instructions to the AI system.
- Return useful error messages without exposing secrets or internal stack traces.
- Enforce authentication and kit ownership on protected API routes if authentication is enabled.
- In production, block loopback, private, link-local, and other internal destinations to reduce server-side request forgery (SSRF) risk.

URL syntax validation alone does not prevent SSRF. A production deployment should also validate resolved IP addresses, handle redirects safely, and apply network-level restrictions.

These are important security requirements for an application that fetches user-supplied URLs; they should be considered verified only after the corresponding controls have been implemented and tested.

## Getting Started

### Prerequisites

Install:

- Node.js with npm
- MongoDB, either locally or through MongoDB Atlas
- A Groq API key
- Git

Clone the repository:

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd InterviewAtlas
```

Install backend dependencies:

```bash
cd backend
npm install
```

Install frontend dependencies in a separate terminal:

```bash
cd frontend
npm install
```

If your frontend folder has a different name, use the actual directory in your repository.

## Environment Variables

Create a `.env` file in the backend directory. Use `.env.example` as the reference and never commit real credentials.

Example:

```dotenv
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/interviewatlas
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=openai/gpt-oss-120b
```

Use the actual port configured by your application. If your existing backend also requires a frontend origin, JWT secret, session secret, or other environment variables, include them in `.env.example` with descriptive placeholders.

| Variable | Purpose |
|---|---|
| `PORT` | Port used by the backend server |
| `MONGODB_URI` | MongoDB connection string |
| `GROQ_API_KEY` | Secret used to authenticate with Groq |
| `GROQ_MODEL` | Groq model identifier; defaults to `openai/gpt-oss-120b` in the current AI service |

Obtain your API key from the Groq developer console. Keep the key private and use the same model identifier that your account and API access support.

## Running the Application

Start the backend from the `backend` directory:

```bash
npm run dev
```

If the project does not define a `dev` script, use the start command declared in `backend/package.json`, such as:

```bash
npm start
```

Start the frontend from the `frontend` directory in a second terminal:

```bash
npm run dev
```

Open the local URL printed by the frontend development server.

For a production build, use the scripts provided in each package:

```bash
npm run build
```

The backend and frontend may require separate deployment configuration. The frontend's API base URL must point to the deployed backend, and the backend must allow requests from the deployed frontend origin.

## Batch Evaluation

The assessment requires a command-line entry point that reads multiple test cases and writes the resulting kits without using the frontend.

From the `backend` directory, run:

```bash
npm run evaluate -- --input scripts/cases.json --output scripts/kits.json
```

The general command format is:

```bash
npm run evaluate -- --input <cases.json> --output <kits.json>
```

### Input format

The input file contains an array of cases. Each case includes an ID, job description, company URL, and number of preparation days.

```json
[
  {
    "id": "case-01",
    "jd": "Backend Engineer\n\nExperience with Node.js and REST APIs...",
    "company_url": "https://example.com/",
    "days": 5
  }
]
```

### Output format

The output is a JSON document containing a version, generation timestamp, and one result for each case.

```json
{
  "version": "1.0",
  "generated_at": "2026-10-20T09:00:00Z",
  "kits": [
    {
      "id": "case-01",
      "status": "ok",
      "kit": {
        "source": {},
        "company_brief": {},
        "role": {},
        "questions": [],
        "flashcards": [],
        "schedule": {
          "days_available": 5,
          "days": []
        },
        "coverage": {
          "uncovered_requirement_ids": [],
          "passes": 2
        }
      },
      "error": null
    }
  ]
}
```

The example illustrates the output envelope; the actual kit must contain the complete required fields rather than empty objects.

The evaluator uses the same pipeline as the application, so batch results exercise retrieval, extraction, generation, coverage checking, and schedule allocation through a single entry point.

A case that produces a usable kit despite incomplete company research should be recorded as successful with the limitations reflected in the kit. A case that cannot produce a kit should be recorded as failed, with a structured error.

The current development evaluation was run against two sample cases. Both completed successfully, with zero failed cases and zero uncovered requirements reported by the evaluator. This is a useful smoke test, not a claim that every unseen posting or every external-service failure has been tested.

## Deployment

**Live application:** `<YOUR_DEPLOYED_FRONTEND_URL>`

**Backend API:** `<YOUR_DEPLOYED_BACKEND_URL>`

Replace these placeholders with the actual public URLs before submission.

Deployment checklist:

1. Deploy the backend and configure its production environment variables.
2. Configure the MongoDB connection string and database access rules.
3. Deploy the React frontend.
4. Set the frontend API base URL to the deployed backend.
5. Configure CORS for the deployed frontend origin.
6. Confirm that both services are publicly reachable.
7. Verify that a complete kit can be generated through the deployed interface.
8. Confirm that no API keys or database credentials are exposed in frontend code or the public repository.

## Testing

The batch evaluator is the primary integration-level check for the generation pipeline.

The following behaviours are particularly important to test:

- A valid job description produces a structurally valid kit.
- Questions reference existing requirement IDs.
- Coverage checking detects missing requirement references.
- The second pass generates targeted questions for uncovered requirements.
- The schedule contains exactly the requested number of days.
- Scheduled question IDs refer to existing questions.
- Durations are integer minutes.
- An unreachable company website does not unnecessarily prevent kit generation.
- Invalid model output and exhausted retries produce controlled errors.
- Database save-and-retrieve operations preserve the kit structure.

### Current verification

The evaluator completed two sample cases successfully, and both reported zero uncovered requirements. Further checks of frontend interactions, persistence, security boundaries, and edge cases should be treated separately from this evaluator result.

## Design Decisions and Trade-offs

### Deterministic logic versus AI generation

Language models are useful for extracting meaning and generating natural-language practice material. They are less suitable for decisions that need exact, repeatable outcomes.

For that reason, the application uses code for requirement coverage and schedule allocation. The model generates content, while application logic checks relationships and distributes the work.

### Structured output

Requesting JSON makes it easier to normalize AI responses and map them into the required schema. It does not eliminate malformed or incomplete output, so parsing, normalization, and structural validation remain necessary.

### Bounded retrieval

Limiting pages and collected text controls request volume and prompt size. The trade-off is that a relevant hiring page may not be discovered within the crawl budget. Ranking discovered links and respecting robots.txt and website terms are important areas for robust production retrieval.

### Retries and rate limits

Bounded retries and backoff help when the provider temporarily refuses requests. They increase latency, and no retry policy can guarantee availability under a sustained rate limit.

### React component reuse

React's component model keeps UI elements reusable and separates presentation from backend responsibilities. Choosing React rather than Next.js reduces framework-specific complexity for this client-driven workflow, at the cost of not using Next.js server rendering and integrated routing features.

### Honest handling of missing evidence

The application should not fabricate company hiring practices or job requirements when source material is unavailable. An honest, smaller kit is more useful than a detailed but unsupported one.

## Limitations and Future Improvements

Potential improvements include:

- Smarter ranking of discovered company links to prioritize careers, engineering, and hiring-process pages.
- A dedicated public interview-discussion retrieval stage with source tracking.
- Stronger SSRF protections, including DNS/IP checks and redirect validation.
- Automated unit tests for schedule allocation, coverage checking, and schema validation.
- More explicit validation of generated output before database persistence.
- Idempotency and caching to reduce repeated work for identical inputs.
- Progress reporting for long-running generation tasks.
- A robust edit-state model that distinguishes generated content from user-edited and pinned content.
- Confidence-aware flashcard review and practice prioritization.

## Conclusion

InterviewAtlas is designed around a simple principle: interview preparation should be grounded in the actual job description, informed by available company evidence, and organized into concrete work a candidate can complete.

The pipeline separates research, AI-assisted content generation, deterministic validation, and scheduling so that each stage has a clear responsibility. The batch evaluator provides a repeatable way to exercise the same pipeline outside the user interface.

The remaining challenge is not just generating more content, but ensuring that the content is relevant, evidence-based, structurally correct, and resilient to the unpredictable nature of external websites and AI services.

