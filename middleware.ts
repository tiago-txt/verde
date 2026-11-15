import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/jwt";

const PUBLIC_PREFIXES = [
  "/login",
  "/cadastro",
  "/api/health",
  "/manifest.webmanifest",
  "/sw.js",
  "/icons/",
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  );
}

/**
 * Chrome/Edge bloqueiam fetch de páginas em HTTP não seguro para endereços da
 * rede local (Private Network Access). Estes cabeçalhos liberam apenas a mesma
 * origem, sem abrir CORS para outros sites.
 */
function privateNetworkHeaders(
  request: NextRequest,
  response: NextResponse,
): NextResponse {
  const origin = request.headers.get("origin");
  response.headers.set("Access-Control-Allow-Private-Network", "true");
  if (!origin) return response;

  try {
    const originUrl = new URL(origin);
    if (originUrl.host !== request.nextUrl.host) return response;
  } catch {
    return response;
  }

  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.append("Vary", "Origin");
  return response;
}

export async function middleware(request: NextRequest) {
  if (request.method === "OPTIONS") {
    const preflight = new NextResponse(null, { status: 204 });
    preflight.headers.set(
      "Access-Control-Allow-Methods",
      "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
    );
    preflight.headers.set(
      "Access-Control-Allow-Headers",
      request.headers.get("access-control-request-headers") ??
        "content-type, next-router-state-tree, rsc, next-url",
    );
    preflight.headers.set("Access-Control-Max-Age", "600");
    return privateNetworkHeaders(request, preflight);
  }

  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session && !isPublic(pathname)) {
    if (pathname.startsWith("/api/")) {
      return privateNetworkHeaders(
        request,
        NextResponse.json({ error: "Não autenticado" }, { status: 401 }),
      );
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return privateNetworkHeaders(
      request,
      NextResponse.redirect(loginUrl),
    );
  }

  return privateNetworkHeaders(request, NextResponse.next());
}

export const config = {
  matcher: [
    /*
     * Tudo, exceto assets estáticos do Next, arquivos públicos comuns
     * e o favicon.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)",
  ],
};
