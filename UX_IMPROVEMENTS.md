# UX Improvements Summary

This branch includes user-facing experience enhancements intended to make onboarding and automation setup clearer and faster:

## Home + Onboarding
- Added a dedicated Home page with an onboarding checklist and next-step calls to action.
- Highlighted live automation status and quick entry points into key flows.
- Added a workspace mode toggle in onboarding (Demo vs Live) to set expectations during setup.

## Business Profile
- Extended workspace settings to capture business basics that improve automation context.
- Added a Business Profile view for editing and saving that metadata.

## Automations Navigation
- Added deep-link support for templates and live automations (query params like `templateId`, `automationId`, `mode`, and `filter`).
- Introduced an initial status filter for automations lists to pre-select views.
- Updated automation creation CTA to "Finish" to reduce confusion around activation.

## Demo Mode
- Added a demo mode hook to enable tailored onboarding/demo experiences.
- Persisted demo mode per workspace and surfaced controls on Home and Settings.
- When demo mode is enabled, webhook events still log messages but automations do not execute.
- Suppressed "published/live" counts while in demo mode to avoid implying production activation.

## Auth + Workspace Defaults
- Ensured email signup/login auto-creates a default workspace and membership to avoid 404s on `/api/auth/me`.

## Account Management UX
- Added a Settings “Danger Zone” delete-account flow with confirmation and logout/redirect.
