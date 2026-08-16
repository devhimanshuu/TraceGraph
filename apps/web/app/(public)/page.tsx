import {
  ArrowDown,
  CheckCircle2,
  ChevronDown,
  Database,
  GitBranch,
  GitPullRequestArrow,
  Lock,
  Network,
  Radar,
  ShieldCheck,
  Star,
  Workflow,
} from 'lucide-react';
import { LandingCta } from '@/components/auth/landing-cta';
import { FadeIn } from '@/components/fade-in';
import { LatticeBackground } from '@/components/ui/lattice-background';
import { Wordmark } from '@/components/wordmark';

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

const testimonials = [
  {
    quote:
      'We caught a refactor that would have broken the checkout flow before it ever shipped. The impact view paid for itself in one afternoon.',
    name: 'Maya Chen',
    role: 'Staff Engineer · payments platform',
    initials: 'MC',
  },
  {
    quote:
      'Finally a tool that explains why something is affected — not just a wall of files. The paths make review conversations actually productive.',
    name: 'André Silva',
    role: 'Engineering Manager',
    initials: 'AS',
  },
  {
    quote:
      'The blast-radius report went straight into our PR description. Our reviewers actually read it — and we stopped breaking production.',
    name: 'Priya Nair',
    role: 'Platform Team Lead',
    initials: 'PN',
  },
];

const STATS = [
  { value: '6', label: 'typed relationship kinds' },
  { value: '3', label: 'hops of impact depth' },
  { value: '<15ms', label: 'median graph traversal' },
  { value: '100%', label: 'deterministic analysis' },
];

const trust = [
  {
    icon: Lock,
    title: 'Token stays on the server',
    body: 'Your GitHub token is stored backend-only and never ships to the browser. Sign-in is plain OAuth — no password, no paste.',
  },
  {
    icon: Database,
    title: 'Your graph, your CognoDB',
    body: 'The mapped repository lives in your own CognoDB instance — you own the data, the queries, and the analysis.',
  },
  {
    icon: ShieldCheck,
    title: 'Deterministic and explainable',
    body: 'Impact is graph traversal over typed relationships, not a guess. AI only summarizes evidence that already exists.',
  },
];

