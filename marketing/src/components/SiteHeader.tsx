import { Link, useLocation } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { getAppUrl } from '../utils/urls'

const navLinks = [
  { label: 'Home', to: '/' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Templates', to: '/templates' },
  { label: 'Use Cases', to: '/use-cases' },
  { label: 'Legal', to: '/legal' },
]

const SiteHeader = () => {
  const appUrl = getAppUrl()
  const location = useLocation()

  return (
    <header className="relative z-10">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground text-lg font-semibold shadow-soft-lg">SF</span>
          <div>
            <p className="text-lg font-display">SendFx</p>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">DM Automation</p>
          </div>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={location.pathname === link.to ? 'text-foreground' : 'hover:text-foreground transition'}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <a
            href={`${appUrl}/login`}
            className="hidden text-sm font-medium text-muted-foreground hover:text-foreground transition md:inline-flex"
          >
            Log in
          </a>
          <a
            href={`${appUrl}/signup`}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-soft-lg transition hover:-translate-y-0.5"
          >
            Start free
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </header>
  )
}

export default SiteHeader
