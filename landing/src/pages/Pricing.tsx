import { Check, ArrowUpRight } from 'lucide-react'
import Seo from '../components/Seo'
import { getAppUrl } from '../utils/urls'

const tiers = [
  {
    name: 'Starter',
    price: '$0',
    detail: 'for early experiments',
    features: [
      'Shared inbox for 1 workspace',
      'Up to 200 AI replies / month',
      'Core automation templates',
      'Email support',
    ],
  },
  {
    name: 'Growth',
    price: '$149',
    detail: 'for scaling teams',
    features: [
      'Unlimited AI replies',
      'Multi-step automation builder',
      'CRM and Sheets sync',
      'Priority support + SLAs',
    ],
  },
  {
    name: 'Scale',
    price: 'Custom',
    detail: 'for enterprise workflows',
    features: [
      'Dedicated success manager',
      'Custom approvals + audits',
      'Multi-brand workspaces',
      'Security reviews & SSO',
    ],
  },
]

const Pricing = () => {
  const appUrl = getAppUrl()

  return (
    <div className="space-y-10">
      <Seo title="Pricing | SendFx" description="Simple pricing for Instagram DM automation teams." canonicalPath="/pricing" />

      <section className="rounded-[28px] border border-border/70 bg-white/80 p-10 shadow-soft-xl">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Pricing</p>
        <h1 className="mt-3 text-4xl font-display">Plans built for fast-moving DM teams.</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Start free, then unlock advanced automations, analytics, and approvals as you scale. Every plan includes your shared inbox and CRM essentials.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        {tiers.map((tier, index) => (
          <div
            key={tier.name}
            className={`rounded-3xl border border-border/70 bg-white/80 p-8 shadow-soft-lg ${
              index === 1 ? 'relative ring-2 ring-secondary/40' : ''
            }`}
          >
            {index === 1 && (
              <span className="absolute -top-3 left-6 rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-secondary-foreground">
                Most popular
              </span>
            )}
            <h2 className="text-2xl font-display">{tier.name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{tier.detail}</p>
            <div className="mt-6 flex items-end gap-2">
              <span className="text-4xl font-semibold">{tier.price}</span>
              {tier.price !== 'Custom' && <span className="text-sm text-muted-foreground">/ month</span>}
            </div>
            <ul className="mt-6 space-y-3 text-sm">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <Check className="h-4 w-4 text-secondary" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <a
              href={tier.price === 'Custom' ? `${appUrl}/signup` : `${appUrl}/signup`}
              className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-soft-lg transition hover:-translate-y-0.5"
            >
              {tier.price === 'Custom' ? 'Talk to sales' : 'Start free'}
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
        ))}
      </section>

      <section className="rounded-[28px] border border-border/70 bg-secondary/10 p-10">
        <h3 className="text-2xl font-display">Need help mapping your DM workflow?</h3>
        <p className="mt-3 text-muted-foreground">
          We will help you design automations, handoffs, and CRM syncing for your team. Start in the app or reach out for a guided demo.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <a
            href={`${appUrl}/signup`}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-soft-lg transition hover:-translate-y-0.5"
          >
            Start for free
          </a>
          <a
            href="mailto:hello@sendfx.ai"
            className="inline-flex items-center justify-center gap-2 rounded-full border border-border/70 bg-white/70 px-6 py-3 text-sm font-semibold"
          >
            Email sales
          </a>
        </div>
      </section>
    </div>
  )
}

export default Pricing
