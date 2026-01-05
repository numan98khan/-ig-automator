# Frontend Optimizations (Data Loading + UX)

This file documents the optimizations implemented to make navigation smoother and avoid full-page loading states when revisiting screens.

## Goals
- Avoid blocking loaders on repeat visits.
- Keep previously loaded data visible while refreshing in the background.
- Reduce unnecessary re-fetching and re-rendering.

## Implemented Changes

### Stale-While-Revalidate Caching (In-Memory)
- **Knowledge**
  - Added a workspace-level cache and hydrated the list immediately on revisit.
  - Fetch now runs silently in the background when cached data exists.
  - Cached list is updated on create, update, delete, and active toggle.
  - File: `frontend/src/pages/Knowledge.tsx`
- **Automations**
  - Added workspace-level cache for automations and a global cache for templates.
  - Hydrates list immediately on revisit and refreshes in the background.
  - Cached list is updated on create, update, delete, and toggle.
  - File: `frontend/src/pages/Automations.tsx`
- **Inbox**
  - Added cache keyed by workspace + account that stores conversations, selected conversation, messages per conversation, IG accounts, and tier.
  - Hydrates on mount and silently refreshes data in the background.
  - Cached messages/conversations are updated on message send and periodic refresh.
  - File: `frontend/src/pages/Inbox.tsx`

### Avoid Full Reloads After Mutations
- **Knowledge**
  - Create/update now upserts local state instead of re-fetching the full list.
  - File: `frontend/src/pages/Knowledge.tsx`
- **Automations**
  - Create/update/toggle/delete now update local state instead of `loadData()` full refresh.
  - File: `frontend/src/pages/Automations.tsx`

### Reduced Re-Render Work
- **Knowledge**
  - Memoized category lookups and filtered lists to avoid repeated regex scanning and filtering on every render.
  - File: `frontend/src/pages/Knowledge.tsx`
- **Automation Details Preview**
  - Removed a duplicate messages update after creating a preview session.
  - Prevented an immediate extra refresh call when session state already matches.
  - File: `frontend/src/pages/automations/AutomationDetailsView.tsx`

## Result
- Top bar navigation shows content immediately on 2nd/3rd visits.
- Data refreshes in the background without blocking the UI.
- Fewer full-screen loaders and fewer redundant renders.
