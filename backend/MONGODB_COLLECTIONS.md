# MongoDB Collections (Mongoose Models)

Scope: `backend/src/models`. Usage status is based on references in `backend/src` (routes, services,
utils). Collection names follow Mongoose's default pluralization of the model name unless configured.

## Collections

- **AdminLogEvent**
  - Status: used
  - Purpose: short-lived admin/system log events (category, level, message, details). TTL expires after 24h.
  - Used by: `backend/src/services/adminLogEventService.ts`

- **AdminLogSettings**
  - Status: used
  - Purpose: global toggles for log categories (AI timing/logs, automation logs, IG webhook logs, etc).
  - Used by: `backend/src/services/adminLogSettingsService.ts`

- **AutomationInstance**
  - Status: used
  - Purpose: workspace-level automation configuration tied to a template/version plus stats.
  - Used by: `backend/src/routes/automation-instances.ts`, `backend/src/routes/conversations.ts`,
    `backend/src/routes/admin.ts`, `backend/src/routes/crm.ts`, `backend/src/services/automationService.ts`

- **AutomationIntent**
  - Status: used
  - Purpose: list of intent labels/descriptions used for intent matching.
  - Used by: `backend/src/services/automationIntentService.ts`, `backend/src/routes/admin.ts`

- **AutomationSession**
  - Status: used
  - Purpose: per-conversation automation runtime state (step index, node state, status, rate limit).
  - Used by: `backend/src/routes/automation-instances.ts`, `backend/src/routes/conversations.ts`,
    `backend/src/routes/messages.ts`, `backend/src/routes/instagram-sync.ts`, `backend/src/routes/admin.ts`,
    `backend/src/routes/crm.ts`, `backend/src/services/automationService.ts`

- **CommentDMLog**
  - Status: used
  - Purpose: comment-to-DM automation audit log (status, DM text, errors).
  - Used by: `backend/src/routes/settings.ts` (dynamic import for stats)

- **Contact**
  - Status: used
  - Purpose: canonical CRM contact entity (name/handle, tags, stage, owner, profile picture).
  - Used by: `backend/src/routes/crm.ts`, `backend/src/routes/instagram-sync.ts`,
    `backend/src/routes/instagram-webhook.ts`

- **ContactNote**
  - Status: used
  - Purpose: notes attached to a contact (optionally tied to a conversation).
  - Used by: `backend/src/routes/crm.ts`

- **Conversation**
  - Status: used
  - Purpose: per-platform conversation/thread; links to contact; stores last message metadata and automation state.
  - Used by: `backend/src/routes/conversations.ts`, `backend/src/routes/messages.ts`,
    `backend/src/routes/instagram-sync.ts`, `backend/src/routes/instagram-webhook.ts`,
    `backend/src/routes/admin.ts`, `backend/src/routes/dashboard.ts`, `backend/src/routes/crm.ts`,
    `backend/src/routes/escalations.ts`, `backend/src/routes/automation-instances.ts`,
    `backend/src/services/automationService.ts`, `backend/src/services/aiReplyService.ts`,
    `backend/src/services/aiAgentService.ts`, `backend/src/services/reportingService.ts`,
    `backend/src/services/escalationService.ts`

- **CrmTask**
  - Status: used
  - Purpose: CRM tasks (follow-ups/general) tied to contacts (and optionally conversations).
  - Used by: `backend/src/routes/crm.ts`

- **Escalation**
  - Status: used
  - Purpose: human escalation tickets for conversations with status and update history.
  - Used by: `backend/src/routes/escalations.ts`, `backend/src/routes/conversations.ts`,
    `backend/src/routes/admin.ts`, `backend/src/routes/dashboard.ts`,
    `backend/src/services/escalationService.ts`, `backend/src/services/reportingService.ts`

- **FlowDraft**
  - Status: used
  - Purpose: draft automation flows (DSL, triggers, exposed fields, display metadata).
  - Used by: `backend/src/routes/admin.ts`

- **FlowTemplate**
  - Status: used
  - Purpose: top-level automation template (name/description, current version pointer).
  - Used by: `backend/src/routes/flow-templates.ts`, `backend/src/routes/automation-instances.ts`,
    `backend/src/routes/conversations.ts`, `backend/src/routes/admin.ts`, `backend/src/routes/crm.ts`,
    `backend/src/services/automationService.ts`

