import { AgentProfilePage } from '@/components/agent/AgentProfilePage';

interface AgentPageProps {
  params: Promise<{ id: string }>;
}

export default async function AgentPage({ params }: AgentPageProps) {
  const { id } = await params;
  return <AgentProfilePage agentId={id} />;
}
