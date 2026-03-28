/**
 * GET /api/user/me
 *
 * Returns the currently authenticated user's profile.
 *
 * This route is protected by the Edge middleware (middleware.ts), which:
 *   1. Validates the JWT from the Authorization: Bearer header or cookie.
 *   2. Injects the decoded user identity as custom request headers
 *      (x-festimap-user-id, x-festimap-user-email).
 *
 * The route handler reads those headers via `withAuth` (which uses
 * `getAuthUserFromHeaders` as a fast path) — no re-verification needed.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/auth-middleware";

export const GET = withAuth(async (request: NextRequest, { auth }) => {
  const { userId } = auth.user;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    if (!user) {
      // Token was valid but the account was deleted
      return NextResponse.json(
        { error: "사용자를 찾을 수 없습니다." },
        { status: 404 }
      );
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error("[GET /api/user/me] DB error:", error);
    return NextResponse.json(
      { error: "사용자 정보를 불러오는 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
});
