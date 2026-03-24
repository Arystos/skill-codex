import { MAX_RESPONSE_CHARS } from "../config/constants.js";

export function truncateResponse(
  text: string,
  maxChars: number = MAX_RESPONSE_CHARS,
): string {
  if (text.length <= maxChars) return text;

  const omitted = text.length - maxChars;
  return (
    text.slice(0, maxChars) +
    `\n\n[Response truncated at ${maxChars} characters. ${omitted} characters omitted.]`
  );
}
