# Internal Flow Builder + Template Architecture

This document describes how the internal flow builder drives user-facing templates and runtime execution. It is intended for future developers working on the admin builder, publish pipeline, or automation runtime.

## Overview

- Admins author drafts in a visual builder (React Flow) stored as a DSL (nodes + edges + per-node config).
- Publishing compiles the DSL into a template version (immutable) and marks it as the latest.
- End users only see templates (and their latest published version) and create instances with per-user config.
- Runtime resolves the latest version, applies exposed field overrides + template variables, then executes the compiled graph.
- The start trigger node defines entry triggers, including optional trigger config (keywords, intent, etc).
- Global automation intentions are stored in Mongo and reused by detect-intent steps + router rules.

## Key Data Models

Backend types live in `backend/src/types/flow.ts` and Mongoose models in `backend/src/models/`.

- `FlowDraft`
  - Admin-authored working copy.
  - Stores `dsl`, `exposedFields`, `display`, and `triggers` (derived from the start trigger node on save/publish).
- `FlowTemplate`
  - Stable template record (name/description/status).
  - Has `currentVersionId` pointing to the latest published version.
- `FlowTemplateVersion`
  - Immutable published artifact.
  - Stores `compiled`, `dslSnapshot`, `triggers`, `exposedFields`, `display`, `version`, and metadata.
- `AutomationInstance`
  - User-created instance tied to a workspace.
  - Stores `templateId`, `templateVersionId` (kept in sync with current version), and `userConfig`.
- `AutomationSession`
  - Runtime session for a live conversation.
  - Stores flow state and is updated to use the latest template version at runtime.
- `AutomationIntent`
  - Global intent definitions persisted in Mongo (value + description).
  - Used by detect-intent nodes + router rule dropdowns in the builder.

## DSL Shape

The flow builder writes a DSL with nodes, edges, and `startNodeId`.

Example:

```json
{
  "nodes": [
    {
      "id": "node-1",
      "type": "trigger",
      "position": { "x": 120, "y": 80 },
      "data": { "label": "Trigger", "isStart": true },
      "triggerType": "dm_message",
      "triggerDescription": "User sends a message",
      "triggerConfig": {
        "triggerMode": "keywords",
        "keywords": ["price", "quote"],
        "keywordMatch": "any"
      }
    },
    {
      "id": "node-2",
      "type": "detect_intent",
      "position": { "x": 320, "y": 80 },
      "data": { "label": "Detect intent" },
      "intentSettings": { "model": "gpt-5-mini", "reasoningEffort": "low" }
    },
    {
      "id": "node-3",
      "type": "send_message",
      "position": { "x": 520, "y": 80 },
      "data": { "label": "Message" },
      "text": "Responding for: {{ vars.detectedIntent }}",
      "buttons": [{ "title": "Browse", "payload": "browse" }],
      "tags": ["flow:reply"],
      "waitForReply": true
    }
  ],
  "edges": [
    { "id": "edge-1", "source": "node-1", "target": "node-2", "type": "smoothstep" },
    { "id": "edge-2", "source": "node-2", "target": "node-3", "type": "smoothstep" }
  ],
  "startNodeId": "node-1"
}
```

Supported node types:
- `trigger`
- `detect_intent`
- `send_message`
- `ai_reply`
- `ai_agent`
- `handoff`

## Node Payloads + Graph Defaults

Common optional fields (all nodes):
- `logEnabled`: set `false` to suppress per-node runtime logs (defaults to true).
- `waitForReply`: stop execution after the node and persist the next pointer in session state.
- `next`: manual pointer for legacy step graphs (still supported).

Per-node fields:
- `trigger`: `triggerType`, `triggerDescription`, `triggerConfig` (keywords, intent text, etc).
- `detect_intent`: `intentSettings` (model, temperature, reasoningEffort) passed to intent detection.
- `send_message`: `text`/`message`, `buttons`, `tags`.
- `ai_reply`: `aiSettings`, `knowledgeItemIds` (optional RAG pinning).
- `ai_agent`: `agentSystemPrompt`, `agentSteps[]`, `agentEndCondition`, `agentStopCondition`, `agentMaxQuestions`,
  `agentSlots[]` (key/question/defaultValue), plus `aiSettings` + `knowledgeItemIds`.
- `handoff`: `handoff` object with `topic`, `summary`, `recommendedNextAction`, `message`.

Graph-level defaults:
- `aiSettings`: default AI settings applied before per-node overrides.
- `rateLimit`: rate limit applied per step unless overridden by node-level `rateLimit`.

