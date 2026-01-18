import { ArrowUpRight, Briefcase, HeartHandshake, LineChart, MessageCircle } from 'lucide-react'
import Seo from '../components/Seo'
import { getAppUrl } from '../utils/urls'

const useCases = [
  {
    title: 'Sales teams',
    description: 'Capture lead intent, auto-qualify, and assign sales reps with context and notes.',
    icon: Briefcase,
  },
  {
    title: 'Customer support',
    description: 'Triage FAQs, escalate sensitive issues, and keep SLA metrics visible.',
    icon: HeartHandshake,
  },
  {
    title: 'Creators & communities',
    description: 'Moderate inbound DMs, keep replies consistent, and surface VIP opportunities.',
    icon: MessageCircle,
  },
  {
    title: 'Operations',
    description: 'Sync conversation outcomes to CRM dashboards and weekly reporting.',
    icon: LineChart,
  },
]

const UseCases = () => {
  const appUrl = getAppUrl()

  return (
    <div className="space-y-10">
      <Seo title="Use Cases | SendFx" description="See how teams use SendFx for DM automation." canonicalPath="/use-cases" />

      <section className="rounded-[28px] border border-border/70 bg-white/80 p-10 shadow-soft-xl">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Use cases</p>
        <h1 className="mt-3 text-4xl font-display">Every team has a DM playbook. We make it automatic.</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          SendFx adapts to your workflows, from lead capture to support and reporting. Keep the human touch while scaling responses.
        </p>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        {useCases.map((item) => (
          <article key={item.title} className="rounded-3xl border border-border/70 bg-white/80 p-7 shadow-soft-lg">
            <item.icon className="h-6 w-6 text-secondary" />
            <h2 className="mt-4 text-2xl font-display">{item.title}</h2>
            <p className="mt-3 text-sm text-muted-foreground">{item.description}</p>
          </article>
        ))}
      </section>

      <section className="rounded-[28px] border border-border/70 bg-secondary/10 p-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-2xl font-display">Map your workflow in the app.</h3>
            <p className="mt-2 text-muted-foreground">Create a workspace and apply the templates that match your team.</p>
          </div>
          <a
            href={`${appUrl}/signup`}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-soft-lg transition hover:-translate-y-0.5"
          >
            Start free
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
      </section>
    </div>
  )
}

export default UseCases
