import {
  BarChart3,
  BookOpen,
  FlaskConical,
  GitPullRequestArrow,
  Network,
  Radar,
  Search,
  Workflow,
} from 'lucide-react';
import type { NavItemType } from '@/components/ui/navigation-menu';

/**
 * Header navigation content for the TraceGraph marketing site. Routes are the
 * real app destinations — they resolve after authentication (or bounce to
 * sign-in). Placeholder links (`#`) exist so future pages can be wired in
 * without touching the header again.
 */
export const productLinks: NavItemType[] = [
  {
    title: 'Graph Explorer',
    href: '/graph',
    description: 'Explore the codebase as an interactive neighborhood graph',
    icon: Network,
  },
  {
    title: 'Dependency Explorer',
    href: '/dependencies',
    description: 'Follow imports, calls and inheritance from any entity',
    icon: Workflow,
  },
  {
    title: 'Impact Analysis',
    href: '/impact',
    description: 'What breaks if you change this? Ripple impact and risk paths',
    icon: Radar,
  },
  {
    title: 'Repository Overview',
    href: '/dashboard',
    description: 'Stats, composition and recent engineering activity',
    icon: BarChart3,
  },
];

export const learnLinks: NavItemType[] = [
  {
    title: 'How it works',
    href: '#how-it-works',
    description: 'From repository to risk in three steps',
    icon: BookOpen,
  },
  {
    title: 'Features',
    href: '#features',
    description: 'Everything you need to change code with confidence',
    icon: FlaskConical,
  },
  {
    title: 'Engineering history',
    href: '/dashboard',
    description: 'Commits, pull requests and issues tied to the code',
    icon: GitPullRequestArrow,
  },
  {
    title: 'Search symbols',
    href: '/graph',
    description: 'Jump straight to any class, function or file',
    icon: Search,
  },
];
