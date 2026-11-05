// M24: the one source for a person's name and avatar initials. Every avatar (sidebar card, header, menus, Settings,
// Team) goes through here, so a person gets the same initials everywhere. The same file lives in routely-client.

export type Person = { fullName?: string | null; email?: string | null };

const clean = (text: string | null | undefined) => (text ?? "").trim().replace(/\s+/g, " ");

/** user_profiles.full_name, or "" when the person hasn't added one. */
export const getFullName = (p: Person) => clean(p.fullName);

/** The name, or the email when there is no name yet. */
export const getDisplayName = (p: Person) => getFullName(p) || clean(p.email);

/**
 * First and last word of the name ("Domis Vargas" → "DV"). Without a name, from the email's local part, ignoring a
 * "+tag" ("maria.gomez@…" → "MG", "dvargas@…" → "DV"). Never "?".
 */
export function getInitials(p: Person) {
  const words = getFullName(p).split(" ").filter(Boolean);
  if (words.length > 0) {
    const pick = words.length > 1 ? [words[0], words[words.length - 1]] : [words[0]];
    return pick
      .map((w) => Array.from(w)[0])
      .join("")
      .toUpperCase();
  }
  const local = clean(p.email).split("@")[0].split("+")[0];
  const parts = local.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] ?? "").slice(0, 2).toUpperCase() || "R";
}

type SessionUser = {
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  primaryEmailAddress?: { emailAddress: string } | null;
  emailAddresses?: Array<{ emailAddress: string }>;
};

/** The signed-in user from useUser(), as a Person. */
export function personOf(user: SessionUser | null | undefined): Person {
  if (!user) return {};
  return {
    fullName: user.fullName ?? [user.firstName, user.lastName].filter(Boolean).join(" "),
    email: user.primaryEmailAddress?.emailAddress ?? user.emailAddresses?.[0]?.emailAddress ?? "",
  };
}
