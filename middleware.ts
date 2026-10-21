import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
// Vercel can bundle this entry independently of Next.js path aliases.
import { fallbackAccess, reviewerPathAllowed } from "./lib/access";
import { navigationUser } from "./lib/navigationIdentity";
import { timedSupabaseFetch } from "./lib/supabaseTiming";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    global: { fetch: timedSupabaseFetch("middleware") },
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        updateCookie(name, value, options);
      },
      remove(name: string, options: CookieOptions) {
        updateCookie(name, "", options);
      },
    },
  });

  function updateCookie(name: string, value: string, options: CookieOptions) {
    request.cookies.set({ name, value, ...options });
    const previousCookies = response.cookies.getAll();
    response = NextResponse.next({ request });
    previousCookies.forEach((cookie) => response.cookies.set(cookie));
    response.cookies.set({ name, value, ...options });
  }

  function withSessionCookies(target: NextResponse) {
    response.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
    return target;
  }

  const user = await navigationUser(supabase.auth);

  const pathname = request.nextUrl.pathname;
  // The JSON save handler enforces the same profile/role checks without redirecting the form.
  if (pathname === "/settings/company" && request.method === "PUT") return response;
  const isPrivate = !["/login", "/logout"].includes(pathname);
  let home = "/dashboard";
  // Pages/actions check the current user and role in requireUserProfile. Legacy PDF
  // handlers still need the role guard here; do not remove it from those endpoints.
  const legacyPdf = /^\/(?:projects\/[^/]+\/budget|sales\/[^/]+)\/pdf$/.test(pathname);
  if (user && !reviewerPathAllowed(pathname)) {
    const access = legacyPdf ? (await supabase.rpc("app_access_role")).data : null;
    const reviewer =
      access === "reviewer" ||
      fallbackAccess(user.email, "member") === "reviewer";
    if (reviewer) {
      home = "/dashboard";
      if (!reviewerPathAllowed(pathname)) {
        const url = request.nextUrl.clone();
        url.pathname = home;
        url.search = "";
        const redirected = NextResponse.redirect(url);
        return withSessionCookies(redirected);
      }
    }
  }

  if (isPrivate && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return withSessionCookies(NextResponse.redirect(url));
  }

  if (
    pathname === "/login" &&
    user &&
    request.nextUrl.searchParams.get("error") !== "unauthorized"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = home;
    return withSessionCookies(NextResponse.redirect(url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
