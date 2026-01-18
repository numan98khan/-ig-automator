import { ArrowRight, Layers, Wand2, Users } from 'lucide-react'
import Seo from '../components/Seo'
import { getAppUrl } from '../utils/urls'

const templates = [
  {
    title: 'Product launch momentum',
    description: 'Capture every question, qualify leads, and send post-launch follow-ups automatically.',
    tags: ['Launch', 'Sales'],
  },
  {
    title: 'Lead magnet delivery',
    description: 'Deliver your lead magnet, log interest, and book consults without manual tracking.',
    tags: ['Lead gen', 'CRM'],
  },
  {
    title: 'Booking concierge',
    description: 'Route qualified leads to your booking link with context, timing, and reminders.',
    tags: ['Bookings', 'Support'],
  },
  {
    title: 'Community moderation',
    description: 'Auto-handle FAQs, flag escalation requests, and keep your tone consistent.',
    tags: ['Community', 'Support'],
  },
]

const Templates = () => {
  const appUrl = getAppUrl()

  return (
    <div className="space-y-10">
      <Seo title="Templates | SendFx" description="Browse SendFx automation templates for DM workflows." canonicalPath="/templates" />

      <section className="rounded-[28px] border border-border/70 bg-white/80 p-10 shadow-soft-xl">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Templates</p>
        <h1 className="mt-3 text-4xl font-display">Launch-ready DM playbooks.</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Pick a template, customize your tone, approvals, and routing rules, then go live in minutes.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        {templates.map((template) => (
          <article key={template.title} className="rounded-3xl border border-border/70 bg-white/80 p-7 shadow-soft-lg">
            <h2 className="text-2xl font-display">{template.title}</h2>
            <p className="mt-3 text-sm text-muted-foreground">{template.description}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {template.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-border/70 bg-secondary/10 px-3 py-1 text-xs font-semibold text-secondary">
                  {tag}
                </span>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="grid gap-6 rounded-[28px] border border-border/70 bg-secondary/10 p-10 lg:grid-cols-3">
        <div className="flex flex-col gap-3">
          <Layers className="h-6 w-6 text-secondary" />
          <h3 className="text-xl font-display">Layered guardrails</h3>
          <p className="text-sm text-muted-foreground">Keep every template on-brand with approval paths, tone guidance, and escalation rules.</p>
        </div>
        <div className="flex flex-col gap-3">
          <Wand2 className="h-6 w-6 text-secondary" />
          <h3 className="text-xl font-display">Instant customization</h3>
          <p className="text-sm text-muted-foreground">Swap messaging and intents to fit your campaign or workflow in minutes.</p>
        </div>
        <div className="flex flex-col gap-3">
          <Users className="h-6 w-6 text-secondary" />
          <h3 className="text-xl font-display">Team ready</h3>
          <p className="text-sm text-muted-foreground">Assign templates to teams, track usage, and iterate with confidence.</p>
        </div>
      </section>

      <section className="rounded-[28px] border border-border/70 bg-white/80 p-10 shadow-soft-xl">
        <h3 className="text-2xl font-display">Ready to launch a template?</h3>
        <p className="mt-3 text-muted-foreground">Create a workspace and activate your first automation today.</p>
        <a
          href={`${appUrl}/signup`}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-soft-lg transition hover:-translate-y-0.5"
        >
          Start free
          <ArrowRight className="h-4 w-4" />
        </a>
      </section>
    </div>
  )
}

export default Templates
