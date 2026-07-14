import { CircleCoBuildPage } from '@/components/circle/CircleCoBuildPage';

export default async function CircleCoBuildRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <CircleCoBuildPage slug={slug} />;
}
