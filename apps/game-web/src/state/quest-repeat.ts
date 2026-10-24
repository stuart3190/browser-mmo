/** Display-only timing. Acceptance is always decided by the server. */
export function questRepeatReadyAt(
  completedAt: string | null,
  cooldownMs = 86400000,
): number | null {
  if (!completedAt) return null;
  const completed = Date.parse(completedAt);
  return Number.isFinite(completed) ? completed + cooldownMs : null;
}
export function questRepeatWait(readyAt: number, now: number): string {
  const minutes = Math.max(0, Math.ceil((readyAt - now) / 60000));
  if (!minutes) return 'Rest complete. Speak to the quest giver again to check availability.';
  const hours = Math.floor(minutes / 60),
    remainder = minutes % 60;
  return `Available again in ${hours ? `${hours}h ` : ''}${remainder}m`;
}
