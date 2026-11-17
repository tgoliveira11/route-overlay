/** Browser session id for a confirmed route. The id is not a Google identifier. */

export const CONFIRMATION_SESSION_KEY = "route-overlay.confirmation-session";

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function assertSessionId(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return SESSION_ID.test(normalized) ? normalized : null;
}

export function confirmationSessionId(
  storage: { getItem(key: string): string | null; setItem(key: string, value: string): void },
  createId: () => string,
): string {
  const existing = storage.getItem(CONFIRMATION_SESSION_KEY);
  if (existing) {
    const valid = assertSessionId(existing);
    if (valid) {
      return valid;
    }
  }
  const created = assertSessionId(createId());
  if (!created) {
    throw new Error("The confirmation session id was not a UUID.");
  }
  storage.setItem(CONFIRMATION_SESSION_KEY, created);
  return created;
}
