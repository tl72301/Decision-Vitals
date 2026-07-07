# Decision Vitals

Vital signs for the decisions you've already made.

An ABP-inspired multi-agent decision monitoring prototype. Vite + React +
Tailwind frontend on Vercel; six specialist agents run on Claude Managed
Agents through two serverless routes. See `PLAN.md` for the full spec.

## Stack

- Vite + React + Tailwind (client-side routing via React Router)
- Two Vercel serverless routes under `/api` (added in later build steps)
- State in `localStorage`; sample data in a static JSON file. No database.

## Routes

| Path                              | Screen                 |
| --------------------------------- | ---------------------- |
| `/`                               | Dashboard              |
| `/new`                            | New Decision           |
| `/decision/:id`                   | Decision Detail        |
| `/decision/:id/run`               | Agent Run view         |
| `/decision/:id/report/:runId`     | Decision Health Report |

## Development

This project is built entirely through Claude Code on the web and deployed via
Vercel's GitHub integration. Standard Vite scripts (`build`, `preview`) exist
for CI/build verification.
