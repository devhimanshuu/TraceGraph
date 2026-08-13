import { SignInButton, SignUpButton } from '@clerk/nextjs';
import {
  Boxes,
  GitPullRequestArrow,
  Network,
  Radar,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const features = [
  {
    icon: Network,
    title: 'Graph explorer',
    description:
      'See how files, classes, and functions connect — navigate your codebase the way you think about it, as a graph.',
  },
  {
    icon: Radar,
    title: 'Impact analysis',
    description:
      'Ask “what breaks if I change this?” and get every component affected — directly or indirectly — with the path that explains why.',
  },
  {
    icon: Workflow,
    title: 'Dependency explorer',
    description:
      'Follow imports, calls, and inheritance from any entity. Understand what depends on your code before you touch it.',
  },
  {
    icon: GitPullRequestArrow,
    title: 'Engineering history',
    description:
      'Connect commits, pull requests, and issues to the code they touched — context that lives alongside the graph.',
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.12),transparent_55%)]"
        />
        <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-6 pb-24 pt-20 text-center sm:pt-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Boxes className="size-3.5" />
            Codebase intelligence, powered by a graph database
          </span>

          <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            Understand your codebase through{' '}
            <span className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-transparent">
              relationships.
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            TraceGraph maps your repository as a graph — files, classes, functions, tests, commits,
            and issues — so you can explore dependencies and predict the impact of change before it
            happens.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <SignUpButton mode="modal" fallbackRedirectUrl="/dashboard">
              <Button size="lg">Get started free</Button>
            </SignUpButton>
            <SignInButton mode="modal" fallbackRedirectUrl="/dashboard">
              <Button size="lg" variant="outline">
                Sign in
              </Button>
            </SignInButton>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            No credit card required · Demo workspace included
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border/60 bg-card/30">
        <div className="mx-auto w-full max-w-6xl px-6 py-20">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            Everything you need to change code with confidence
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-muted-foreground">
            TraceGraph stores your repository as a labeled property graph, so relationship questions
            are answered by traversal — not by joining tables.
          </p>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/60 p-5"
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-4.5" />
                </span>
                <h3 className="text-sm font-semibold">{title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Value proposition */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="grid gap-8 sm:grid-cols-3">
          {[
            {
              icon: Workflow,
              title: 'Multi-hop traversal',
              body: 'Answer “what else is affected?” across 1, 2, or 3 relationship hops — dynamically, without recursive joins.',
            },
            {
              icon: ShieldCheck,
              title: 'Test-aware impact',
              body: 'Every impact report shows which tests cover the components you are about to change.',
            },
            {
              icon: GitPullRequestArrow,
              title: 'Change context',
              body: 'Commits, pull requests, and issues are first-class graph citizens, linked to the code they touched.',
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex flex-col gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4.5" />
              </span>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-6 text-xs text-muted-foreground sm:flex-row">
          <span>TraceGraph — Understand your codebase through relationships.</span>
          <span>Built on a labeled property graph with openCypher.</span>
        </div>
      </footer>
    </main>
  );
}
