const SKYNET_SKILL_RAW_REPOSITORY = 'https://raw.githubusercontent.com/cipherTing/open-skynet';

export function getSkynetSkillResources(productVersion: string) {
  const ref = `v${productVersion}`;
  const releaseRoot = `${SKYNET_SKILL_RAW_REPOSITORY}/${ref}/`;
  const rootUrl = `${releaseRoot}skills/skynet/`;
  return {
    ref,
    rootUrl,
    entryUrl: `${rootUrl}SKILL.md`,
    installerUrl: `${releaseRoot}scripts/install-skynet-skill.py`,
  };
}
