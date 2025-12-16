import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Inbox from './pages/Inbox';
import Knowledge from './pages/Knowledge';
import Settings from './pages/Settings';
import Categories from './pages/Categories';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Escalations from './pages/Escalations';
import VerifyEmail from './pages/VerifyEmail';
import AcceptInvite from './pages/AcceptInvite';
import RequestPasswordReset from './pages/RequestPasswordReset';
import ResetPassword from './pages/ResetPassword';
import Sandbox from './pages/Sandbox';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/landing" element={<Landing />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/accept-invite" element={<AcceptInvite />} />
          <Route path="/request-password-reset" element={<RequestPasswordReset />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/"
            element={
              <PrivateRoute requireWorkspace requireInstagram>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route index element={<Navigate to="/inbox" replace />} />
            {/* <Route index element={<Navigate to="/categories" replace />} /> */}
            <Route path="inbox" element={<Inbox />} />
            <Route path="knowledge" element={<Knowledge />} />
            <Route path="sandbox" element={<Sandbox />} />
            <Route path="settings" element={<Settings />} />
            <Route path="categories" element={<Categories />} />
            <Route path="escalations" element={<Escalations />} />
          </Route>
          <Route path="*" element={<Navigate to="/landing" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
