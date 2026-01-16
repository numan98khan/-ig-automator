import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { getAppUrl } from '../utils/urls'
import Seo from '../components/Seo'

const NotFound = () => {
  const appUrl = getAppUrl()

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <Seo title="Page Not Found | SendFx" robots="noindex, nofollow" />
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">404</p>
      <h1 className="text-3xl font-display">We could not find that page.</h1>
      <p className="text-muted-foreground">Try one of the links below to keep exploring SendFx.</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          to="/"
          className="inline-flex items-center justify-center gap-2 rounded-full border border-border/70 bg-white/80 px-6 py-3 text-sm font-semibold"
        >
          Go home
        </Link>
        <a
          href={`${appUrl}/login`}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
        >
          Open the app
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </div>
  )
}

export default NotFound
