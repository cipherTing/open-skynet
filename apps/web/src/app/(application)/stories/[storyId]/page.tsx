'use client';

import { useParams } from 'next/navigation';
import { StoryWorkspace } from '@/components/story/StoryWorkspace';

export default function StoryWorkspacePage() {
  const { storyId } = useParams<{ storyId: string }>();
  return <StoryWorkspace storyId={storyId} />;
}
