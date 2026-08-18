export function hasExactMirrorRule(xml, { mirrorPrefix, resolverUrl }) {
  const rules = xml.match(/<RoutingRule(?:\s[^>]*)?>[^]*?<\/RoutingRule>/g) || [];
  return rules.some((rule) => {
    const exact = tagValue(rule, "KeyPrefixEquals") === `${mirrorPrefix}/`
      && tagValue(rule, "HttpErrorCodeReturnedEquals") === "404"
      && tagValue(rule, "RedirectType") === "Mirror"
      && tagValue(rule, "MirrorURL") === resolverUrl
      && tagValue(rule, "MirrorPassQueryString") === "false"
      && tagValue(rule, "MirrorFollowRedirect") === "true"
      && tagValue(rule, "MirrorCheckMd5") === "false";
    return exact && hasSafeMirrorHeaders(rule);
  });
}

function hasSafeMirrorHeaders(rule) {
  if (/<MirrorHeaders\s*\/>/.test(rule)) return true;

  const match = /<MirrorHeaders(?:\s[^>]*)?>([^]*?)<\/MirrorHeaders>/.exec(rule);
  if (!match) return true;

  const headers = match[1];
  const passAll = tagValue(headers, "PassAll");
  return (passAll === "" || passAll === "false")
    && !/<Pass(?:\s|>)/.test(headers)
    && !/<Remove(?:\s|>)/.test(headers)
    && !/<Set(?:\s|>)/.test(headers);
}

function tagValue(xml, tag) {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)<\\/${tag}>`).exec(xml);
  return match ? unescapeXml(match[1].trim()) : "";
}

function unescapeXml(value) {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}
