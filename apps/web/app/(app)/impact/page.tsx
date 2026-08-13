import { Radar } from 'lucide-react';
import { ComingSoon } from '@/components/layout/coming-soon';

export const metadata = { title: 'Impact Analysis' };

export default function ImpactPage() {
  return (
    <ComingSoon
      title="Impact Analysis"
      icon={Radar}
      eta="Soon"
      description="Ask “what breaks if I change this?” and get every component affected — directly or indirectly — with the paths that explain why, plus the tests that cover them."
    />
  );
}
