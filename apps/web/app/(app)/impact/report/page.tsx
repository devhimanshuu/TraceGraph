import { Suspense } from 'react';
import { ImpactReport } from '@/components/impact/impact-report';

export const metadata = {
  title: 'Impact Report — TraceGraph',
  description:
    'A shareable, printable impact analysis report: summary, affected components, evidence paths, tests, and engineering history.',
};

export default function ImpactReportPage() {
  return (
    <Suspense fallback={null}>
      <ImpactReport />
    </Suspense>
  );
}
