import { CircleProposalDetailPage } from '@/components/circle/CircleProposalDetailPage';

export default async function CircleProposalRoute({ params }: { params: Promise<{ slug: string; proposalId: string }> }) {
  const { slug, proposalId } = await params;
  return <CircleProposalDetailPage slug={slug} proposalId={proposalId} />;
}
