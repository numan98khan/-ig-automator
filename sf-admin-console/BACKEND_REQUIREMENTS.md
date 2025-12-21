# Backend Requirements for SendFx Admin Console

## Overview
The SendFx Admin Console requires a backend API with admin-only endpoints that provide "god eye view" access to ALL data across the platform, regardless of user membership.

## Authentication

### Admin Token
- The admin console sends requests with: `Authorization: Bearer <admin_token>`
- Token is stored in `localStorage.getItem('admin_token')`
- Backend must validate this token and check if user has admin role

### Admin Role Checking
```javascript
// Example middleware
const isAdmin = async (req, res, next) => {
  const user = req.user; // Set by your auth middleware

  // Check admin role (adjust based on your schema)
  if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {
    return res.status(403).json({
      error: 'Admin access required',
      message: 'Only administrators can access this endpoint'
    });
  }

  next();
};
```

## Required Endpoints

### 1. Dashboard & Analytics

#### GET `/api/admin/dashboard/stats`
**Purpose:** Get platform-wide statistics for the dashboard

**Required Response:**
```json
{
  "data": {
    "totalWorkspaces": 0,
    "totalUsers": 0,
    "conversations24h": 0,
    "activeEscalations": 0,
    "aiResponseRate": 0,
    "avgResponseTime": "0s",
    "messages24h": 0,
    "successRate": 0,
    "recentEscalations": [],
    "topWorkspaces": []
  }
}
```

#### GET `/api/admin/system/metrics`
**Purpose:** Get system performance metrics

**Required Response:**
```json
{
  "data": {
    "uptime": "99.9%",
    "cpuUsage": 45,
    "memoryUsage": 60
  }
}
```

#### GET `/api/admin/analytics?range=30d`
**Purpose:** Get analytics data for specified time range

---

### 2. Workspaces

#### GET `/api/admin/workspaces?page=1&limit=20&search=`
**Purpose:** Get ALL workspaces (not filtered by user membership)

**Query Parameters:**
- `page` (optional): Page number for pagination
- `limit` (optional): Items per page
- `search` (optional): Search query for workspace name

**Required Response:**
```json
{
  "data": {
    "workspaces": [
      {
        "_id": "workspace_id",
        "name": "Workspace Name",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "isActive": true,
        "memberCount": 5,
        "conversationCount": 100,
        "todayActivity": 50
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalItems": 100
    }
  }
}
```

**IMPORTANT:**
- Do NOT filter by `req.user` membership
- Return ALL workspaces in the database
- Admin should see everything

#### GET `/api/admin/workspaces/:id`
**Purpose:** Get detailed workspace information

**Required Response:**
```json
{
  "data": {
    "_id": "workspace_id",
    "name": "Workspace Name",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "isActive": true,
    "memberCount": 5,
    "conversationCount": 100,
    "todayActivity": 50,
    "responseRate": 95,
    "instagramUsername": "username",
    "description": "Description"
  }
}
```

#### GET `/api/admin/workspaces/:id/members`
**Purpose:** Get workspace members

