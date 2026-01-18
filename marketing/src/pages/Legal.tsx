import Seo from '../components/Seo'

const Legal = () => (
  <div className="space-y-10">
    <Seo title="Legal | SendFx" description="Privacy and terms for SendFx." canonicalPath="/legal" />

    <section className="rounded-[28px] border border-border/70 bg-white/80 p-10 shadow-soft-xl">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Legal</p>
      <h1 className="mt-3 text-4xl font-display">Privacy & terms</h1>
      <p className="mt-4 max-w-2xl text-muted-foreground">
        We keep things simple: you control your data and we do not sell your information. Below is a short overview of our commitments.
      </p>
    </section>

    <section className="grid gap-6 lg:grid-cols-2">
      <article className="rounded-3xl border border-border/70 bg-white/80 p-7 shadow-soft-lg">
        <h2 className="text-2xl font-display">Privacy policy</h2>
        <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
          <li>We collect only what we need to run the SendFx inbox, automation, and CRM features.</li>
          <li>Message data stays within your workspace and is used only for generating responses.</li>
          <li>You can export or delete your workspace data at any time from the app.</li>
        </ul>
      </article>
      <article className="rounded-3xl border border-border/70 bg-white/80 p-7 shadow-soft-lg">
        <h2 className="text-2xl font-display">Terms of service</h2>
        <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
          <li>SendFx is provided "as is" with regular updates and uptime monitoring.</li>
          <li>You are responsible for ensuring your automated replies comply with platform policies.</li>
          <li>We may suspend accounts that violate security or usage guidelines.</li>
        </ul>
      </article>
    </section>

    <section className="rounded-[28px] border border-border/70 bg-secondary/10 p-10">
      <h3 className="text-2xl font-display">Questions?</h3>
      <p className="mt-3 text-muted-foreground">Reach us at <a className="font-semibold text-secondary" href="mailto:privacy@sendfx.ai">privacy@sendfx.ai</a>.</p>
    </section>
  </div>
)

export default Legal
