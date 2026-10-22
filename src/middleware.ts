import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, getSessionSecret, verifySessionToken } from "@/server/auth";

const PUBLIC_PAGES = new Set(["/login"]);
const PUBLIC_APIS = new Set(["/api/login"]);

// Framing is denied by default. The flag exists only for hosted preview panes that embed
// the app in an iframe; it must stay unset on Vercel.
const allowEmbed = process.env.ALLOW_IFRAME_EMBED === "1";

function securityHeaders(nonce: string): Headers {
  const isDev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    allowEmbed ? "frame-ancestors 'self' https:" : "frame-ancestors 'none'",
    "frame-src 'none'",
  ].join("; ");

  return new Headers({
    "Content-Security-Policy": csp,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    ...(allowEmbed ? {} : { "X-Frame-Options": "DENY" }),
  });
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  const nonce = btoa(crypto.randomUUID());
  const secret = getSessionSecret();
  const authenticated = secret
    ? await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, secret)
    : false;

  if (authenticated && PUBLIC_PAGES.has(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const isPublic = PUBLIC_PAGES.has(pathname) || PUBLIC_APIS.has(pathname);

  if (!authenticated && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Tidak terautentikasi." }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    const target = `${pathname}${search}`;
    if (target !== "/") loginUrl.searchParams.set("next", target);
    return NextResponse.redirect(loginUrl);
  }

  const headers = securityHeaders(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", headers.get("Content-Security-Policy") ?? "");

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  headers.forEach((value, key) => response.headers.set(key, value));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
