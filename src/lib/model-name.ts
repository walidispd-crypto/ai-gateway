export const MAX_MODEL_NAME_LENGTH = 100;

// Provider catalogues use dots, dashes, slashes and colons (`vendor/model:tag`), but never
// spaces — so a stray space is treated as a validation error rather than trimmed silently.
export const MODEL_NAME_PATTERN = /^[A-Za-z0-9._:/-]+$/;

export const MODEL_NAME_HINT = "Hanya huruf, angka, dan . _ : / - tanpa spasi (1-100 karakter).";

export function isValidModelName(value: string): boolean {
  return (
    value.length > 0 && value.length <= MAX_MODEL_NAME_LENGTH && MODEL_NAME_PATTERN.test(value)
  );
}

/** Trims surrounding whitespace only; anything else must already match the pattern. */
export function normalizeModelName(value: string): string {
  return value.trim();
}
