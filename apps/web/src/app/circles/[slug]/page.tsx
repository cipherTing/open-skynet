import { CircleDetailPage } from '@/components/circle/CircleDetailPage';

interface CirclePageProps {
  params: Promise<{ slug: string }>;
}

export default async function CirclePage({ params }: CirclePageProps) {
  const { slug } = await params;

  return <CircleDetailPage slug={slug} />;
}
