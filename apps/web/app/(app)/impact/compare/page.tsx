import { Suspense } from 'react';
import { ImpactCompare } from '@/components/impact/impact-compare';

export const metadata = {
  title: 'Compare Impact Reports — TraceGraph',
  description:
    'Render two impact analyses side by side on one shareable, printable page — compare blast radius before a refactor.',
};

export default function ImpactComparePage() {
  return (
    <Suspense fallback={null}>
      <ImpactCompare />
    </Suspense>
  );
}
