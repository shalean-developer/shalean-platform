/**
 * Google-compatible robots.txt path matching helpers.
 *
 * robots.txt is a crawl hint for compliant bots — it is NOT an access-control
 * or security mechanism. Authenticated / operational cleaner routes must still
 * enforce auth in middleware and application code.
 */

export type RobotsPathRuleSet = {
  readonly allow: readonly string[];
  readonly disallow: readonly string[];
};

/**
 * Convert a robots Allow/Disallow pattern into a RegExp.
 * Supports Google's `$` end anchor and `*` wildcards.
 */
export function robotsPatternToRegExp(pattern: string): RegExp {
  let body = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i]!;
    if (ch === "*") {
      body += ".*";
      continue;
    }
    if (ch === "$" && i === pattern.length - 1) {
      body += "$";
      continue;
    }
    if (/[.+?^${}()|[\]\\]/.test(ch)) {
      body += `\\${ch}`;
      continue;
    }
    body += ch;
  }
  if (!pattern.endsWith("$")) {
    // Prefix match (Google treats paths as prefixes unless `$` anchors the end).
    body += ".*";
  }
  return new RegExp(`^${body}`);
}

/**
 * Test whether `pathname` matches a robots Allow/Disallow pattern.
 * Evaluates the actual requested path only — does not invent trailing-slash variants.
 */
export function pathMatchesRobotsPattern(pathname: string, pattern: string): boolean {
  if (!pattern) return false;
  const p = pathname.trim() || "/";
  return robotsPatternToRegExp(pattern).test(p);
}

type MatchedRule = { readonly pattern: string; readonly kind: "allow" | "disallow" };

/**
 * Returns whether a path is blocked after applying Google's longest-match rule.
 * Equal-length Allow vs Disallow → Allow wins (more permissive).
 */
export function isPathDisallowedByRobots(pathname: string, rules: RobotsPathRuleSet): boolean {
  const matches: MatchedRule[] = [];
  for (const pattern of rules.disallow) {
    if (pathMatchesRobotsPattern(pathname, pattern)) {
      matches.push({ pattern, kind: "disallow" });
    }
  }
  for (const pattern of rules.allow) {
    if (pathMatchesRobotsPattern(pathname, pattern)) {
      matches.push({ pattern, kind: "allow" });
    }
  }
  if (matches.length === 0) return false;

  let best = matches[0]!;
  for (const m of matches.slice(1)) {
    if (m.pattern.length > best.pattern.length) {
      best = m;
      continue;
    }
    if (m.pattern.length === best.pattern.length && m.kind === "allow" && best.kind === "disallow") {
      best = m;
    }
  }
  return best.kind === "disallow";
}
