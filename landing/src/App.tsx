import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Landing from './pages/Landing'
import PrivacyPolicy from './pages/PrivacyPolicy'
import AppRedirect from './components/AppRedirect'

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/landing" element={<Landing />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />

        <Route path="/app/*" element={<AppRedirect />} />
        <Route path="/login" element={<AppRedirect />} />
        <Route path="/signup" element={<AppRedirect />} />
        <Route path="/onboarding" element={<AppRedirect />} />
        <Route path="/verify-email" element={<AppRedirect />} />
        <Route path="/accept-invite" element={<AppRedirect />} />
        <Route path="/request-password-reset" element={<AppRedirect />} />
        <Route path="/reset-password" element={<AppRedirect />} />
        <Route path="/inbox" element={<AppRedirect />} />
        <Route path="/crm" element={<AppRedirect />} />
        <Route path="/automations" element={<AppRedirect />} />
        <Route path="/settings" element={<AppRedirect />} />
        <Route path="/billing" element={<AppRedirect />} />
        <Route path="/support" element={<AppRedirect />} />
        <Route path="/dashboard" element={<AppRedirect />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </AuthProvider>
)

export default App
