import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Signup from './pages/Signup';
import CreateWorkspace from './pages/CreateWorkspace';
import Inbox from './pages/Inbox';
import Knowledge from './pages/Knowledge';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route
            path="/workspace/create"
            element={
              <PrivateRoute>
                <CreateWorkspace />
              </PrivateRoute>
            }
          />
          <Route
            path="/"
            element={
              <PrivateRoute requireWorkspace>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route index element={<Inbox />} />
            <Route path="inbox" element={<Inbox />} />
            <Route path="knowledge" element={<Knowledge />} />
          </Route>
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
