# Internal Flow Builder + Template Architecture

This document describes how the internal flow builder drives user-facing templates and runtime execution. It is intended for future developers working on the admin builder, publish pipeline, or automation runtime.

## Overview

- Admins author drafts in a visual builder (React Flow) stored as a DSL (nodes + edges).
- Publishing compiles the DSL into a template version (immutable) and marks it as the latest.
- End users only see templates (and their latest published version) and create instances with per-user config.
- Runtime executes only compiled artifacts and uses triggers defined by the start trigger node.

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
      "triggerDescription": "User sends a message"
    },
    {
      "id": "node-2",
      "type": "send_message",
      "position": { "x": 320, "y": 80 },
      "data": { "label": "Message" },
      "text": "Hello!"
    }
  ],
  "edges": [
    { "id": "edge-1", "source": "node-1", "target": "node-2", "type": "smoothstep" }
  ],
  "startNodeId": "node-1"
}
```

Supported node types:
- `trigger`
- `detect_intent`
- `send_message`
- `ai_reply`
- `handoff`

## Trigger Handling (Important)

The trigger definition is derived from the **start node**:

- When saving/publishing a draft, `triggers` are built from the start node if its type is `trigger`.
- If the start node is not a `trigger`, `triggers` is stored as an empty array.
- This is intentional: no start trigger means the template will not match any inbound trigger at runtime.

Trigger fields live on the trigger node itself:
- `triggerType` (default `dm_message`)
- `triggerDescription` (optional override)
- The node label is used for trigger label if it is not just "Trigger"

Current UI does not expose advanced trigger config (filter JSON). If needed, add UI + persist into the trigger definition.

## Compilation + Publish

Publish flow lives in `backend/src/routes/admin.ts`.

1) Admin publishes a draft (`POST /admin/flow-drafts/:draftId/publish`)
2) The DSL snapshot is compiled:
   - `backend/src/services/flowCompiler.ts`
   - Currently a pass-through compiler: `{ graph: dsl }`
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
- Flow steps are executed against the compiled graph using the node types above.
- `detect_intent` stores the output in `session.state.vars.detectedIntent`.
- `trigger` nodes are ignored at execution (they only define entry criteria).
- State persists via `buildNextState` and `AutomationSession`.

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
- Adding a trigger node auto-promotes it to the start node if the current start is not a trigger.

## Operational Notes / Gotchas

- If the start node is not a trigger, the template won’t match any inbound trigger.
- Drafts keep the raw DSL; versions are immutable once published.
- Trigger info shown to end users comes from the current version’s `triggers`.
- Compiler currently does not optimize; it simply stores the DSL as `compiled.graph`.

## Extending the System

When adding new node types:
- Update the Flow builder UI and node library.
- Update runtime execution in `automationService.ts`.
- Update DSL normalization if the node carries new properties.

When adding trigger config filters:
- Extend trigger node schema to capture config JSON.
- Serialize into `triggers` during save/publish.
- Update `matchesTriggerConfig` logic if needed.

