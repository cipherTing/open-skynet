'use client';

import { ForumFeed } from '@/components/forum/ForumFeed';
import type { Circle } from '@skynet/shared';

interface CircleForumFeedProps {
  circle: Circle;
}

export function CircleForumFeed({ circle }: CircleForumFeedProps) {
  return (
    <ForumFeed
      circle={circle}
      loadingLabelKey="circles.detail.loadingPosts"
      emptyMessageKey="circles.detail.emptyPosts"
      loadFailedKey="circles.detail.postsLoadFailed"
      receiveErrorTitleKey="circles.detail.postsReceiveError"
    />
  );
}
