# Postgres Hybrid Migration Notes

This document captures the current state of the hybrid Postgres migration and related changes that have already been made. It is intended as a reference if/when work resumes on a full migration.

## Goals
- Move **core domain data** to Postgres (users, workspaces, tiers, billing, subscriptions, usage counters).
- Keep **non-core feature data** in MongoDB (flows, templates, conversations, knowledge, etc.).
- Maintain a hybrid runtime where Postgres + Mongo both run, with clear ownership boundaries.

## Current Architecture
- **Postgres** is the source of truth for core entities and usage data.
- **MongoDB** continues to store application feature data (flows, conversations, knowledge, etc.).
- Server startup ensures Postgres schema exists before Mongo connects.

### Startup Ordering
- `backend/src/index.ts` calls `ensureCoreSchema()` before `connectDB()`.

## Postgres Core Schema
- Defined in `backend/src/db/coreSchema.ts` and created via `ensureCoreSchema()`.
- Tables include:
  - `core.users`
  - `core.workspaces`
  - `core.workspace_members`
  - `core.tiers`
  - `core.billing_accounts`
  - `core.subscriptions`
  - `core.usage_counters`
  - `core.openai_usage`

## Core Repositories (Postgres)
Located under `backend/src/repositories/core/`:
- `userRepository.ts`
- `workspaceRepository.ts`
- `workspaceMemberRepository.ts`
- `tierRepository.ts`
- `billingAccountRepository.ts`
- `subscriptionRepository.ts`
- `usageCounterRepository.ts`
- `openAiUsageRepository.ts`

These repositories are used by routes/services that have been migrated to Postgres-based access.

## OpenAI Usage Logging
- `backend/src/services/openAiUsageService.ts` logs token counts and estimated cost into `core.openai_usage`.
- Usage is logged from:
  - `backend/src/services/aiReplyService.ts`
  - `backend/src/services/aiAgentService.ts`
  - `backend/src/services/assistantService.ts`
- Admin API provides usage summary per workspace via:
  - `GET /api/admin/workspaces/:id/usage`

## Admin Console Updates (sf-admin-console)
- Flow Builder now unwraps list responses for drafts/templates:
  - `sf-admin-console/src/pages/AutomationTemplates.tsx`
- Draft creation now surfaces backend errors (same file).
- Workspace detail page shows AI usage summary:
  - `sf-admin-console/src/pages/WorkspaceDetail.tsx`
  - `sf-admin-console/src/services/api.ts` adds `getWorkspaceUsage`.

## UI Theme Sync (Comic Theme)
- Global UI settings persist under a stable key (`key: 'global'`).
- Public API route `/api/ui-settings` now upserts by key.
- Admin routes `/api/admin/ui-settings` also upsert/read by key.
- Model updated in `backend/src/models/GlobalUiSettings.ts`.

## Flow Draft Publishing Fix
- Publishing drafts without a `templateId` creates a new `FlowTemplate` and binds the draft.
- Logic is in `backend/src/routes/admin.ts` under `POST /flow-drafts/:id/publish`.

## Utilities
### Migration
- `backend/src/utils/migrateCoreData.ts` backfills Mongo core data to Postgres.
- Script: `npm run migrate:core` (backend).

### Factory Reset
- `backend/src/utils/resetFactoryData.ts` deletes Postgres core data and Mongo collections, while preserving:
  - `admin@sendfx.ai`
  - `adminlogsettings`
- Script: `npm run reset:factory` (backend).

## Known Gaps / Follow-ups
- **Full migration not complete**: only core entities are Postgres-backed; other features remain in Mongo.
- **Consistency enforcement**: not all routes/services have strict guardrails to avoid cross-DB data drift.
- **Linting**: frontend and admin console lint currently fail due to ESLint v9 config migration.

## Suggested Next Steps (If Resuming)
1. Confirm the final split of “core” vs “non-core” models.
2. Audit routes/services to ensure Mongo-only features never read/write Postgres core tables.
3. Optional: add monitoring/logging to detect any accidental cross-DB access.
4. Resolve ESLint v9 config migration in `frontend/` and `sf-admin-console/`.
5. Add documentation for how to set `POSTGRES_URL`/`DATABASE_URL` and the expected schema.

---

This document reflects the hybrid state as of the latest migration work and should be kept in sync with any future changes.