**Required Response:**
```json
{
  "data": {
    "members": [
      {
        "_id": "member_id",
        "userId": {
          "_id": "user_id",
          "name": "User Name",
          "email": "user@example.com"
        },
        "role": "admin",
        "joinedAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

#### GET `/api/admin/workspaces/:id/categories`
**Purpose:** Get automation categories for workspace

**Required Response:**
```json
{
  "data": {
    "categories": [
      {
        "_id": "category_id",
        "nameEn": "General Support",
        "descriptionEn": "General questions and support",
        "aiPolicy": "full_auto",
        "autoReplyEnabled": true,
        "isSystem": false,
        "messageCount": 150,
        "exampleMessages": ["How do I...?", "What is...?"],
        "escalationNote": "Escalate if..."
      }
    ]
  }
}
```

---

### 3. Users

#### GET `/api/admin/users?page=1&limit=20&search=`
**Purpose:** Get ALL users on the platform

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Items per page
- `search` (optional): Search by name or email

**Required Response:**
```json
{
  "data": {
    "users": [
      {
        "_id": "user_id",
        "name": "User Name",
        "email": "user@example.com",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "workspaceCount": 3,
        "workspaces": [
          {
            "_id": "workspace_id",
            "name": "Workspace Name",
            "role": "admin"
          }
        ]
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalItems": 100
    }
  }
}
```

**IMPORTANT:**
- Include `workspaces` array with user's workspace memberships
- Include `role` for each workspace (admin, owner, member)
- This is needed for the workspace details display feature

#### GET `/api/admin/users/:id`
**Purpose:** Get detailed user information

---

### 4. Conversations

#### GET `/api/admin/conversations?page=1&limit=20&workspaceId=&status=`
**Purpose:** Get ALL conversations across ALL workspaces

**Query Parameters:**
- `page` (optional): Page number
- `limit` (optional): Items per page
- `workspaceId` (optional): Filter by workspace
- `status` (optional): Filter by status (active, resolved, escalated)

**Required Response:**
```json
{
  "data": {
    "conversations": [
      {
        "_id": "conversation_id",
        "workspaceId": "workspace_id",
        "workspaceName": "Workspace Name",
        "participantName": "Customer Name",
        "participantUsername": "instagram_username",
        "status": "active",
        "messageCount": 5,
        "hasEscalation": false,
        "categoryName": "General Support",
        "lastMessage": {
          "content": "Last message text",
          "createdAt": "2024-01-01T00:00:00.000Z"
        },
        "updatedAt": "2024-01-01T00:00:00.000Z",
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 10,
      "totalItems": 200
    }
  }
}
```

#### GET `/api/admin/conversations/:id`
**Purpose:** Get detailed conversation with messages

---

### 5. Escalations

#### GET `/api/admin/escalations?page=1&limit=20&status=&severity=`
**Purpose:** Get ALL escalations across all workspaces

**Query Parameters:**
- `page`, `limit`: Pagination
- `status`: Filter by status (open, resolved, closed)
- `severity`: Filter by severity (low, medium, high, critical)

**Required Response:**
```json
{
  "data": {
    "escalations": [
      {
        "_id": "escalation_id",
        "conversationId": "conversation_id",
        "workspaceId": "workspace_id",
        "workspaceName": "Workspace Name",
        "severity": "high",
        "status": "open",
        "reason": "Customer complaint",
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 2,
      "totalItems": 30
    }
  }
}
```

---

### 6. System Health

#### GET `/api/admin/health`
**Purpose:** Get system health status

**Required Response:**
```json
{
  "data": {
    "status": "healthy",
    "uptime": "15 days",
    "services": {
      "database": "connected",
      "instagram": "connected",
      "openai": "connected"
    }
  }
}
```

#### GET `/api/admin/system/database`
**Purpose:** Get database statistics

**Required Response:**
```json
{
  "data": {
    "size": "2.5 GB",
    "collections": {
      "workspaces": 50,
      "users": 200,
      "conversations": 1500,
      "messages": 15000
    }
  }
}
```

#### GET `/api/admin/system/connections`
**Purpose:** Get active connections/sessions

---

### 7. Global AI Assistant Configuration

**IMPORTANT:** The SendFx Assistant is a public, global assistant accessible to everyone. It does NOT have access to workspace-specific or user-specific data. It only provides general information about SendFx products, pricing, and features.

#### GET `/api/admin/assistant/config`
**Purpose:** Get global AI assistant configuration (public assistant)

**Required Response:**
```json
{
  "data": {
    "systemPrompt": "You are a helpful assistant...",
    "assistantName": "SendFx Assistant",
    "assistantDescription": "Ask about product, pricing, or guardrails"
  }
}
```

#### PUT `/api/admin/assistant/config`
**Purpose:** Update global AI assistant configuration

**Request Body:**
```json
{
  "systemPrompt": "You are a helpful assistant...",
  "assistantName": "SendFx Assistant",
  "assistantDescription": "Ask about product, pricing, or guardrails"
}
```

**Required Response:**
```json
{
  "data": {
    "success": true,
    "message": "Configuration updated"
  }
}
```

**IMPORTANT:**
- This configuration applies to the public assistant only
- The assistant has NO access to workspace or user data
- All knowledge items should be public information

---

### 8. Global Knowledge Base Management

**IMPORTANT:** Knowledge base is for the public assistant only. All knowledge items should contain public information about SendFx.

#### GET `/api/admin/knowledge`
**Purpose:** Get all global knowledge items for public assistant

**Required Response:**
```json
{
  "data": [
    {
      "_id": "knowledge_id",
      "title": "How to use feature X",
      "content": "Detailed content...",
      "storageMode": "vector",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### POST `/api/admin/knowledge`
**Purpose:** Create new global knowledge item

**Request Body:**
```json
{
  "title": "Article Title",
  "content": "Article content...",
  "storageMode": "vector"
}
```

**Notes:**
- No `workspaceId` - this is for the global public assistant
- Content should be public information only

#### PUT `/api/admin/knowledge/:id`
**Purpose:** Update global knowledge item

**Request Body:**
```json
{
  "title": "Updated Title",
  "content": "Updated content...",
  "storageMode": "text"
}
```

#### DELETE `/api/admin/knowledge/:id`
**Purpose:** Delete global knowledge item

#### POST `/api/admin/knowledge/reindex-vector`
**Purpose:** Re-embed all vector-based knowledge items for the global public assistant

---

## Common Patterns

### Error Responses
All endpoints should return proper error responses:

```json
{
  "error": "Error type",
  "message": "Detailed error message"
}
```

**Status Codes:**
- `200` - Success
- `400` - Bad request
- `401` - Unauthorized (no token)
- `403` - Forbidden (not admin)
- `404` - Not found
- `500` - Server error

### Pagination
Consistent pagination format:
```json
{
  "pagination": {
    "currentPage": 1,
    "totalPages": 10,
    "totalItems": 200,
    "itemsPerPage": 20
  }
}
```

### Response Wrapping
All successful responses wrap data in a `data` field:
```json
{
  "data": { /* response data */ }
}
```

---

## Security Considerations

1. **Admin Authentication**
   - ALL `/api/admin/*` endpoints must check for admin role
   - Reject requests from non-admin users with `403 Forbidden`

2. **Token Validation**
   - Validate JWT token on every request
   - Check token expiration
   - Verify admin role in token payload

3. **Input Validation**
   - Validate all query parameters
   - Sanitize search inputs to prevent NoSQL injection
   - Validate pagination limits (max 100 items per page)

4. **Rate Limiting**
   - Implement rate limiting on admin endpoints
   - Prevent abuse even from admin users

---

## Testing Your Backend

1. **Check Admin Role:**
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
        http://localhost:5000/api/admin/workspaces
   ```
   Should return ALL workspaces, not filtered by user membership

2. **Check Response Format:**
   Verify response matches the required format above

3. **Check Permissions:**
   Try accessing with non-admin token - should return 403

---

## Migration Checklist

- [ ] Create admin role/permission system
- [ ] Implement `isAdmin` middleware
- [ ] Create `/api/admin/*` routes separate from `/api/*` routes
- [ ] Update User model to include `role` field
- [ ] Update Workspace queries to NOT filter by user (for admin endpoints)
- [ ] Add admin token to login response
- [ ] Test all endpoints with admin token
- [ ] Add proper error handling
- [ ] Add request logging for admin actions
- [ ] Document admin API in your backend README

---

## Environment Variables

Your backend should support:
```env
# Admin
ADMIN_SECRET_KEY=your-admin-secret-key

# OpenAI (for AI Assistant)
OPENAI_API_KEY=your-openai-key
OPENAI_EMBEDDINGS_MODEL=text-embedding-3-small

# PostgreSQL (for RAG/pgvector)
POSTGRES_URL=postgresql://user:pass@host:5432/db
PGVECTOR_URL=postgresql://user:pass@host:5432/db
PGSSL=false

# MongoDB
MONGODB_URL=mongodb://...
```
