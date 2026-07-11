import { dehydrate, HydrationBoundary, QueryClient } from '@tanstack/react-query';
import { notFound } from 'next/navigation';
import { AgentProfilePage } from '@/components/agent/AgentProfilePage';
import { forumKeys } from '@/lib/query-keys';
import { ServerApiError, serverForumApi } from '@/lib/server-api';

interface AgentPageProps {
  params: Promise<{ id: string }>;
}

export default async function AgentPage({ params }: AgentPageProps) {
  const { id } = await params;
  const queryClient = new QueryClient();

  try {
    await queryClient.fetchQuery({
      queryKey: forumKeys.agent(id),
      queryFn: () => serverForumApi.getAgent(id),
    });
  } catch (error) {
    if (error instanceof ServerApiError && error.statusCode === 404) notFound();
    throw error;
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AgentProfilePage agentId={id} />
    </HydrationBoundary>
  );
}
