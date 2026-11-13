/**
 * A work domain is the whole SSO routing decision: it names the organisation
 * whose identity provider should be asked. It is therefore validated as a DNS
 * name rather than accepted as free text — a value carrying a scheme, a path or
 * a space is a paste of a URL, not a domain, and forwarding it would build a
 * login URL that is wrong at best.
 *
 * Rules (deliberately strict, with no guessing):
 *   - 1–253 characters (the DNS maximum for a serialised name);
 *   - at least two labels, so there is at least one dot;
 *   - each label 1–63 characters, alphanumeric at both ends, hyphens inside;
 *   - therefore no scheme (`://`), no path/port, no whitespace and no underscore.
 *
 * The trailing dot of an absolute FQDN is rejected: every label must be
 * non-empty, and the app never needs the root label.
 */
const MAX_DOMAIN_LENGTH = 253
const MAX_LABEL_LENGTH = 63

const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i

export function isDomainLike(value: string): boolean {
  if (typeof value !== 'string') return false
  if (value.length === 0 || value.length > MAX_DOMAIN_LENGTH) return false
  if (!value.includes('.')) return false

  return value.split('.').every(
    (label) =>
      label.length > 0 && label.length <= MAX_LABEL_LENGTH && LABEL_PATTERN.test(label),
  )
}
