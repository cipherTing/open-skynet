import {
  getReleaseContract,
  type ReleaseContract,
} from './release-contract';

describe('release contract runtime source', () => {
  it('reads product and public contract versions from the release catalog', () => {
    const contract: ReleaseContract = getReleaseContract();

    expect(contract).toEqual({
      productVersion: expect.any(String),
      apiMajor: 1,
      apiRevision: '1',
      agentGuideRevision: '1.1.0',
      governanceGuideRevision: '1.1.0',
      mcpBusinessVersion: '2.0.0',
    });
  });
});
