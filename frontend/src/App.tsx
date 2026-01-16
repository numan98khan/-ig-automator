import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout';
import Inbox from './pages/Inbox';
import Settings from './pages/Settings';
import VerifyEmail from './pages/VerifyEmail';
import AcceptInvite from './pages/AcceptInvite';
import RequestPasswordReset from './pages/RequestPasswordReset';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import { AccountProvider } from './context/AccountContext';
import Support from './pages/Support';
import Automations from './pages/Automations';
import CRM from './pages/CRM';
import Home from './pages/Home';
import Auth from './pages/Auth';
import AppEntry from './components/AppEntry';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppEntry />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/signup" element={<Auth />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/accept-invite" element={<AcceptInvite />} />
          <Route path="/request-password-reset" element={<RequestPasswordReset />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/app"
            element={
              <PrivateRoute requireWorkspace>
                <AccountProvider>
                  <Layout />
                </AccountProvider>
              </PrivateRoute>
            }
          >
            <Route index element={<Navigate to="/app/home" replace />} />
            <Route path="home" element={<Home />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="analytics" element={<Dashboard />} />
            <Route path="knowledge" element={<Navigate to="/app/automations?section=knowledge" replace />} />
            <Route path="settings" element={<Settings />} />
            <Route path="automations" element={<Automations />} />
            <Route path="crm" element={<CRM />} />
            <Route path="support" element={<Support />} />
            <Route path="alerts" element={<Navigate to="/app/automations?section=alerts" replace />} />
            <Route path="escalations" element={<Navigate to="/app/automations?section=alerts" replace />} />
            <Route path="team" element={<Navigate to="/app/settings?tab=team" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
