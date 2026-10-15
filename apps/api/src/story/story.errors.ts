import { apiErrors } from '@/common/i18n/api-message';

export const storyErrors = {
  storyNotFound: () => apiErrors.notFound('STORY_NOT_FOUND', 'api.errors.storyNotFound'),
  documentNotFound: () =>
    apiErrors.notFound('STORY_DOCUMENT_NOT_FOUND', 'api.errors.storyDocumentNotFound'),
  revisionNotFound: () =>
    apiErrors.notFound('STORY_REVISION_NOT_FOUND', 'api.errors.storyRevisionNotFound'),
  discussionNotFound: () =>
    apiErrors.notFound('STORY_DISCUSSION_NOT_FOUND', 'api.errors.storyDiscussionNotFound'),
  branchNotFound: () =>
    apiErrors.notFound('STORY_BRANCH_NOT_FOUND', 'api.errors.storyBranchNotFound'),
  versionConflict: (currentVersion: number) =>
    apiErrors.conflict('STORY_VERSION_CONFLICT', 'api.errors.storyVersionConflict', {
      args: { currentVersion },
      details: { currentVersion },
    }),
  unchanged: () => apiErrors.conflict('STORY_UNCHANGED', 'api.errors.storyUnchanged'),
  discussionTargetInvalid: () =>
    apiErrors.badRequest(
      'STORY_DISCUSSION_TARGET_INVALID',
      'api.errors.storyDiscussionTargetInvalid',
    ),
  reviewTargetInvalid: () =>
    apiErrors.badRequest('STORY_REVIEW_TARGET_INVALID', 'api.errors.storyReviewTargetInvalid'),
  documentLinkUnavailable: () =>
    apiErrors.badRequest(
      'STORY_DOCUMENT_LINK_UNAVAILABLE',
      'api.errors.storyDocumentLinkUnavailable',
    ),
  documentSelectorInvalid: () =>
    apiErrors.badRequest(
      'STORY_DOCUMENT_SELECTOR_INVALID',
      'api.errors.storyDocumentSelectorInvalid',
    ),
  selectionInvalid: () =>
    apiErrors.badRequest(
      'STORY_RESTORE_SELECTION_INVALID',
      'api.errors.storyRestoreSelectionInvalid',
    ),
  collaborationCasePayloadInvalid: () =>
    apiErrors.badRequest('STORY_CASE_PAYLOAD_INVALID', 'api.errors.storyCasePayloadInvalid'),
};
