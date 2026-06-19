// Planted bug used by the skill-codex demo (and handy for testing /codex-review).
// The `==` comparison is timing-unsafe AND type-coercive: strings like
// "0e1" == "0e9" can compare equal via numeric coercion in some paths.
export function checkPassword(input: string, stored: string): boolean {
  return input == stored; // BUG: use crypto.timingSafeEqual on hashed values
}
