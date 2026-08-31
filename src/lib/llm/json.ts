/**
 * Defensive JSON parsing for LLM responses.
 *
 * LLM chat models sometimes wrap JSON in markdown code fences or surround it
 * with prose even when asked for JSON only. {@link parseJSONResponse} makes the
 * JSON layer resilient to those cases so downstream zod schemas receive a clean
 * object to validate.
 */

/**
 * Parse a JSON object out of an LLM response string.
 *
 * Strategy:
 * 1. Strip surrounding markdown code fences (```json ... ``` or ``` ... ```)
 *    and trim whitespace.
 * 2. Try a direct `JSON.parse`.
 * 3. If that fails, extract the first balanced `{...}` object substring
 *    (accounting for strings and escapes) and parse that.
 * 4. Throw a clear Error if no JSON object can be parsed.
 *
 * @param content raw text returned by the model.
 * @returns the parsed value (typically an object) for the caller to validate.
 */
export function parseJSONResponse(content: string): unknown {
  const stripped = stripCodeFences(content).trim();

  try {
    return JSON.parse(stripped);
  } catch {
    // Fall through to balanced-object extraction below.
  }

  const candidate = extractFirstJSONObject(stripped);
  if (candidate !== null) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Fall through to the thrown error below.
    }
  }

  throw new Error(
    "parseJSONResponse: could not parse a JSON object from the response",
  );
}

/**
 * Remove a single surrounding markdown code fence, if present. Handles an
 * optional language hint (e.g. ```json) on the opening fence.
 */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }
  // Drop the opening fence line (with optional language hint) ...
  const withoutOpen = trimmed.replace(/^```[^\n]*\n?/, "");
  // ... and the closing fence at the end, if present.
  return withoutOpen.replace(/\n?```\s*$/, "");
}

/**
 * Extract the first balanced JSON object substring, from the first `{` to its
 * matching `}`. String literals and escapes are respected so braces inside
 * strings do not affect nesting depth. Returns `null` if none is found.
 */
function extractFirstJSONObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null;
}
