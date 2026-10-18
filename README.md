# 🚀 AI Interview Prep Kit (Full-Stack Engineering Assessment)

> A production-grade web application that transforms any job description and company website URL into a personalized, structured interview preparation kit—complete with a company brief, role breakdown, requirement-mapped question bank, interactive flashcards, day-by-day study schedules, practice mode, and a mandatory CLI batch evaluation pipeline.

---

## 🛠️ Tech Stack & Architecture

### **Preferred Tech Stack**
* **Frontend:** Next.js (App Router) + Tailwind CSS + Zustand
* **Backend:** Node.js + Express.js (MVC Architecture)
* **Database:** MongoDB + Mongoose
* **Language:** JavaScript (ES Modules)
* **Scraping Engine:** `cheerio` + `axios` (with custom robots.txt compliance, retry/backoff wrappers, and link ranking)
* **AI Provider:** Google Gemini API (`gemini-2.5-flash` via `@google/genai`) with strict structured JSON output schemas

### **High-Level Architecture**
```text
ai-interview-prep/
├── backend/
│   ├── src/
│   │   ├── controllers/    # Business logic for auth and kit generation/editing
│   │   ├── db/             # Mongoose connection setup
│   │   ├── middlewares/    # Authentication & global error handling
│   │   ├── models/         # MongoDB schemas (User & Appendix A-compliant Kit)
│   │   ├── routes/         # API route definitions (/api/v1/auth, /api/v1/kits)
│   │   ├── services/       # Core domain logic (Crawler, AI Pipeline, Scheduler, Coverage)
│   │   ├── utils/          # Custom ApiError & ApiResponse handlers
│   │   ├── app.js          # Express application setup
│   │   └── index.js        # Server entry point
│   ├── scripts/
│   │   └── evaluate.js     # Mandatory CLI batch evaluation script (`npm run evaluate`)
│   └── package.json
└── frontend/               # Next.js App Router client application
⚙️ Setup & Installation Instructions1. Clone the RepositoryBashgit clone [https://github.com/your-username/ai-interview-prep.git](https://github.com/your-username/ai-interview-prep.git)
cd ai-interview-prep
2. Backend SetupBashcd backend
npm install
Create a .env file in the backend/ directory based on .env.example:Code snippetPORT=5000
MONGODB_URI=mongodb://localhost:27017/ai-interview-prep
GEMINI_API_KEY=your_google_gemini_api_key_here
JWT_SECRET=your_super_secret_jwt_key
NODE_ENV=development
3. Running the BackendDevelopment Mode (with Nodemon):Bashnpm run dev
Production Mode:Bashnpm start
🧪 Mandatory Batch Entry Point (npm run evaluate)The backend exposes a command-line script that processes an array of evaluation cases and outputs a JSON file formatted strictly according to Appendix B.   Run the evaluation script from the backend/ directory:Bashnpm run evaluate --input ./cases.json --output ./kits.json
Behavior: Reads test cases, executes the full retrieval, AI extraction, gap-checking, and scheduling pipeline, handles unreachable URLs/errors gracefully without crashing the batch run, and completes 5 cases within the time limit.   🔬 Core Engineering Design & WorkflowResilient Web Crawler:Fetches the root company URL, parses all internal <a href> links using cheerio, and ranks them using keyword scoring to discover hidden /careers, /jobs, /engineering, or /blog paths without hardcoding routes.   Strictly respects site terms and skips unreachable URLs or 404s gracefully, generating an honest brief rather than crashing.   Sequential AI Pipeline & Second-Pass Coverage:Execution is broken into deliberate steps: (1) Requirement Extraction, (2) Company & Role Brief Synthesis, (3) Question/Flashcard Generation, and (4) Deterministic Coverage Validation.   The Coverage Loop: Code (not the LLM) checks if every must-priority requirement is referenced by at least one question ID. Any uncovered requirement triggers a second-pass generation targeted strictly at closing the gap.   Deterministic Scheduler:Arithmetic allocation divides questions across the exact number of days requested, scheduling higher-difficulty and must-have material earlier in the timeline.   State Preservation in the Builder:Supports inline editing, reordering, and single-section regeneration. User-crafted edits and custom additions are flagged and preserved during section-level regenerations so work is never clobbered.   