- **FlowTemplateVersion**
  - Status: used
  - Purpose: published/archived compiled template versions, including DSL snapshot.
  - Used by: `backend/src/routes/flow-templates.ts`, `backend/src/routes/automation-instances.ts`,
    `backend/src/routes/conversations.ts`, `backend/src/routes/admin.ts`,
    `backend/src/services/automationService.ts`

- **FollowupTask**
  - Status: used
  - Purpose: scheduled follow-up tasks for 24h messaging window behavior.
  - Used by: `backend/src/services/automationService.ts`, `backend/src/routes/settings.ts` (dynamic import stats)

- **GlobalAssistantConfig**
  - Status: used
  - Purpose: admin-configured global assistant prompt metadata.
  - Used by: `backend/src/routes/admin.ts`

- **GlobalUiSettings**
  - Status: used
  - Purpose: global UI theming configuration.
  - Used by: `backend/src/routes/admin.ts`, `backend/src/routes/ui-settings.ts`

- **InstagramAccount**
  - Status: used
  - Purpose: connected IG account metadata + access tokens (including page access token).
  - Used by: `backend/src/routes/instagram-oauth.ts`, `backend/src/routes/instagram.ts`,
    `backend/src/routes/instagram-sync.ts`, `backend/src/routes/instagram-webhook.ts`,
    `backend/src/routes/instagram-debug.ts`, `backend/src/routes/messages.ts`,
    `backend/src/routes/automation-instances.ts`, `backend/src/routes/conversations.ts`,
    `backend/src/routes/tiers.ts`, `backend/src/services/automationService.ts`

- **KnowledgeItem**
  - Status: used
  - Purpose: knowledge base articles (vector or text, active flag).
  - Used by: `backend/src/routes/knowledge.ts`, `backend/src/routes/admin.ts`,
    `backend/src/routes/tiers.ts`, `backend/src/services/aiReplyService.ts`,
    `backend/src/services/aiAgentService.ts`, `backend/src/services/vectorStore.ts`

- **LeadCapture**
  - Status: used
  - Purpose: goal-driven lead capture details (name/phone/email).
  - Used by: `backend/src/services/reportingService.ts` (analytics)

- **Message**
  - Status: used
  - Purpose: individual messages in conversations (attachments, AI metadata, receipts).
  - Used by: `backend/src/routes/messages.ts`, `backend/src/routes/conversations.ts`,
    `backend/src/routes/instagram-sync.ts`, `backend/src/routes/instagram-webhook.ts`,
    `backend/src/routes/admin.ts`, `backend/src/routes/dashboard.ts`, `backend/src/routes/crm.ts`,
    `backend/src/routes/escalations.ts`, `backend/src/routes/automation-instances.ts`,
    `backend/src/services/automationService.ts`, `backend/src/services/aiReplyService.ts`,
    `backend/src/services/aiAgentService.ts`, `backend/src/services/reportingService.ts`

- **ReportDailyWorkspace**
  - Status: used
  - Purpose: daily aggregated metrics for dashboards (messages, escalations, goal counts).
  - Used by: `backend/src/routes/dashboard.ts`, `backend/src/services/reportingService.ts`

- **SupportTicket**
  - Status: used
  - Purpose: internal support ticket system (bug/feature/support/billing).
  - Used by: `backend/src/routes/supportTickets.ts`

- **SupportTicketComment**
  - Status: used
  - Purpose: comments/updates on support tickets.
  - Used by: `backend/src/routes/supportTickets.ts`

- **SupportTicketStub**
  - Status: used
  - Purpose: placeholder capture for support goal flow (order ID/photo/summary).
  - Used by: `backend/src/services/reportingService.ts` (analytics)

- **WorkspaceInvite**
  - Status: used
  - Purpose: workspace membership invitations (token, role, expiry).
  - Used by: `backend/src/routes/workspace-invites.ts`, `backend/src/routes/tiers.ts`

- **WorkspaceSettings**
  - Status: used
  - Purpose: per-workspace assistant and automation settings (prompts, goals, followups, etc).
  - Used by: `backend/src/routes/settings.ts`, `backend/src/routes/messages.ts`,
    `backend/src/routes/integrations.ts`, `backend/src/routes/admin.ts`,
    `backend/src/services/aiReplyService.ts`, `backend/src/services/workspaceSettingsService.ts`

## Unused collections

No unused Mongoose models were found in `backend/src` based on static references. If you remove
models, double-check external scripts/jobs or migrations that might reference them outside `backend/src`.
