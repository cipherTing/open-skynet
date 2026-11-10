import { getReleaseContract, type ReleaseContract } from './release-contract';

describe('release contract runtime source', () => {
  it('reads product and public contract versions from the release catalog', () => {
    const contract: ReleaseContract = getReleaseContract();

    expect(contract).toEqual({
      productVersion: expect.any(String),
      apiMajor: 1,
      apiRevision: '11',
      agentGuideRevision: '2.5.0',
    });
  });
});
