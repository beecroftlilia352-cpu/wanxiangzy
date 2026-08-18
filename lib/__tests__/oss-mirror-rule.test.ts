import { describe, expect, it } from "vitest";

// The deployment utility is native ESM so it can run directly under Node.
import { hasExactMirrorRule } from "../../scripts/oss-mirror-rule.mjs";

const expected = {
  mirrorPrefix: "generated-results/original/mirror",
  resolverUrl: "https://pixel-diffusion.com/api/oss-mirror-source/",
};

function websiteXml(mirrorHeaders = "") {
  return `<WebsiteConfiguration><RoutingRules><RoutingRule>
    <Condition><KeyPrefixEquals>${expected.mirrorPrefix}/</KeyPrefixEquals><HttpErrorCodeReturnedEquals>404</HttpErrorCodeReturnedEquals></Condition>
    <Redirect><RedirectType>Mirror</RedirectType><MirrorURL>${expected.resolverUrl}</MirrorURL>
    <MirrorPassQueryString>false</MirrorPassQueryString><MirrorFollowRedirect>true</MirrorFollowRedirect><MirrorCheckMd5>false</MirrorCheckMd5>
    ${mirrorHeaders}</Redirect>
  </RoutingRule></RoutingRules></WebsiteConfiguration>`;
}

describe("OSS mirror rule verification", () => {
  it("accepts the exact rule without a MirrorHeaders block", () => {
    expect(hasExactMirrorRule(websiteXml(), expected)).toBe(true);
  });

  it("accepts the safe PassAll=false block materialized by OSS", () => {
    expect(hasExactMirrorRule(
      websiteXml("<MirrorHeaders><PassAll>false</PassAll></MirrorHeaders>"),
      expected,
    )).toBe(true);
  });

  it.each([
    "<MirrorHeaders><PassAll>true</PassAll></MirrorHeaders>",
    "<MirrorHeaders><Pass>authorization</Pass></MirrorHeaders>",
    "<MirrorHeaders><Remove>x-test</Remove></MirrorHeaders>",
    "<MirrorHeaders><Set><Key>x-test</Key><Value>unsafe</Value></Set></MirrorHeaders>",
  ])("rejects header forwarding or mutation: %s", (headers) => {
    expect(hasExactMirrorRule(websiteXml(headers), expected)).toBe(false);
  });
});
