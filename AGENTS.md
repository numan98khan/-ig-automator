# Repository Guidelines

## Project Structure & Module Organization
- Root helper: `start-dev.sh` pulls Railway env vars, opens Ngrok on 5001, and launches both apps; see `RAILWAY_SETUP.md` for deployment wiring.
- Backend (`backend/`): Express + TypeScript; `src/config` (env/db), `src/routes` (HTTP), `src/middleware` (auth/validation), `src/models` (Mongoose), `src/services` (logic), `src/utils` (helpers), entry `src/index.ts`, build to `dist/`.
- Frontend (`frontend/`): React + TypeScript (Vite) with `src/components`, `src/pages`, `src/context`, `src/services`, static assets in `public/`.

## Build, Test, and Development Commands
- Backend: `cd backend && npm run dev`, `npm run build`, `npm start`, `npm run seed` (loads demo inbox data).
- Frontend: `cd frontend && npm run dev`, `npm run build`, `npm run preview`, `npm run lint`, `npm run serve:prod` (serves `dist/` on `$PORT`).
- Full-stack shortcut: `./start-dev.sh` keeps the tunnel alive and exports `WEBHOOK_URL`/`INSTAGRAM_REDIRECT_URI` into `backend/.env`; keep that terminal open.

## Coding Style & Naming Conventions
- TypeScript-first with `async/await` and narrow DTOs; backend uses TS strict mode to catch issues.
- 2-space indentation, semicolons, trailing commas. Prefer `PascalCase` for React components/classes, `camelCase` for vars/functions, and feature-based file names (e.g., `routes/messages.ts`).
- React: functional components with hooks; colocate feature styles/config; avoid default exports in shared modules.
- Linting: enforced on frontend via ESLint (`npm run lint`). Backend leans on `npm run build` for type safety.

## Testing Guidelines
- No automated tests yet. For now, run `npm run lint` in `frontend`, then manually validate auth, workspace creation, messaging, AI reply generation, and webhook logging when Ngrok is active.
- When adding tests, mirror source structure under `__tests__/` or `src/<feature>/__tests__/` with `*.test.ts[x]`. Aim for Jest + React Testing Library on the frontend and service tests on the backend.

## Commit & Pull Request Guidelines
- Follow the conventional style used here (`feat: ...`, `fix: ...`). Keep commits focused and scoped to one concern.
- PRs should include a short summary, verification steps/commands, any env or config changes, and screenshots or GIFs for UI updates (desktop + mobile when relevant). Link related issues and call out risk areas (auth, webhooks).

## Documentation Updates
- When changing the flow builder or any node behavior/schema, update `INTERNAL_FLOW_BUILDER.md` to reflect the latest capabilities and runtime behavior.

## Security & Configuration Tips
- Never commit `.env`. Backend needs MongoDB URI, JWT secret, OpenAI key, and Ngrok/Railway URLs; `start-dev.sh` writes to `backend/.env` but you can also copy an example file if present.
- If Ngrok or Railway service names differ, adjust them in `start-dev.sh` before running; ensure the exposed port matches backend (`5001` default).