## Trigger Handling (Important)

The trigger definition is derived from the **start node**:

- When saving/publishing a draft, `triggers` are built from the start node if its type is `trigger`.
- If the start node is not a `trigger`, `triggers` is stored as an empty array.
- This is intentional: no start trigger means the template will not match any inbound trigger at runtime.

Trigger fields live on the trigger node itself:
- `triggerType` (default `dm_message`)
- `triggerDescription` (optional override)
- The node label is used for trigger label if it is not just "Trigger"
- `triggerConfig` is mapped into `FlowTriggerDefinition.config` for runtime matching

Trigger types:
- `post_comment`
- `story_reply`
- `dm_message`
- `story_share`
- `instagram_ads`
- `live_comment`
- `ref_url`

Trigger config supports:
- keyword filters (`keywords`, `excludeKeywords`, `keywordMatch`)
- mode (`triggerMode`: `keywords`, `categories`, `any`, `intent`)
- intent matcher (`intentText`)
- extra filters (business hours, categories, link/attachment) via DSL only for now

Current UI does not expose advanced trigger config (filter JSON). If needed, add UI + persist into the trigger definition.

## Exposed Fields + Template Variables

`exposedFields` let end users configure parts of the graph at instance setup time.

- Each field has a `source` describing where it applies: `source.nodeId` (optional) + `source.path`.
- `source.path` can target `graph.*` or `triggers.*` (e.g. `triggers[0].description`).
- Runtime applies user config defaults, then patches the compiled graph/triggers before execution.

Template variables:
- Graph values are interpolated with `{{ key }}` tokens using user config before execution.
- Runtime variables live under `vars.*` (ex: `{{ vars.detectedIntent }}`) and are resolved per message.
- AI agent nodes also populate `vars.agentStepIndex`, `vars.agentStep`, `vars.agentDone`, `vars.agentStepSummary`,
  `vars.agentSlots`, `vars.agentMissingSlots`, and `vars.agentQuestionsAsked`.

## Compilation + Publish

Publish flow lives in `backend/src/routes/admin.ts`.

1) Admin publishes a draft (`POST /admin/flow-drafts/:draftId/publish`)
2) The DSL snapshot is compiled:
   - `backend/src/services/flowCompiler.ts`
   - Compiler output contains `compiler` metadata, `compiledAt`, a normalized `graph`, and `warnings`.
   - `dsl.nodes` is the primary source; `dsl.steps` is accepted but marked deprecated (warning).
   - Nodes are normalized and validated (id, type, text/message for `send_message`).
   - `next` pointers are preserved if present on nodes (either `node.next` or `node.data.next`).
   - Optional node fields are normalized (`buttons`, `tags`, `aiSettings`, `intentSettings`,
     `knowledgeItemIds`, `waitForReply`, `handoff`, `rateLimit`, `logEnabled`).
   - Edges are normalized to `{ from, to }` and validated against existing node ids.
   - `startNodeId` is resolved from `dsl.startNodeId` (or `dsl.start`). If missing/invalid, the compiler falls back to the first node and emits a warning.
   - Graph-level defaults (`dsl.aiSettings`, `dsl.rateLimit`) are copied into the compiled graph.
   - Invalid DSL or missing required structure throws a `FlowCompilerError` with `errors` and `warnings`.
3) A new `FlowTemplateVersion` is created and marked published.
4) `FlowTemplate.currentVersionId` is updated to the new version.

The builder also supports:
- Create draft: `POST /admin/flow-drafts`
- Update draft: `PUT /admin/flow-drafts/:draftId`
- List templates + versions: `/admin/flow-templates`

## Runtime Execution

Runtime entry lives in `backend/src/services/automationService.ts`.

Key points:
- Runtime loads `version.compiled.graph` (or the compiled object if no `graph` key).
- Exposed fields patch the graph/triggers, then config + vars are interpolated into the graph.
- Flow steps are executed against the compiled graph using the node types above.
- Runtime builds a shared AI context per execution run (message history + summary) and reuses it across AI nodes.
- `detect_intent` stores the output in `session.state.vars.detectedIntent`.
- `detect_intent` runs intent detection against the global AutomationIntent list and stores the output in `session.state.vars.detectedIntent`.
- `ai_agent` runs a multi-turn agent loop using its own system prompt, steps, end condition, and stop condition. It persists
  progress + slot values in session state and keeps the node active until the end condition or stop condition is met (or max questions is reached).
