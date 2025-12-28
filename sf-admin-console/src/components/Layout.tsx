import { ReactNode, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  MessageSquare,
  Users,
  BarChart3,
  Bot,
  Settings,
  Menu,
  LogOut,
  X,
  Bug,
} from 'lucide-react'
import { useAdminAuth } from '../context/AdminAuthContext'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const { user, logout } = useAdminAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Workspaces', href: '/workspaces', icon: Building2 },
    { name: 'Conversations', href: '/conversations', icon: MessageSquare },
    { name: 'Users', href: '/users', icon: Users },
    { name: 'Tiers', href: '/tiers', icon: Bug },
    { name: 'AI Assistant', href: '/ai-assistant', icon: Bot },
    { name: 'Automations', href: '/automations', icon: Settings },
    { name: 'Analytics', href: '/analytics', icon: BarChart3 },
    { name: 'Debug', href: '/debug', icon: Bug },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-card border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Menu className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground">SendFx Admin</h1>
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-foreground hover:bg-muted rounded-lg"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40 mt-[57px]"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`group fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:w-20 lg:hover:w-64 lg:overflow-hidden lg:transition-all ${
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
      } lg:z-auto mt-0 lg:mt-0`}>
        <div className="flex flex-col h-full">
          {/* Logo - Desktop Only */}
          <div className="hidden lg:flex items-center gap-3 px-4 py-4 border-b border-border lg:justify-center lg:gap-0 lg:group-hover:justify-start lg:group-hover:gap-3">
            <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shrink-0">
              <Menu className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="transition-all duration-200 lg:max-w-0 lg:overflow-hidden lg:opacity-0 lg:translate-x-2 lg:whitespace-nowrap lg:group-hover:max-w-[180px] lg:group-hover:opacity-100 lg:group-hover:translate-x-0">
              <h1 className="text-lg font-bold text-foreground">SendFx Admin</h1>
              <p className="text-xs text-muted-foreground">God Eye View</p>
            </div>
          </div>

          {/* Mobile: Add top padding to account for mobile header */}
          <div className="lg:hidden h-[57px]" />

          {/* Navigation */}
          <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto lg:px-2 lg:group-hover:px-3">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href
              const Icon = item.icon
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  title={item.name}
                  className={`flex items-center gap-3 px-3 py-0 h-12 rounded-lg transition-colors lg:justify-center lg:gap-0 lg:px-2 lg:group-hover:justify-start lg:group-hover:gap-3 lg:group-hover:px-4 ${
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="font-medium whitespace-nowrap transition-all duration-200 lg:max-w-0 lg:overflow-hidden lg:opacity-0 lg:translate-x-2 lg:group-hover:max-w-[200px] lg:group-hover:opacity-100 lg:group-hover:translate-x-0">
                    {item.name}
                  </span>
                </Link>
              )
            })}
          </nav>

          {/* Footer */}
          <div className="px-4 py-4 border-t border-border space-y-3">
            {/* User Info */}
            <div className="flex items-center gap-3 px-3 py-2 bg-muted rounded-lg lg:justify-center lg:gap-0 lg:px-2 lg:group-hover:justify-start lg:group-hover:gap-3 lg:group-hover:px-3">
              <div className="w-9 h-9 bg-primary/20 rounded-full flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-primary">
                  {user?.email?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0 transition-all duration-200 lg:max-w-0 lg:overflow-hidden lg:opacity-0 lg:translate-x-2 lg:whitespace-nowrap lg:group-hover:max-w-[200px] lg:group-hover:opacity-100 lg:group-hover:translate-x-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {user?.email}
                </p>
                <p className="text-xs text-muted-foreground whitespace-nowrap">Administrator</p>
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-0 h-11 text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg transition-colors lg:justify-center lg:gap-0 lg:px-2 lg:group-hover:justify-start lg:group-hover:gap-3 lg:group-hover:px-4"
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0">
                <LogOut className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium whitespace-nowrap transition-all duration-200 lg:max-w-0 lg:overflow-hidden lg:opacity-0 lg:translate-x-2 lg:group-hover:max-w-[160px] lg:group-hover:opacity-100 lg:group-hover:translate-x-0">
                Logout
              </span>
            </button>

            <p className="text-xs text-muted-foreground text-center whitespace-nowrap transition-all duration-200 lg:max-w-0 lg:overflow-hidden lg:opacity-0 lg:group-hover:max-w-[160px] lg:group-hover:opacity-100">
              SendFx Admin v1.0.0
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="min-h-screen lg:ml-20 pt-[57px] lg:pt-0">
        <div className="px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          {children}
        </div>
      </main>
    </div>
  )
}
