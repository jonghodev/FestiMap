/**
 * JWT Authentication Middleware Utilities
 *
 * Provides helper functions for protecting API route handlers.
 * Works in concert with the Edge middleware (middleware.ts) which has already
 * validated the JWT for routes under /api/bookmarks/** and /api/user/**.
 *
 * Two-tier authentication strategy:
 *   1. Fast path  – read the user identity from custom headers forwarded by the
 *                   Edge middleware (no crypto work, zero overhead).
 *   2. Slow path  – fall back to full JWT verification when the headers are
 *                   absent (e.g. on routes not covered by the Edge middleware,
 *                   or during local development with edge middleware disabled).
 *
 * Usage patterns:
 *   1. getAuthUserFromHeaders(req) – reads middleware-forwarded headers; returns
 *                                    JWTPayload or null.  O(1), no crypto.
 *   2. getAuthUser(req)            – fast path first, then full JWT verify.
 *                                    Returns JWTPayload or null (non-blocking).
 *   3. requireAuth(req)            – returns { user } or { error: 401 response }.
 *   4. withAuth(handler)           – HOF wrapping a route handler with auth check.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyToken, COOKIE_NAME, JWTPayload } from "./auth";
import {
  AUTH_HEADER_USER_ID,
  AUTH_HEADER_USER_EMAIL,
} from "./auth-constants";

// ─── Fast-Path: Read Headers Forwarded by the Edge Middleware ─────────────────

/**
 * Reads the authenticated user identity from the custom request headers that
 * the Edge middleware (`middleware.ts`) injects after verifying the JWT.
 *
 * Returns `null` if either header is missing (e.g. the route is not covered
 * by the Edge middleware).
 *
 * This is an O(1) operation – no cryptographic work is performed.
 *
 * @example
 * export async function GET(request: NextRequest) {
 *   const user = getAuthUserFromHeaders(request);
 *   if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
 *   // user.userId, user.email are available here
 * }
 */
export function getAuthUserFromHeaders(
  request: NextRequest
): JWTPayload | null {
  const userId = request.headers.get(AUTH_HEADER_USER_ID);
  const email = request.headers.get(AUTH_HEADER_USER_EMAIL);

  if (!userId || !email) return null;
  return { userId, email };
}

// ─── Slow-Path: Full JWT Extraction & Verification ────────────────────────────

/**
 * Extracts a raw JWT string from the request.
 * Priority: Authorization: Bearer <token>  →  HTTP-only cookie.
 */
function extractToken(request: NextRequest): string | null {
  // 1. Authorization header
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  // 2. HTTP-only cookie (set by the login endpoint)
  const cookieToken = request.cookies.get(COOKIE_NAME)?.value;
  if (cookieToken) return cookieToken;

  return null;
}

// ─── Combined Helper ──────────────────────────────────────────────────────────

/**
 * Resolves the authenticated user by trying the fast path (middleware headers)
 * first, then falling back to full JWT verification.
 *
 * Returns `null` when the request is unauthenticated. Does NOT produce an HTTP
 * response – use this on partially-public routes.
 *
 * @example
 * const user = await getAuthUser(request);
 * if (user) {
 *   // logged-in behaviour
 * }
 */
export async function getAuthUser(
  request: NextRequest
): Promise<JWTPayload | null> {
  // Fast path: headers already set by the Edge middleware
  const fromHeaders = getAuthUserFromHeaders(request);
  if (fromHeaders) return fromHeaders;

  // Slow path: verify the token ourselves (no Edge middleware on this route)
  const token = extractToken(request);
  if (!token) return null;
  return verifyToken(token);
}

// ─── requireAuth ─────────────────────────────────────────────────────────────

/**
 * Validates the JWT (fast path → slow path) and returns either the decoded
 * user payload or a ready-to-return 401 `NextResponse`.
 *
 * Useful for routes where every HTTP method requires authentication.
 *
 * @example
 * const { user, error } = await requireAuth(request);
 * if (error) return error;
 * // user is JWTPayload here – user.userId, user.email
 */
export async function requireAuth(request: NextRequest): Promise<
  | { user: JWTPayload; error: null }
  | { user: null; error: NextResponse }
> {
  const user = await getAuthUser(request);

  if (!user) {
    return {
      user: null,
      error: NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      ),
    };
  }

  return { user, error: null };
}

// ─── withAuth HOF ─────────────────────────────────────────────────────────────

/**
 * Context injected into authenticated route handlers.
 */
export interface AuthContext {
  /** Decoded JWT payload containing `userId` and `email`. */
  user: JWTPayload;
}

/**
 * Signature for a route handler wrapped with `withAuth`.
 */
export type AuthenticatedHandler<TParams = Record<string, string>> = (
  request: NextRequest,
  context: { params: Promise<TParams>; auth: AuthContext }
) => Promise<Response> | Response;

/**
 * Higher-order function that wraps a Next.js App Router route handler with
 * JWT authentication.
 *
 * Auth resolution order:
 *   1. Read forwarded headers set by the Edge middleware (O(1), no crypto).
 *   2. Fall back to full JWT verification from the Bearer header / cookie.
 *
 * Returns a 401 JSON response with a Korean error message when unauthenticated;
 * otherwise calls the handler with an additional `auth` context object that
 * contains the decoded user.
 *
 * Compatible with Next.js 15 App Router where `params` is a Promise.
 *
 * @example
 * // app/api/bookmarks/route.ts
 * export const GET = withAuth(async (request, { auth }) => {
 *   const { userId } = auth.user;
 *   const bookmarks = await prisma.bookmark.findMany({ where: { userId } });
 *   return NextResponse.json({ bookmarks });
 * });
 *
 * @example
 * // app/api/bookmarks/[id]/route.ts
 * export const DELETE = withAuth<{ id: string }>(async (request, { params, auth }) => {
 *   const { id } = await params;
 *   const { userId } = auth.user;
 *   await prisma.bookmark.deleteMany({ where: { id, userId } });
 *   return NextResponse.json({ message: '북마크가 삭제되었습니다.' });
 * });
 */
export function withAuth<TParams = Record<string, string>>(
  handler: AuthenticatedHandler<TParams>
) {
  return async function wrappedHandler(
    request: NextRequest,
    routeContext: { params: Promise<TParams> }
  ): Promise<Response> {
    const user = await getAuthUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 }
      );
    }

    return handler(request, {
      params: routeContext.params,
      auth: { user },
    });
  };
}
