import { SignInButton, SignUpButton } from '@clerk/nextjs';
import {
  ArrowRight,
  GitPullRequestArrow,
  Network,
  Radar,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LatticeBackground } from '@/components/ui/lattice-background';

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

const steps = [
  {
    number: '01',
    title: 'Map your repository',
    body: 'TraceGraph loads your codebase as a labeled property graph — files, classes, functions, tests, commits, and issues are first-class citizens.',
  },
  {
    number: '02',
    title: 'Explore relationships',
    body: 'Follow imports, calls, and inheritance from any entity. See what depends on what, in either direction.',
  },
  {
    number: '03',
    title: 'Analyze impact',
    body: 'Ask what breaks if you change this — and see every affected component, direct or indirect, with the path that explains why.',
  },
];

const NODE_KINDS = {
  direct: {
    dot: 'size-3 rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 shadow-[0_0_10px_rgba(56,189,248,0.55)]',
    edge: 'stroke-sky-400/40',
    flow: 'stroke-sky-300',
  },
  indirect: {
    dot: 'size-3 rounded-full border-2 border-amber-400 bg-amber-400/10',
    edge: 'stroke-amber-400/40',
    flow: 'stroke-amber-300',
  },
  test: {
    dot: 'size-2.5 rounded-[3px] border-2 border-emerald-400 bg-emerald-400/15',
    edge: 'stroke-emerald-400/40',
    flow: 'stroke-emerald-300',
  },
} as const;

function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const bow = 6;
  const mx = (x1 + x2) / 2 - (dy / len) * bow;
  const my = (y1 + y2) / 2 + (dx / len) * bow;
  return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
}

/**
 * Decorative product preview — a static illustration of the graph explorer
 * concept (hub entity + neighborhood). Purely presentational: aria-hidden
 * internals, motion-safe animations.
 */
