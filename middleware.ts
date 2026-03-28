/**
 * Next.js Edge Middleware – JWT Authentication Guard
 *
 * Runs at the edge (before the route handler) for all paths matched by
 * `config.matcher`. Validates the JWT from the Authorization: Bearer header
 * or the HTTP-only cookie and, if valid, forwards the decoded user identity
 * as custom request headers so downstream route handlers can read them without
 * re-verifying the token.
 *
 * ─── Route Access Policy ──────────────────────────────────────────────────────
 *
 * PUBLIC (no authentication required) – NOT in matcher:
 *   /                        → Map home page (browse events without login)
 *   /events/[id]             → Event detail page (view details without login)
 *   /login                   → Login page
 *   /signup                  → Signup / registration page
 *   /api/events              → Event listing API (map markers, list view)
 *   /api/events/[id]         → Single event detail API
 *   /api/auth/login          → Login endpoint
 *   /api/auth/signup         → Registration endpoint
 *
 * PROTECTED (requires valid JWT) – included in matcher:
 *   /api/bookmarks/**        → Bookmark management (requires login)
 *   /api/user/**             → User profile & settings (requires login)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * NOTE: This file MUST NOT import anything that uses Node.js-only modules
 * (e.g. bcryptjs) because it runs in the Edge runtime. JWT verification
 * uses `jose` which is Edge-compatible.
 */

import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import {
  COOKIE_NAME,
  AUTH_HEADER_USER_ID,
  AUTH_HEADER_USER_EMAIL,
} from "./src/lib/auth-constants";

// ─── Re-exports ───────────────────────────────────────────────────────────────
// Consumers can import header constants from this file for backwards compat.
export { AUTH_HEADER_USER_ID, AUTH_HEADER_USER_EMAIL };

// ─── Token Extraction ─────────────────────────────────────────────────────────

function extractToken(request: NextRequest): string | null {
  // Priority 1: Authorization: Bearer <token>
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  // Priority 2: HTTP-only cookie
  const cookieToken = request.cookies.get(COOKIE_NAME)?.value;
  if (cookieToken) return cookieToken;

  return null;
}

// ─── Middleware Handler ───────────────────────────────────────────────────────

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const token = extractToken(request);

  if (!token) {
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401 }
    );
  }

  try {
    const secret = new TextEncoder().encode(
      process.env.JWT_SECRET || "fallback-secret-change-in-production"
    );

    const { payload } = await jwtVerify(token, secret);

    const userId = payload.userId as string | undefined;
    const email = payload.email as string | undefined;

    if (!userId || !email) {
      return NextResponse.json(
        { error: "유효하지 않은 인증 토큰입니다." },
        { status: 401 }
      );
    }

    // Forward decoded identity to the route handler via request headers.
    // Route handlers can read these with request.headers.get(AUTH_HEADER_USER_ID).
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set(AUTH_HEADER_USER_ID, userId);
    requestHeaders.set(AUTH_HEADER_USER_EMAIL, email);

    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  } catch {
    // Token is expired or otherwise invalid
    return NextResponse.json(
      { error: "인증이 만료되었습니다. 다시 로그인해주세요." },
      { status: 401 }
    );
  }
}

// ─── Route Matcher ────────────────────────────────────────────────────────────

export const config = {
  /**
   * Apply this middleware ONLY to routes that require authentication.
   *
   * All routes NOT listed here are publicly accessible without a JWT token,
   * including the map home page (/), event detail pages (/events/[id]),
   * auth endpoints (/api/auth/*), and the events API (/api/events/*).
   *
   * To protect a new route, add its prefix here — do NOT add public routes.
   */
  matcher: [
    // User-specific bookmark management
    "/api/bookmarks/:path*",
    // User profile / account settings
    "/api/user/:path*",
  ],
};
