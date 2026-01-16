import { ArrowRight, Sparkles, MessageSquare, Workflow, ShieldCheck, Zap } from 'lucide-react'
import { getAppUrl } from '../utils/urls'
import Seo from '../components/Seo'

const Home = () => {
  const appUrl = getAppUrl()
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'SendFx',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: 'Instagram DM automation and CRM workflows for modern teams.',
    url: appUrl,
  }

  return (
    <div className="space-y-16">
      <Seo
        title="SendFx | Instagram DM Automation for Modern Teams"
        description="SendFx helps teams turn Instagram DMs into revenue with automation and CRM workflows."
        canonicalPath="/"
        structuredData={structuredData}
      />

      <section className="relative overflow-hidden rounded-[32px] border border-border/70 bg-white/80 p-10 shadow-soft-xl">
        <div className="absolute inset-0 bg-hero-glow opacity-80" />
        <div className="relative z-10 grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <span className="accent-pill inline-flex items-center gap-2 rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em]">
              <Sparkles className="h-4 w-4" />
              New: Templates library
            </span>
            <h1 className="text-4xl font-display md:text-5xl">Turn every DM into revenue, without burning out your team.</h1>
            <p className="text-lg text-muted-foreground">
              SendFx gives you the fastest way to qualify, route, and respond to Instagram messages with guardrails and a lightweight CRM built for growing teams.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row">
              <a
                href={`${appUrl}/signup`}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-soft-lg transition hover:-translate-y-0.5"
              >
                Start free
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href="/templates"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-border/80 bg-white/80 px-6 py-3 text-sm font-semibold text-foreground shadow-soft-lg transition hover:-translate-y-0.5"
              >
                Browse templates
              </a>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              <span>Setup in 15 minutes</span>
              <span>Shared inbox + CRM</span>
              <span>Human approval controls</span>
            </div>
          </div>
          <div className="grid gap-5">
            <div className="glass-surface rounded-3xl border border-border/70 p-6">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Automation Snapshot</p>
              <p className="mt-3 text-xl font-semibold">Intent → routing → reply → escalation</p>
              <p className="mt-3 text-sm text-muted-foreground">
                SendFx monitors every DM, tags intent, and sends the right follow-up while your team stays in control.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { icon: MessageSquare, label: 'Instant reply coverage' },
                { icon: Workflow, label: 'Automated handoffs' },
                { icon: ShieldCheck, label: 'Brand-safe approvals' },
                { icon: Zap, label: 'CRM sync + notes' },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-border/70 bg-white/70 p-4">
                  <item.icon className="h-5 w-5 text-secondary" />
                  <p className="mt-3 text-sm font-semibold">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-4">
          <h2 className="text-3xl font-display">Everything you need to operate your DM pipeline.</h2>
          <p className="text-muted-foreground">
            Automations, CRM, human escalation, and analytics live in one workspace. Keep your team focused and your prospects moving.
          </p>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-secondary-foreground">Teams</span>
            <span>Sales, support, customer success, and community all run on the same playbook.</span>
          </div>
        </div>
        <div className="grid gap-4">
          {[
            {
              title: 'Smart reply guardrails',
              body: 'Set tone, approvals, and escalation rules so every reply sounds on-brand.',
            },
            {
              title: 'Lead capture on autopilot',
              body: 'Push contacts into Google Sheets, HubSpot, or your CRM with full context.',
            },
            {
              title: 'Live team oversight',
              body: 'See what the AI drafted, what was sent, and who handled each conversation.',
            },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-border/70 bg-white/80 p-5 shadow-soft-lg">
              <h3 className="text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-border/70 bg-white/80 p-10 shadow-soft-xl">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h2 className="text-3xl font-display">Templates built for the moments that matter.</h2>
            <p className="mt-3 text-muted-foreground">
              Launch proven playbooks for launches, bookings, lead capture, customer support, and creator collabs in minutes.
            </p>
          </div>
          <div className="grid gap-3">
            {['Product launch inbox', 'VIP lead qualification', 'Booking confirmation flow', 'Customer support triage'].map((item) => (
              <div key={item} className="flex items-center justify-between rounded-2xl border border-border/70 bg-white/70 px-4 py-3">
                <span className="text-sm font-medium">{item}</span>
                <ArrowRight className="h-4 w-4 text-secondary" />
              </div>
            ))}
          </div>
          <a
            href="/templates"
            className="inline-flex items-center gap-2 text-sm font-semibold text-secondary"
          >
            See all templates
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      <section className="grid gap-6 rounded-[28px] border border-border/70 bg-secondary/10 p-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-3xl font-display">Ready to build a calmer inbox?</h2>
            <p className="mt-2 text-muted-foreground">Start free on the app and bring your team over when you are ready.</p>
          </div>
          <a
            href={`${appUrl}/signup`}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-soft-lg transition hover:-translate-y-0.5"
          >
            Create your workspace
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>
    </div>
  )
}

export default Home
