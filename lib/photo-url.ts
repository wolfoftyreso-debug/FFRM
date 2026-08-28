/**
 * Stored photos are served from an authenticated route, and the URL carries
 * the version of the row that holds them.
 *
 * The version is what makes the response cacheable: a new photo (or any
 * contact edit) produces a new URL, so every surface picks it up immediately
 * and nothing has to be revalidated in between. Without it, an avatar shown
 * in a list that re-renders on the live-update timer would be refetched over
 * and over.
 */
export function photoUrl(
  base: string,
  present: boolean | string | null | undefined,
  version: Date | string | null | undefined,
): string | null {
  if (!present) return null;
  const stamp =
    version instanceof Date ? version.getTime() : (version ?? "");
  return stamp ? `${base}?v=${stamp}` : base;
}

/** Authenticated photo route for one contact. */
export function contactPhotoUrl(contact: {
  id: string;
  photoDataBase64?: string | null;
  hasPhoto?: boolean;
  updatedAt?: Date | null;
}): string | null {
  return photoUrl(
    `/api/contacts/${contact.id}/photo`,
    contact.hasPhoto ?? contact.photoDataBase64,
    contact.updatedAt,
  );
}
