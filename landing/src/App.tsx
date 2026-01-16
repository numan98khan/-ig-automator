import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ScrollToTop from './components/ScrollToTop'
import SiteLayout from './components/SiteLayout'
import AppRedirect from './components/AppRedirect'
import Home from './pages/Home'
import Pricing from './pages/Pricing'
import Templates from './pages/Templates'
import UseCases from './pages/UseCases'
import Legal from './pages/Legal'
import NotFound from './pages/NotFound'

const App = () => (
  <BrowserRouter>
    <ScrollToTop />
    <Routes>
      <Route element={<SiteLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/landing" element={<Home />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/templates" element={<Templates />} />
        <Route path="/use-cases" element={<UseCases />} />
        <Route path="/legal" element={<Legal />} />
        <Route path="/privacy-policy" element={<Legal />} />
      </Route>

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

      <Route path="*" element={<NotFound />} />
    </Routes>
  </BrowserRouter>
)

export default App
