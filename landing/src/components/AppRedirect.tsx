import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { getAppUrl } from '../utils/urls'

const AppRedirect = () => {
  const location = useLocation()

  useEffect(() => {
    const appUrl = getAppUrl()
    const target = `${appUrl}${location.pathname}${location.search}${location.hash}`
    window.location.replace(target)
  }, [location.pathname, location.search, location.hash])

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Redirecting</p>
        <h1 className="text-2xl font-display mt-3">Taking you to the SendFx app</h1>
        <p className="text-muted-foreground mt-2">If nothing happens, refresh or open the app directly.</p>
      </div>
    </div>
  )
}

export default AppRedirect
