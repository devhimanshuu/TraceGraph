import { Workflow } from 'lucide-react';
import { ComingSoon } from '@/components/layout/coming-soon';

export const metadata = { title: 'Dependency Explorer' };

export default function DependenciesPage() {
  return (
    <ComingSoon
      title="Dependency Explorer"
      icon={Workflow}
      eta="Soon"
      description="Follow imports, calls, and inheritance from any entity. Understand what depends on your code before you touch it — callers, callees, and the files that import each other."
    />
  );
}