const faqs = [
  {
    q: 'What exactly does TraceGraph do?',
    a: 'TraceGraph loads a GitHub repository into a labeled property graph — files, classes, functions, tests, commits, and issues become nodes connected by typed relationships. You explore the graph, follow dependencies, and ask what breaks if you change an entity.',
  },
  {
    q: 'How is impact analysis calculated?',
    a: 'Deterministically. The engine traverses the graph from your selected entity over typed dependency relationships up to a bounded depth, separates direct from indirect impact, ranks affected tests, and explains each hit with the relationship path that produced it. The optional AI explanation only summarizes this evidence — it never adds facts.',
  },
  {
    q: 'Is my code safe?',
    a: 'Yes. GitHub OAuth is the only sign-in and your access token lives backend-only — it never reaches the browser bundle. The mapped graph is stored in your own CognoDB instance, and the app never makes write access to your repositories.',
  },
  {
    q: 'Which repositories are supported?',
    a: 'Any GitHub repository you can access. TraceGraph analyzes structural signals — imports, calls, and inheritance — so it works for most languages without language-specific parsers.',
  },
  {
    q: 'Do I need to install anything?',
    a: 'No. TraceGraph runs as a hosted app connected to a CognoDB instance — sign in with GitHub, pick a repository, and the graph is ready in minutes. A CI check command is available for teams that want impact gates in pull requests.',
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

const IMPACT_ROWS = [
  { name: 'CheckoutService', kind: 'direct', note: '' },
  { name: 'RefundService', kind: 'direct', note: '' },
  { name: 'PaymentController', kind: 'direct', note: '' },
  { name: 'OrderService', kind: 'indirect', note: 'via CheckoutService' },
  { name: 'PaymentServiceTest', kind: 'test', note: '' },
] as const;

/**
 * Compact live impact-analysis preview for the hero: a glass panel showing
 * PaymentService's direct/indirect impact with traveling data pulses on the
 * connector lines. Purely presentational (aria-hidden internals, motion-safe
 * — the pulse animation only runs under `prefers-reduced-motion: no-preference`).
 */
function ImpactPreviewCard() {
  return (
    <div className="pointer-events-none mt-10 w-full max-w-md text-left">
      <div className="relative overflow-hidden rounded-2xl border border-sky-400/30 bg-white/75 p-4 shadow-[0_28px_60px_-28px_rgba(2,6,23,0.25)] backdrop-blur-md dark:border-sky-400/20 dark:bg-white/[0.04] dark:shadow-[0_28px_60px_-28px_rgba(2,6,23,0.8)]">
        <div
          aria-hidden
          className="absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/50 to-transparent"
        />

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-300">
            <Radar className="size-4 text-sky-400" aria-hidden />
            Impact analysis
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-emerald-400">
            <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
            Live
          </span>
        </div>

        {/* Root entity + risk */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="font-mono text-sm font-bold text-slate-900 dark:text-white">PaymentService</span>
          <span className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-amber-300">
            Medium risk
          </span>
        </div>

        {/* Affected rows with traveling pulses */}
        <ul className="mt-3 space-y-1.5">
          {IMPACT_ROWS.map((row) => (
            <li key={row.name} className="flex items-center gap-2">
              <span className={NODE_KINDS[row.kind].dot} aria-hidden />
              <svg aria-hidden className="h-4 w-7">
                <line x1="0" y1="8" x2="28" y2="8" className={NODE_KINDS[row.kind].edge} strokeWidth="1.25" />
                <line
                  x1="0"
                  y1="8"
                  x2="28"
                  y2="8"
                  className={`tg-flow-line ${NODE_KINDS[row.kind].flow}`}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeDasharray="2 9"
                />
              </svg>
              <span className="truncate font-mono text-[11px] text-slate-700 dark:text-slate-200">{row.name}</span>
              <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {row.note ? `${row.kind} · ${row.note}` : row.kind}
              </span>
            </li>
          ))}
        </ul>

        {/* Footer stats */}
        <div className="mt-3 flex items-center justify-between border-t border-slate-900/10 pt-2.5 font-mono text-[10px] uppercase tracking-wider text-slate-500 dark:border-white/5 dark:text-slate-400">
          <span>3 direct · 2 indirect · 1 test</span>
          <span>2 hops</span>
        </div>
      </div>
    </div>
  );
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
      {/* Ambient glow behind the card — a soft white bloom in light theme so
          the card emerges from the page (matching the hero fade); sky glow in
          dark, where the card floats over the near-black page. */}
      <div
        aria-hidden
        className="absolute -inset-6 rounded-[2.5rem] bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.9),transparent_65%)] blur-2xl dark:bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.16),transparent_65%)]"
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
                  className="absolute rounded-full border border-foreground/10"
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
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent"
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
      <section className="relative h-screen min-h-[760px] w-full overflow-hidden">
        <div aria-hidden className="absolute inset-0">
          {/* Pure background layer — the branded hero content overlays it. The
              lattice follows the active theme (dark canvas on dark, light on
              light). */}
          <LatticeBackground title="" subtitle="" description="" />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-px bg-gradient-to-r from-transparent via-sky-500/40 to-transparent"
        />
        <div className="pointer-events-none relative z-10 mx-auto flex h-full w-full max-w-6xl flex-col items-center justify-center px-6 text-center">
          {/* Eyebrow badge */}
          <span className="flex items-center gap-2.5 rounded-full border border-sky-400/40 bg-sky-400/10 px-4 py-1.5 font-mono text-[11px] uppercase tracking-widest text-sky-700 backdrop-blur-sm dark:border-sky-400/30 dark:text-sky-300">
            <span aria-hidden className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-sky-400" />
            </span>
            Codebase intelligence · powered by CognoDB
          </span>

          {/* Headline — value-first; the brand lives in the nav and footer */}
          <h1 className="mt-6 font-mono text-4xl font-bold uppercase leading-[0.95] tracking-tighter text-slate-900 dark:text-white sm:text-6xl lg:text-7xl">
            Know what breaks
            <span className="block bg-gradient-to-r from-sky-600 via-sky-500 to-indigo-600 bg-clip-text pb-1 text-transparent dark:from-sky-300 dark:via-sky-200 dark:to-indigo-300">
              before you commit
            </span>
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-200/90 sm:text-lg">
            TraceGraph maps your repository into a labeled property graph — files, functions, tests,
            and change history — so impact analysis is a{' '}
            <span className="font-semibold text-sky-600 dark:text-sky-300">traversal, not a guess</span>.
          </p>

          <div className="pointer-events-auto mt-8 flex flex-wrap items-center justify-center gap-3">
            <LandingCta label="Get started free" size="lg" />
            <a
              href="#how-it-works"
              className="group inline-flex h-11 items-center gap-2 rounded-md border border-slate-300 bg-white/70 px-6 text-sm font-medium text-slate-800 backdrop-blur-sm transition-colors hover:border-slate-400 hover:bg-white dark:border-white/15 dark:bg-white/5 dark:text-white/90 dark:hover:border-white/30 dark:hover:bg-white/10"
            >
              See how it works
              <ArrowDown
                className="size-4 text-sky-600 transition-transform duration-300 group-hover:translate-y-0.5 dark:text-sky-300"
                aria-hidden
              />
            </a>
          </div>

          {/* Trust markers */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-widest text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-emerald-500 dark:text-emerald-400" aria-hidden />
              Free to start
            </span>
            <span aria-hidden className="text-slate-400 dark:text-slate-600">
              •
            </span>
            <span className="flex items-center gap-1.5">
              <GitBranch className="size-3.5 text-sky-500 dark:text-sky-400" aria-hidden />
              Your GitHub repo, mapped in minutes
            </span>
          </div>

          {/* Live impact-analysis preview */}
          <ImpactPreviewCard />

        </div>

        {/* Soft bottom fade — the lattice melts into the page background instead
            of ending at a hard line (token-based, so it works in both themes). */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-44 bg-gradient-to-b from-transparent to-background"
        />

        {/* Scroll cue — minimal chevron so it never collides with the card */}
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2"
        >
          <ChevronDown className="size-4 animate-bounce text-slate-400 dark:text-slate-500" />
        </div>
      </section>

      {/* Product preview — floats over the lattice hero */}
      <section className="relative z-10 px-6 pb-20">
        <GraphPreview />
      </section>

      {/* Capability strip */}
      <section className="relative border-y border-border/60 bg-muted/30">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-500/40 to-transparent"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-sky-500/20 to-transparent"
        />
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-6 py-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          {['Labeled property graph', 'openCypher queries', 'Multi-hop traversal', 'Test-aware impact'].map(
            (item, i) => (
              <span
                key={item}
                className="flex cursor-default items-center gap-2 transition-colors duration-300 hover:text-sky-300"
              >
                {i > 0 && (
                  <span aria-hidden className="mr-6 hidden text-border sm:inline">
                    •
                  </span>
                )}
                <span
                  aria-hidden
                  className="size-1.5 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 shadow-[0_0_8px_rgba(56,189,248,0.5)]"
                />
                {item}
              </span>
            ),
          )}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="mx-auto w-full max-w-6xl scroll-mt-24 px-6 py-20">
        <FadeIn className="flex flex-col items-center gap-3 text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            How it works
          </p>
          <h2 className="max-w-xl font-heading text-2xl font-bold uppercase tracking-tight sm:text-3xl">
            From repository to risk in three steps
          </h2>
        </FadeIn>
        <ol className="relative mt-12 grid gap-4 sm:grid-cols-3">
          {/* Process rail — connects the step badges on desktop */}
          <span
            aria-hidden
            className="absolute left-[16.66%] right-[16.66%] top-[44px] hidden h-px -translate-y-1/2 bg-gradient-to-r from-sky-400/0 via-sky-400/40 to-sky-400/0 sm:block"
          />
          {steps.map(({ number, title, body }, i) => (
            <FadeIn key={number} delay={i * 80} className="h-full">
              <li className="group relative flex h-full flex-col gap-4 overflow-hidden rounded-xl border border-border/60 bg-card/50 p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-500/40 hover:bg-card hover:shadow-[0_16px_40px_-20px_rgba(2,6,23,0.28)]">
                {/* Ghost number watermark */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-2 -top-5 font-mono text-6xl font-bold leading-none text-foreground/[0.05] transition-colors duration-300 group-hover:text-sky-400/10"
                >
                  {number}
                </span>
                <span className="flex size-10 items-center justify-center rounded-full border border-sky-400/30 bg-sky-500/10 font-mono text-sm font-bold text-sky-300 transition-all duration-300 group-hover:border-sky-400/60 group-hover:bg-sky-500/20 group-hover:shadow-[0_0_18px_rgba(56,189,248,0.35)]">
                  {number}
                </span>
                <h3 className="relative text-sm font-semibold">{title}</h3>
                <p className="relative text-sm leading-relaxed text-muted-foreground">{body}</p>
              </li>
            </FadeIn>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section id="features" className="relative scroll-mt-24 overflow-hidden border-t border-border/60 bg-card/30">
        {/* Dot-grid texture — echoes the graph canvas */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
        />
        <div className="relative mx-auto w-full max-w-6xl px-6 py-20">
          <FadeIn className="flex flex-col items-center gap-3 text-center">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Capabilities
            </p>
            <h2 className="max-w-2xl font-heading text-2xl font-bold uppercase tracking-tight sm:text-3xl">
              Everything you need to change code with confidence
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              TraceGraph stores your repository as a labeled property graph, so relationship questions
              are answered by traversal — not by joining tables.
            </p>
          </FadeIn>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, description }, i) => (
              <FadeIn key={title} delay={(i % 4) * 80} className="h-full">
                <div className="group relative flex h-full flex-col gap-3 overflow-hidden rounded-xl border border-border/60 bg-card/70 p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-500/40 hover:shadow-[0_16px_40px_-20px_rgba(2,6,23,0.28)]">
                  {/* Icon glow that blooms on hover */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-[radial-gradient(140px_90px_at_28%_0%,rgba(56,189,248,0.14),transparent_70%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  />
                  <span className="relative flex size-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400 ring-1 ring-inset ring-sky-400/20 transition-all duration-300 group-hover:bg-sky-500/20 group-hover:ring-sky-400/40 group-hover:shadow-[0_0_18px_rgba(56,189,248,0.3)]">
                    <Icon className="size-4.5" />
                  </span>
                  <h3 className="relative text-sm font-semibold">{title}</h3>
                  <p className="relative text-sm leading-relaxed text-muted-foreground">{description}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* Value proposition */}
      <section className="relative mx-auto w-full max-w-6xl px-6 py-20">
        {/* Ambient glow behind the grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/3 mx-auto h-72 max-w-3xl rounded-full bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.07),transparent_65%)] blur-2xl"
        />
        <FadeIn className="relative flex flex-col items-center gap-3 text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Why a graph
          </p>
          <h2 className="max-w-2xl font-heading text-2xl font-bold uppercase tracking-tight sm:text-3xl">
            Relationship questions, answered by traversal
          </h2>
        </FadeIn>
        <div className="relative mt-12 grid gap-4 sm:grid-cols-3">
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
          ].map(({ icon: Icon, title, body }, i) => (
            <FadeIn key={title} delay={i * 80} className="h-full">
              <div className="group relative flex h-full flex-col gap-3 overflow-hidden rounded-xl border border-border/60 bg-card/50 p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-500/40 hover:bg-card hover:shadow-[0_16px_40px_-20px_rgba(2,6,23,0.28)]">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(140px_90px_at_28%_0%,rgba(56,189,248,0.14),transparent_70%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                />
                <span className="relative flex size-9 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400 ring-1 ring-inset ring-sky-400/20 transition-all duration-300 group-hover:bg-sky-500/20 group-hover:ring-sky-400/40 group-hover:shadow-[0_0_18px_rgba(56,189,248,0.3)]">
                  <Icon className="size-4.5" />
                </span>
                <h3 className="relative text-base font-semibold">{title}</h3>
                <p className="relative text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* Testimonials + stats — social proof */}
      <section id="testimonials" className="relative scroll-mt-24 overflow-hidden border-t border-border/60 bg-card/30">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
        />
        <div className="relative mx-auto w-full max-w-6xl px-6 py-20">
          <FadeIn className="flex flex-col items-center gap-3 text-center">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              Loved by engineers
            </p>
            <h2 className="max-w-2xl font-heading text-2xl font-bold uppercase tracking-tight sm:text-3xl">
              The impact view teams actually read
            </h2>
          </FadeIn>
          <div className="mt-12 grid gap-4 md:grid-cols-3">
            {testimonials.map((t, i) => (
              <FadeIn key={t.name} delay={i * 80} className="h-full">
                <figure className="group relative flex h-full flex-col gap-4 overflow-hidden rounded-xl border border-border/60 bg-card/70 p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-500/40 hover:shadow-[0_16px_40px_-20px_rgba(2,6,23,0.28)]">
                  <div aria-hidden className="flex items-center gap-1 text-amber-400">
                    {Array.from({ length: 5 }).map((_, s) => (
                      <Star key={s} className="size-3.5 fill-current" aria-hidden />
                    ))}
                  </div>
                  <blockquote className="relative text-sm leading-relaxed text-muted-foreground">
                    “{t.quote}”
                  </blockquote>
                  <figcaption className="mt-auto flex items-center gap-3 border-t border-border/60 pt-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 font-mono text-[11px] font-bold text-white shadow-[0_0_14px_rgba(167,139,250,0.35)]">
                      {t.initials}
                    </span>
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold">{t.name}</span>
                      <span className="text-xs text-muted-foreground">{t.role}</span>
                    </span>
                  </figcaption>
                </figure>
              </FadeIn>
            ))}
          </div>

          {/* Stats row */}
          <dl className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {STATS.map((s, i) => (
              <FadeIn key={s.label} delay={i * 60} className="h-full">
                <div className="flex h-full flex-col items-center justify-center gap-1 rounded-xl border border-border/60 bg-card/50 px-4 py-6 text-center">
                  <dt className="order-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {s.label}
                  </dt>
                  <dd className="order-1 bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 bg-clip-text font-mono text-3xl font-bold text-transparent">
                    {s.value}
                  </dd>
                </div>
              </FadeIn>
            ))}
          </dl>
        </div>
      </section>

      {/* Trust — private by design */}
      <section id="trust" className="mx-auto w-full max-w-6xl scroll-mt-24 px-6 py-20">
        <FadeIn className="flex flex-col items-center gap-3 text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Private by design
          </p>
          <h2 className="max-w-2xl font-heading text-2xl font-bold uppercase tracking-tight sm:text-3xl">
            Your code is yours
          </h2>
        </FadeIn>
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {trust.map(({ icon: Icon, title, body }, i) => (
            <FadeIn key={title} delay={i * 80} className="h-full">
              <div className="group relative flex h-full flex-col gap-3 overflow-hidden rounded-xl border border-border/60 bg-card/50 p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-sky-500/40 hover:bg-card hover:shadow-[0_16px_40px_-20px_rgba(2,6,23,0.28)]">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(140px_90px_at_28%_0%,rgba(167,139,250,0.14),transparent_70%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                />
                <span className="relative flex size-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400 ring-1 ring-inset ring-violet-400/20 transition-all duration-300 group-hover:bg-violet-500/20 group-hover:ring-violet-400/40 group-hover:shadow-[0_0_18px_rgba(167,139,250,0.3)]">
                  <Icon className="size-4.5" />
                </span>
                <h3 className="relative text-sm font-semibold">{title}</h3>
                <p className="relative text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto w-full max-w-3xl scroll-mt-24 px-6 py-20">
        <FadeIn className="flex flex-col items-center gap-3 text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">FAQ</p>
          <h2 className="font-heading text-2xl font-bold uppercase tracking-tight sm:text-3xl">
            Frequently asked questions
          </h2>
        </FadeIn>
        <div className="mt-10 flex flex-col gap-3">
          {faqs.map(({ q, a }, i) => (
            <FadeIn key={q} delay={i * 60} className="h-full">
              <details className="group rounded-xl border border-border/60 bg-card/50 transition-colors duration-300 open:border-sky-500/40 hover:border-sky-500/40">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                  {q}
                  <ChevronDown
                    className="size-4 shrink-0 text-muted-foreground transition-transform duration-300 group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{a}</p>
              </details>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* CTA band */}
      <section className="px-6 pb-20">
        <FadeIn className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-sky-500/10 via-background to-indigo-500/10 px-6 py-14 text-center sm:px-12">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(56,189,248,0.12),transparent_60%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              backgroundImage: 'radial-gradient(circle, var(--border) 1px, transparent 1px)',
              backgroundSize: '22px 22px',
            }}
          />
          <h2 className="relative font-heading text-2xl font-bold uppercase tracking-tight sm:text-3xl">
            Change code with confidence
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
            Sign in with GitHub and map your repository in minutes — see your codebase as a graph, then
            predict the impact of every change before you make it.
          </p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-3">
            <LandingCta label="Get started free" size="lg" />
            <a
              href="#how-it-works"
              className="inline-flex h-11 items-center justify-center rounded-md px-5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              See how it works
            </a>
          </div>
        </FadeIn>
      </section>

      <footer className="relative overflow-hidden border-t border-border/60 bg-card/30">
        {/* Glowing top border accent line */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-transparent" />

        {/* Giant brand watermark — solid muted ghost. Theme-aware (muted-foreground)
            and quiet: no gradient, no glow. The vertical mask fades it into the page. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 flex select-none items-end justify-center overflow-hidden [mask-image:linear-gradient(to_top,black_40%,transparent_98%)]"
        >
          <p className="translate-y-6 text-center font-sans text-[clamp(4rem,18vw,16rem)] font-bold tracking-wide leading-none text-muted-foreground/20">
            TraceGraph
          </p>
        </div>

        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-12 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex max-w-sm flex-col gap-4">
            {/* Same brand lockup as the header — one logo everywhere */}
            <Wordmark href="/" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Understand your codebase through relationships — files, classes, functions, tests, and
              change history, mapped as a labeled property graph.
            </p>
            {/* Operational status chip */}
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border/60 bg-background/50 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur-sm">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              <span>All Systems Operational</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 text-xs sm:grid-cols-3 sm:gap-12">
            <div className="flex flex-col gap-3">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-foreground/80">Product</span>
              <a href="#how-it-works" className="text-muted-foreground transition-colors hover:text-foreground">
                How it works
              </a>
              <a href="#features" className="text-muted-foreground transition-colors hover:text-foreground">
                Features
              </a>
              <a href="#faq" className="text-muted-foreground transition-colors hover:text-foreground">
                FAQ
              </a>
            </div>

            <div className="flex flex-col gap-3">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-foreground/80">Capabilities</span>
              <a href="#features" className="text-muted-foreground transition-colors hover:text-foreground">
                Impact Analysis
              </a>
              <a href="#features" className="text-muted-foreground transition-colors hover:text-foreground">
                Graph Explorer
              </a>
              <a href="#features" className="text-muted-foreground transition-colors hover:text-foreground">
                Smell Detection
              </a>
            </div>

            <div className="col-span-2 flex flex-col gap-3 sm:col-span-1">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-foreground/80">Platform</span>
              <a
                href="https://opencypher.org"
                target="_blank"
                rel="noreferrer"
                className="font-mono text-muted-foreground transition-colors hover:text-foreground"
              >
                openCypher ↗
              </a>
              <span className="font-mono text-[11px] text-muted-foreground/60">
                CognoDB v1.0
              </span>
            </div>
          </div>
        </div>

        <div className="relative border-t border-border/40">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-6 py-4 text-[11px] text-muted-foreground/70 sm:flex-row">
            <p>© {new Date().getFullYear()} TraceGraph — Codebase intelligence, powered by CognoDB.</p>
            <p className="font-mono text-[10px] text-muted-foreground/50">Built for high-velocity engineering</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