- `trigger` nodes are ignored at execution (they only define entry criteria).
- State persists via `buildNextState` and `AutomationSession`.
- Node-level logging is supported via `logEnabled` on each node. If `logEnabled` is explicitly `false`, node start/complete logging is suppressed; otherwise logs are emitted.
- `waitForReply` stops the current run and stores the next node pointer in session state.
- `ai_reply` merges `graph.aiSettings` with node `aiSettings`, supports `knowledgeItemIds`, and respects `rateLimit`.
- `send_message` supports buttons/tags, and templates can reference `{{ vars.* }}`.

### AI Context (History + Summary)

Automation runs create a shared AI context for the full execution:
- Message history and summaries are built once per run and reused by `ai_reply` and `ai_agent` nodes.
- Node-level `messageHistory` is no longer used; AI nodes consume the shared context instead.
- History window size and summary expiry are configurable via automation config:
  - `aiHistoryWindow` (default: 10, min: 1, max: 50)
  - `aiSummaryExpiryHours` (default: 48, min: 0, max: 168; set to 0 to disable summary usage)
- Conversation-level summaries are persisted on `Conversation.aiSummary` with `aiSummaryUpdatedAt` for audit use.
- Preview runs reuse history but do not persist summary updates.

### Always Use Latest Published Version

The system always resolves the latest published version:
- `automationService.ts` resolves `FlowTemplate.currentVersionId` for runtime sessions.
- `backend/src/routes/automation-instances.ts` hydrates instances with latest versions.
- Instances created or updated are forced to the current version (even if a version was passed).

This ensures all users see and run the latest published template version.

## User-Facing Template Setup

User-facing creation/config lives in:
- `frontend/src/pages/automations/AutomationsCreateView.tsx`

Notes:
- The setup UI reads `template.currentVersion` and shows trigger info.
- `exposedFields` define which config fields are editable by the user.
- `display` metadata (goal, industry, setup time, etc.) is shown in the gallery/details.

## Admin Flow Builder (UI)

Implemented in:
- `sf-admin-console/src/pages/AutomationTemplates.tsx`

Key UI behaviors:
- React Flow canvas with dot grid background.
- Node palette with FAB (top-right).
- Inspector panel on the left, stacked with the start-node summary and DSL panel.
- Trigger node supports `triggerType` + `triggerDescription` editing.
- Trigger node supports keyword/intent filters (`triggerConfig`) in the inspector.
- Inspector includes per-node logging toggle (`logEnabled`) and wait-for-reply control.
- Message nodes can add buttons + tags; AI Reply nodes can edit model settings, reasoning effort,
  and knowledge item ids.
- Detect intent nodes can override model, temperature, reasoning effort.
- AI agent nodes include their own system prompt, step list, end condition, stop condition, max questions, and the same AI
  settings/knowledge base controls as AI Reply. Slots allow the agent to collect named fields with optional defaults.
- Handoff nodes capture topic/summary/message for the escalation ticket.
- Adding a trigger node auto-promotes it to the start node if the current start is not a trigger.
- Router rules can use the detected intent and now pull options from the persisted automation-intents list.
- Automations now have a sub-navigation: Flows (builder) and Intentions (global intent list).

## Automation Intentions (Global)

Intentions are global intent labels used by the detect-intent step and router logic. They are stored in Mongo
and seeded with the default list on first access.

Admin endpoints (auth + admin):
- `GET /admin/automation-intents` (list; seeds defaults on first access)
- `POST /admin/automation-intents` (create)
- `PUT /admin/automation-intents/:id` (update)
- `DELETE /admin/automation-intents/:id` (delete)

Notes:
- Updating or deleting an intent value can break existing flow routing rules that reference it.
- The router UI uses these values when building conditions like "Detected intent equals ...".

## Operational Notes / Gotchas

- If the start node is not a trigger, the template won’t match any inbound trigger.
- Drafts keep the raw DSL; versions are immutable once published.
- Trigger info shown to end users comes from the current version’s `triggers`.
- Compiler validates and normalizes DSL; warnings are stored on the compiled artifact and errors block publish.
- `waitForReply` does not pause the session status; it stores the next pointer so the next inbound message resumes the flow.

## Extending the System

When adding new node types:
- Update the Flow builder UI and node library.
- Update runtime execution in `automationService.ts`.
- Update DSL normalization if the node carries new properties.

When adding trigger config filters:
- Extend trigger node schema to capture config JSON.
- Serialize into `triggers` during save/publish.
- Update `matchesTriggerConfig` logic if needed.
