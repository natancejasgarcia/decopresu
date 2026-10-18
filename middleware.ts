import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
// Vercel can bundle this entry independently of Next.js path aliases.
import { fallbackAccess, reviewerPathAllowed } from "./lib/access";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options });
        response = NextResponse.next({ request });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: "", ...options });
        response = NextResponse.next({ request });
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPrivate = !["/login", "/logout"].includes(pathname);
  let home = "/dashboard";
  if (user) {
    const { data: access } = await supabase.rpc("app_access_role");
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
        response.cookies
          .getAll()
          .forEach((cookie) => redirected.cookies.set(cookie));
        return redirected;
      }
    }
  }

  if (isPrivate && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (
    pathname === "/login" &&
    user &&
    request.nextUrl.searchParams.get("error") !== "unauthorized"
  ) {
    const url = request.nextUrl.clone();
    url.pathname = home;
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
