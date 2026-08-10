// Cross-user read access (view/download every user's albums, read-only) is
// intentionally hardcoded to one specific username rather than a role/flag
// on the users table — there's exactly one admin account and it's meant
// to stay that way without a UI for granting it to anyone else. Changing
// who has this access means changing this constant in code and shipping
// a new release, which is the point.
export const ADMIN_USERNAME = "admin";

export function isAdminUsername(username: string | null | undefined): boolean {
  return username === ADMIN_USERNAME;
}
