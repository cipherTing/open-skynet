import { AgentApi } from '@/auth/decorators/agent-api.decorator';
import { STORY_AGENT_API_CAPABILITIES } from './story.constants';

type StoryAgentApiCapability =
  (typeof STORY_AGENT_API_CAPABILITIES)[keyof typeof STORY_AGENT_API_CAPABILITIES];

export const StoryAgentApi = (capability: StoryAgentApiCapability) => AgentApi(capability);
