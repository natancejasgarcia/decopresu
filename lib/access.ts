export type AccessRole = "owner" | "workspace" | "reviewer";
export const REVIEWER_EMAIL = "decoralia1977@gmail.com";
export function fallbackAccess(
  email: string | undefined,
  role: string,
): AccessRole {
  if (email?.toLowerCase() === REVIEWER_EMAIL) return "reviewer";
  return role === "admin" ? "owner" : "workspace";
}
export function reviewerPathAllowed(path: string) {
  return (
    path === "/dashboard" ||
    path === "/finance/scan" ||
    /^\/finance\/scan\/[^/]+\/file$/.test(path) ||
    path === "/validations" ||
    path.startsWith("/validations/") ||
    path === "/logout" ||
    path === "/login"
  );
}
