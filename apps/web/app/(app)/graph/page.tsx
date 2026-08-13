import { Network } from 'lucide-react';
import { ComingSoon } from '@/components/layout/coming-soon';

export const metadata = { title: 'Graph Explorer' };

export default function GraphPage() {
  return (
    <ComingSoon
      title="Graph Explorer"
      icon={Network}
      eta="Next module"
      description="An interactive graph of the codebase — zoom, pan, and inspect how files, classes, and functions connect. You'll be able to select any entity and explore its neighborhood here."
    />
  );
}
