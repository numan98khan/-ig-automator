import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Inbox from './pages/Inbox';
import Knowledge from './pages/Knowledge';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/landing" element={<Landing />} />
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
          </Route>
          <Route path="*" element={<Navigate to="/landing" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
