import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Inbox from './pages/Inbox';
import Knowledge from './pages/Knowledge';
import Automations from './pages/Automations';
import Categories from './pages/Categories';
import PrivacyPolicy from './pages/PrivacyPolicy';
import Escalations from './pages/Escalations';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/landing" element={<Landing />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route
            path="/"
            element={
              <PrivateRoute requireWorkspace requireInstagram>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route index element={<Navigate to="/inbox" replace />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="knowledge" element={<Knowledge />} />
            <Route path="automations" element={<Automations />} />
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
