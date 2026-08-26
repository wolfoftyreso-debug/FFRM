/** Remove ANSI/control sequences before persisting or rendering errors. */
export function cleanErrorMessage(error: unknown, maxLength = 1000): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .slice(0, maxLength);
}
