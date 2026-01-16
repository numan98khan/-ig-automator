import { Link } from 'react-router-dom'
import { getAppUrl } from '../utils/urls'

const SiteFooter = () => {
  const appUrl = getAppUrl()

  return (
    <footer className="border-t border-border/70 mt-16">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-medium text-foreground">SendFx</p>
          <p className="mt-2 max-w-sm">Instagram DM automation and CRM workflows that keep your team fast, human, and consistent.</p>
        </div>
        <div className="flex flex-wrap gap-4">
          <Link to="/pricing" className="hover:text-foreground transition">Pricing</Link>
          <Link to="/templates" className="hover:text-foreground transition">Templates</Link>
          <Link to="/use-cases" className="hover:text-foreground transition">Use cases</Link>
          <Link to="/legal" className="hover:text-foreground transition">Legal</Link>
          <a href={`${appUrl}/login`} className="hover:text-foreground transition">Log in</a>
        </div>
        <p className="text-xs">© 2024 SendFx. All rights reserved.</p>
      </div>
    </footer>
  )
}

export default SiteFooter
