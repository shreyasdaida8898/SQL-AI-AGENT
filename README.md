# SQL AI Agent

Ask your database a question in plain English. The agent converts it into SQL, runs it against your database, and shows you the results — with support for exporting to Excel and confirming write operations (INSERT/UPDATE/DELETE) before they run.

## Features

- Natural language → SQL query generation, powered by your choice of LLM provider (Claude, OpenAI, or a local Ollama model)
- Automatic database schema introspection, so the AI understands your tables and columns
- Live results table with row count (e.g. "200 rows returned")
- Download results as an Excel file (`.xlsx`)
- Question history (stored locally in the browser)
- Confirmation step before running any write query (INSERT/UPDATE/DELETE)

## Tech Stack

- **Frontend:** HTML, CSS, vanilla JavaScript
- **Excel export:** [SheetJS (xlsx)](https://github.com/SheetJS/sheetjs)
- **Backend:** Node.js
- **AI Providers:** Claude, OpenAI, and Ollama (local models) — pluggable via `services/`
- **Database:** SQL (MySQL/PostgreSQL — configure via `.env`)

## Project Structure

```
sql-ai-agent/
├── public/
│   ├── index.html          # Main page
│   ├── style.css            # Styles
│   └── script.js             # Frontend logic (query, results, history, Excel export)
├── services/
│   ├── claude.js             # Claude API integration
│   ├── openai.js             # OpenAI API integration
│   └── ollama.js             # Local Ollama model integration
├── lib/
│   └── schemaIntrospect.js   # Reads DB schema so the AI knows your tables/columns
├── server.js                # Backend server & API routes (/ask, /confirm)
├── .gitignore
└── README.md
```

## Setup

1. Clone the repo:
   ```bash
   git clone https://github.com/shreyasdaida8898/SQL-AI-AGENT.git
   cd SQL-AI-AGENT
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file in the root with your database and AI provider credentials:
   ```
   DB_HOST=localhost
   DB_USER=your_user
   DB_PASSWORD=your_password
   DB_NAME=your_database

   # Choose one or more providers depending on what services/ you're using
   OLLAMA_HOST=http://localhost:11434
   ```
   > **Never commit your `.env` file.** It's already excluded via `.gitignore`.

4. Start the server:
   ```bash
   node server.js
   ```

5. Open `public/index.html` in your browser, or visit `http://localhost:3000` (or your configured port) if served by `server.js`.

## Usage

1. Type a question in plain English (e.g. *"show all students absent in June 2024"*)
2. Click **Ask** (or press Enter)
3. Review the generated SQL query
4. View results in the table below — row count is shown next to "Results"
5. For write operations (INSERT/UPDATE/DELETE), review and click **Confirm & Run**
6. Click **Download Excel** to export results

## How It Works

1. `lib/schemaIntrospect.js` reads your database's table and column structure
2. Your question + schema context is sent to the selected AI provider (`services/claude.js`, `services/openai.js`, or `services/ollama.js`)
3. The AI returns a SQL query, which `server.js` validates and runs
4. Write queries (INSERT/UPDATE/DELETE) require explicit confirmation from the `/confirm` endpoint before executing
5. Results are sent back to `public/script.js` and rendered in the table

## Notes

- This app can execute write queries against a live database — restrict access accordingly before sharing with other users.
- Database credentials and API keys should always live in `.env`, never hardcoded or committed to the repo.
