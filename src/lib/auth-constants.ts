/**
 * Shared authentication constants.
 *
 * This file has NO runtime-specific imports so it can be safely used in both:
 *   - Next.js Edge runtime (middleware.ts)
 *   - Node.js runtime (API route handlers)
 */

/** Name of the HTTP-only cookie that stores the JWT for browser sessions. */
export const COOKIE_NAME = "festimap-auth";

/**
 * Custom request header names injected by the Edge middleware after it
 * verifies the JWT. Downstream route handlers can read these to obtain the
 * authenticated user's identity without re-verifying the token.
 */
export const AUTH_HEADER_USER_ID = "x-festimap-user-id";
export const AUTH_HEADER_USER_EMAIL = "x-festimap-user-email";
