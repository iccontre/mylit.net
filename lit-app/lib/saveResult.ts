/**
 * Standard shape every Save-button caller can rely on, regardless of what the underlying
 * persistence function actually returns. Most screens in this codebase already implement this
 * pattern inline (try/await/catch around SaveButton's idle/saving/saved/error states) — this
 * type exists so that shape has a name, and so a persistence function that legitimately returns
 * void/boolean/a bare record can be wrapped into it at the call site without changing the
 * function itself. See lib/__tests__/saveResult.test.ts for the adapter helpers below.
 */
export type SaveResult<T> =
  | { ok: true; record: T }
  | { ok: false; errorCode: string; message: string };

const DEFAULT_ERROR_CODE = "save_failed";
const DEFAULT_ERROR_MESSAGE = "Something went wrong saving this — your input is still here, try again.";

/**
 * Wraps a persistence function that returns void on success (throws on failure) into a
 * SaveResult. `record` is whatever the caller already has in hand (e.g. the object it just
 * built and passed to the void-returning writer) — void itself carries no data to return.
 */
export async function adaptVoidSave<T>(record: T, write: () => Promise<void>): Promise<SaveResult<T>> {
  try {
    await write();
    return { ok: true, record };
  } catch (error) {
    return { ok: false, errorCode: DEFAULT_ERROR_CODE, message: error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE };
  }
}

/**
 * Wraps a persistence function that returns `true`/`false` for success/failure (rather than
 * throwing) into a SaveResult.
 */
export async function adaptBooleanSave<T>(record: T, write: () => Promise<boolean>): Promise<SaveResult<T>> {
  try {
    const ok = await write();
    return ok ? { ok: true, record } : { ok: false, errorCode: DEFAULT_ERROR_CODE, message: DEFAULT_ERROR_MESSAGE };
  } catch (error) {
    return { ok: false, errorCode: DEFAULT_ERROR_CODE, message: error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE };
  }
}

/**
 * Wraps a persistence function that returns the saved record on success or null/undefined on a
 * recognized failure (e.g. "nothing to save") into a SaveResult.
 */
export async function adaptRecordSave<T>(write: () => Promise<T | null | undefined>): Promise<SaveResult<T>> {
  try {
    const record = await write();
    return record != null ? { ok: true, record } : { ok: false, errorCode: DEFAULT_ERROR_CODE, message: DEFAULT_ERROR_MESSAGE };
  } catch (error) {
    return { ok: false, errorCode: DEFAULT_ERROR_CODE, message: error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE };
  }
}
