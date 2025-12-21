import { Routes, Route } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Workspaces from './pages/Workspaces'
import WorkspaceDetail from './pages/WorkspaceDetail'
import Conversations from './pages/Conversations'
import ConversationDetail from './pages/ConversationDetail'
import Users from './pages/Users'
import Analytics from './pages/Analytics'
import AIAssistantConfig from './pages/AIAssistantConfig'
import AdminDebug from './pages/AdminDebug'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/workspaces" element={<Workspaces />} />
                <Route path="/workspaces/:id" element={<WorkspaceDetail />} />
                <Route path="/conversations" element={<Conversations />} />
                <Route path="/conversations/:id" element={<ConversationDetail />} />
                <Route path="/users" element={<Users />} />
                <Route path="/ai-assistant" element={<AIAssistantConfig />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/debug" element={<AdminDebug />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

export default App