function GraphPreview() {
  const hub = { x: 50, y: 46 };
  const nodes = [
    { x: 15, y: 22, label: 'CheckoutService', kind: 'direct' as const },
    { x: 85, y: 22, label: 'RefundService', kind: 'direct' as const },
    { x: 50, y: 7, label: 'AuditService', kind: 'indirect' as const },
    { x: 13, y: 74, label: 'PaymentController', kind: 'direct' as const },
    { x: 87, y: 74, label: 'OrderService', kind: 'indirect' as const },
    { x: 50, y: 88, label: 'PaymentServiceTest', kind: 'test' as const },
  ];
  const edges = nodes.map((n) => ({ d: edgePath(hub.x, hub.y, n.x, n.y), kind: n.kind }));

  return (
    <div className="relative mx-auto mt-14 w-full max-w-3xl">
      {/* Ambient glow behind the card */}
      <div
        aria-hidden
        className="absolute -inset-6 rounded-[2.5rem] bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.16),transparent_65%)] blur-2xl"
      />

      <div
        role="img"
        aria-label="Illustration of the graph explorer: PaymentService at the center, connected to its dependents and tests"
        className="relative rounded-2xl bg-gradient-to-b from-white/20 via-white/5 to-white/0 p-px shadow-[0_32px_80px_-24px_rgba(2,6,23,0.6)]"
      >
        <div className="overflow-hidden rounded-[15px] bg-card/95 text-left backdrop-blur-sm">
          {/* Window chrome */}
          <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-2.5">
            <span aria-hidden className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-red-400/80" />
              <span className="size-2.5 rounded-full bg-amber-400/80" />
              <span className="size-2.5 rounded-full bg-emerald-400/80" />
            </span>
            <span className="ml-2 truncate font-mono text-[11px] text-muted-foreground">
              commerce-platform — impact preview
            </span>
            <span
              aria-hidden
              className="ml-auto hidden items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-emerald-400/90 sm:flex"
            >
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
              Connected
            </span>
          </div>

          {/* Graph canvas */}
          <div className="relative h-[420px] w-full sm:h-[470px]">
            {/* Dot grid */}
            <div
              aria-hidden
              className="absolute inset-0 opacity-40"
              style={{
                backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)',
                backgroundSize: '22px 22px',
              }}
            />
            {/* Radar rings + hub glow */}
            <div aria-hidden className="absolute inset-0">
              {[26, 46, 66].map((s) => (
                <div
                  key={s}
                  className="absolute rounded-full border border-white/5"
                  style={{
                    left: `${hub.x - s / 2}%`,
                    top: `${hub.y - s / 2}%`,
                    width: `${s}%`,
                    height: `${s}%`,
                  }}
                />
              ))}
              <div
                className="absolute h-[72%] w-[72%] rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.13),transparent_70%)] blur-xl"
                style={{ left: `${hub.x - 36}%`, top: `${hub.y - 36}%` }}
              />
            </div>

            {/* Edges — base + animated data-flow layer */}
            <svg
              aria-hidden
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full"
            >
              {edges.map((e, i) => (
                <g key={i}>
                  <path
                    d={e.d}
                    fill="none"
                    vectorEffect="non-scaling-stroke"
                    strokeWidth="1.25"
                    strokeDasharray={e.kind === 'indirect' ? '5 4' : undefined}
                    className={NODE_KINDS[e.kind].edge}
                  />
                  <path
                    d={e.d}
                    fill="none"
                    vectorEffect="non-scaling-stroke"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeDasharray="3 14"
                    className={`tg-flow-line ${NODE_KINDS[e.kind].flow}`}
                  />
                </g>
              ))}
            </svg>

            {/* Floating telemetry chips */}
            <div
              aria-hidden
              className="absolute left-3 top-3 -rotate-1 rounded-md border border-border/50 bg-card/85 px-2 py-1 font-mono text-[10px] text-muted-foreground shadow-sm backdrop-blur-sm"
            >
              12ms · multi-hop traversal
            </div>
            <div
              aria-hidden
              className="absolute bottom-3 right-3 rotate-1 rounded-md border border-border/50 bg-card/85 px-2 py-1 font-mono text-[10px] text-muted-foreground shadow-sm backdrop-blur-sm"
            >
              238 relationships
            </div>

            {/* Hub */}
            <div
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
              style={{ left: `${hub.x}%`, top: `${hub.y}%` }}
            >
              <div className="relative flex items-center justify-center">
                <span aria-hidden className="tg-hub-pulse absolute size-11 rounded-full bg-sky-400/25" />
                <span
                  aria-hidden
                  className="tg-hub-pulse tg-hub-pulse-delay absolute size-11 rounded-full bg-sky-400/20"
                />
                <span className="relative flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 shadow-[0_0_28px_rgba(56,189,248,0.5),inset_0_1px_0_rgba(255,255,255,0.4)] ring-1 ring-white/20">
                  <span className="size-2 rounded-full bg-white/90" />
                </span>
              </div>
              <span className="relative whitespace-nowrap rounded-md border border-sky-400/40 bg-sky-400/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-sky-300 backdrop-blur-sm">
                PaymentService
              </span>
            </div>

            {/* Neighbors */}
            {nodes.map((n) => (
              <div
                key={n.label}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5"
                style={{ left: `${n.x}%`, top: `${n.y}%` }}
              >
                <span className={NODE_KINDS[n.kind].dot} />
                <span className="whitespace-nowrap rounded border border-border/50 bg-card/85 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground backdrop-blur-sm sm:text-[11px]">
                  {n.label}
                </span>
              </div>
            ))}

            {/* Top highlight + vignette */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.35))]"
            />
          </div>

          {/* Legend strip */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-border/60 bg-muted/30 px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-gradient-to-br from-sky-400 to-indigo-500" />
              Direct impact · 3
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full border-2 border-amber-400" />
              Indirect impact · 2
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-[3px] border-2 border-emerald-400 bg-emerald-400/15" />
              Test coverage · 1
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      {/* Hero — full-viewport lattice background (design reference) */}
      <section className="relative h-screen min-h-[680px] w-full overflow-hidden">
        <div aria-hidden className="absolute inset-0">
          {/* Pure background layer — the branded hero content overlays it */}
          <LatticeBackground title="" subtitle="" description="" />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-sky-500/40 to-transparent"
        />
        <div className="pointer-events-none relative z-10 mx-auto flex h-full w-full max-w-6xl flex-col items-center justify-center px-6 text-center">
          <span className="font-mono text-xs uppercase tracking-widest text-sky-400/90">
            Codebase intelligence · powered by a graph database
          </span>

          <h1 className="mt-6 font-mono text-6xl font-bold uppercase leading-none tracking-tighter text-white mix-blend-difference sm:text-8xl lg:text-9xl">
            TraceGraph
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground/90 sm:text-lg">
            Understand your codebase through relationships — files, classes, functions, tests,
            commits and issues, mapped as a graph so you can explore dependencies and predict the
            impact of change before it happens.
          </p>

          <div className="pointer-events-auto mt-10 flex flex-wrap items-center justify-center gap-3">
            <SignUpButton mode="modal" fallbackRedirectUrl="/dashboard">
              <Button size="lg">
                Get started free
                <ArrowRight className="size-4" />
              </Button>
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

      {/* Product preview — floats over the lattice hero */}
      <section className="relative z-10 px-6 pb-20">
        <GraphPreview />
      </section>

      {/* Capability strip */}
      <section className="border-y border-border/60 bg-muted/30">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-6 py-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          <span>Labeled property graph</span>
          <span aria-hidden className="hidden text-border sm:inline">/</span>
          <span>openCypher queries</span>
          <span aria-hidden className="hidden text-border sm:inline">/</span>
          <span>Multi-hop traversal</span>
          <span aria-hidden className="hidden text-border sm:inline">/</span>
          <span>Test-aware impact</span>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="mx-auto w-full max-w-6xl scroll-mt-24 px-6 py-20">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            How it works
          </p>
          <h2 className="max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
            From repository to risk in three steps
          </h2>
        </div>
        <ol className="mt-12 grid gap-4 sm:grid-cols-3">
          {steps.map(({ number, title, body }) => (
            <li
              key={number}
              className="relative flex flex-col gap-3 rounded-xl border border-border/60 bg-card/50 p-6"
            >
              <span className="font-mono text-sm font-semibold text-sky-600">{number}</span>
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-24 border-t border-border/60 bg-card/30">
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
                className="group flex flex-col gap-3 rounded-xl border border-border/60 bg-card/70 p-5 transition-colors hover:border-border"
              >
                <span className="flex size-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 transition-colors group-hover:bg-sky-500/15">
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
        <div className="grid gap-4 sm:grid-cols-3">
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
            <div
              key={title}
              className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/50 p-6"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600">
                <Icon className="size-4.5" />
              </span>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="px-6 pb-20">
        <div className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-sky-500/10 via-background to-indigo-500/10 px-6 py-14 text-center sm:px-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.12),transparent_60%)]"
          />
          <h2 className="relative text-2xl font-semibold tracking-tight sm:text-3xl">
            Change code with confidence
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
            Start exploring a demo codebase today — no setup, no credit card, just the graph.
          </p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
            <SignUpButton mode="modal" fallbackRedirectUrl="/dashboard">
              <Button size="lg">
                Get started free
                <ArrowRight className="size-4" />
              </Button>
            </SignUpButton>
            <SignInButton mode="modal" fallbackRedirectUrl="/dashboard">
              <Button size="lg" variant="outline">
                Sign in
              </Button>
            </SignInButton>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 text-xs text-muted-foreground sm:flex-row">
          <span>TraceGraph — Understand your codebase through relationships.</span>
          <nav aria-label="Footer" className="flex items-center gap-5">
            <a href="#how-it-works" className="transition-colors hover:text-foreground">
              How it works
            </a>
            <a href="#features" className="transition-colors hover:text-foreground">
              Features
            </a>
            <span className="font-mono">Built on openCypher</span>
          </nav>
        </div>
      </footer>
    </main>
  );
}
