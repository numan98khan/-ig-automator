import { Link, useLocation } from 'react-router-dom'

const tabs = [
  { id: 'flows', label: 'Flows', href: '/automations' },
  { id: 'intentions', label: 'Intentions', href: '/automations/intentions' },
]

export default function AutomationsTabs() {
  const location = useLocation()
  const activeTab = location.pathname.startsWith('/automations/intentions') ? 'intentions' : 'flows'

  return (
    <div className="border-b border-border">
      <div className="flex gap-6">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            to={tab.href}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
