import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/espace", "/connexion-site", "/rapport", "/nouveau-mot-de-passe", "/premiere-connexion"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    const path = request.nextUrl.pathname;
    if (PROTECTED.some((p) => path === p || path.startsWith(p + "/"))) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "?setup=supabase";
      return NextResponse.redirect(url);
    }
    return response;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  if (!user && PROTECTED.some((p) => path === p || path.startsWith(p + "/"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    url.search = `?suite=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }
  if (user && path !== "/premiere-connexion") {
    const { data: profile } = await supabase.from("profiles").select("must_change_credentials").eq("id", user.id).maybeSingle();
    if (profile?.must_change_credentials) {
      const url = request.nextUrl.clone();
      url.pathname = "/premiere-connexion";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }
  return response;
}
