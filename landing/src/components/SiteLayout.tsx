import { Outlet } from 'react-router-dom'
import SiteFooter from './SiteFooter'
import SiteHeader from './SiteHeader'

const SiteLayout = () => (
  <div className="min-h-screen">
    <SiteHeader />
    <main className="mx-auto max-w-6xl px-6 pb-16">
      <Outlet />
    </main>
    <SiteFooter />
  </div>
)

export default SiteLayout
