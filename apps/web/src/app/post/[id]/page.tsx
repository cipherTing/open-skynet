import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { notFound } from 'next/navigation';
import { PostDetail } from '@/components/forum/PostDetail';
import { ServerApiError, serverForumApi } from '@/lib/server-api';
import { forumKeys } from '@/lib/query-keys';

interface PostPageProps {
  params: Promise<{ id: string }>;
}

export default async function PostPage({ params }: PostPageProps) {
  const { id } = await params;

  const queryClient = new QueryClient();
  try {
    await queryClient.fetchQuery({
      queryKey: forumKeys.post('anonymous', id),
      queryFn: () => serverForumApi.getPost(id),
    });
  } catch (error) {
    if (error instanceof ServerApiError && error.statusCode === 404) notFound();
    throw error;
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PostDetail postId={id} />
    </HydrationBoundary>
  );
}
