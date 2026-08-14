import { createElement } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  Braces,
  FileCode2,
  FlaskConical,
  Folder,
  GitCommitHorizontal,
  GitPullRequest,
  HelpCircle,
  Layers,
  Network,
  Share2,
  Tag,
  User,
} from 'lucide-react';
import type { NodeType, RelationshipType } from '@tracegraph/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function getNodeTypeIcon(type: NodeType | string) {
  switch (type) {
    case 'Class':
      return Boxes;
    case 'Function':
      return Braces;
    case 'File':
      return FileCode2;
    case 'Test':
      return FlaskConical;
    case 'Directory':
      return Folder;
    case 'Repository':
      return Layers;
    case 'Commit':
      return GitCommitHorizontal;
    case 'PullRequest':
      return GitPullRequest;
    case 'Issue':
      return Tag;
    case 'Developer':
      return User;
    default:
      return HelpCircle;
  }
}

export function NodeTypeIcon({
  type,
  className,
}: {
  type: NodeType | string;
  className?: string;
}) {
  return createElement(getNodeTypeIcon(type), { className });
}

export function getNodeTypeColor(type: NodeType | string) {
  switch (type) {
    case 'Class':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    case 'Function':
      return 'bg-violet-500/10 text-violet-400 border-violet-500/30';
    case 'File':
      return 'bg-sky-500/10 text-sky-400 border-sky-500/30';
    case 'Test':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
    case 'Commit':
      return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
    case 'PullRequest':
      return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
    case 'Issue':
      return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

export function RelationshipTypeBadge({
  type,
  className,
}: {
  type: RelationshipType | string;
  className?: string;
}) {
  let badgeStyle = 'bg-muted/80 text-muted-foreground border-border';
  let Icon = ArrowDownRight;

  switch (type) {
    case 'CALLS':
      badgeStyle = 'bg-violet-500/10 text-violet-400 border-violet-500/30';
      Icon = ArrowUpRight;
      break;
    case 'IMPORTS':
      badgeStyle = 'bg-sky-500/10 text-sky-400 border-sky-500/30';
      Icon = Share2;
      break;
    case 'EXTENDS':
      badgeStyle = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      Icon = Network;
      break;
    case 'TESTS':
      badgeStyle = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      Icon = FlaskConical;
      break;
    case 'MODIFIES':
    case 'CONTAINS':
    case 'AUTHORED_BY':
    case 'RELATED_TO':
      badgeStyle = 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30';
      break;
  }

  return (
    <Badge
      variant="outline"
      className={cn('flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider', badgeStyle, className)}
    >
      <Icon className="size-2.5" />
      {type}
    </Badge>
  );
}

export function NodeTypeBadge({
  type,
  className,
}: {
  type: NodeType | string;
  className?: string;
}) {
  const colorClass = getNodeTypeColor(type);

  return (
    <Badge
      variant="outline"
      className={cn('flex items-center gap-1 font-mono text-[11px]', colorClass, className)}
    >
      <NodeTypeIcon type={type} className="size-3" />
      {type}
    </Badge>
  );
}
