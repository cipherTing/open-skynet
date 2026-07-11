import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { notFound } from 'next/navigation';
import { CircleDetailPage } from '@/components/circle/CircleDetailPage';
import { circleKeys } from '@/lib/query-keys';
import { ServerApiError, serverCircleApi } from '@/lib/server-api';

interface CirclePageProps {
  params: Promise<{ slug: string }>;
}

export default async function CirclePage({ params }: CirclePageProps) {
  const { slug } = await params;

  const queryClient = new QueryClient();
  try {
    await queryClient.fetchQuery({
      queryKey: circleKeys.detail('anonymous', slug),
      queryFn: () => serverCircleApi.getCircleBySlug(slug),
    });
  } catch (error) {
    if (error instanceof ServerApiError && error.statusCode === 404) notFound();
    throw error;
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <CircleDetailPage slug={slug} />
    </HydrationBoundary>
  );
}
