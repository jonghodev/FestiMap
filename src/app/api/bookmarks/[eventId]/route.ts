/**
 * GET    /api/bookmarks/:eventId  – 북마크 여부 확인
 * DELETE /api/bookmarks/:eventId  – 북마크 삭제
 *
 * URL 파라미터로 eventId를 받아 현재 로그인한 사용자의 해당 북마크를 조회/삭제합니다.
 *
 * 이 라우트는 Edge 미들웨어(middleware.ts)에 의해 보호됩니다.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/auth-middleware";

// ─── GET /api/bookmarks/[eventId] ────────────────────────────────────────────

/**
 * 지정한 이벤트에 대한 북마크 여부를 반환합니다.
 *
 * Response: 200 { isBookmarked: boolean } | 401
 */
export const GET = withAuth<{ eventId: string }>(
  async (request: NextRequest, { params, auth }) => {
    const { userId } = auth.user;
    const { eventId } = await params;

    if (!eventId || typeof eventId !== "string" || eventId.trim() === "") {
      return NextResponse.json(
        { error: "eventId가 필요합니다." },
        { status: 400 }
      );
    }

    try {
      const bookmark = await prisma.bookmark.findUnique({
        where: { userId_eventId: { userId, eventId } },
        select: { id: true },
      });

      return NextResponse.json({ isBookmarked: bookmark !== null });
    } catch (error) {
      console.error("[GET /api/bookmarks/:eventId] DB error:", error);
      return NextResponse.json(
        { error: "북마크 상태를 확인하는 중 오류가 발생했습니다." },
        { status: 500 }
      );
    }
  }
);

// ─── DELETE /api/bookmarks/[eventId] ─────────────────────────────────────────

/**
 * 지정한 이벤트에 대한 북마크를 삭제합니다.
 *
 * Response: 200 { message } | 404
 */
export const DELETE = withAuth<{ eventId: string }>(
  async (request: NextRequest, { params, auth }) => {
    const { userId } = auth.user;
    const { eventId } = await params;

    if (!eventId || typeof eventId !== "string" || eventId.trim() === "") {
      return NextResponse.json(
        { error: "eventId가 필요합니다." },
        { status: 400 }
      );
    }

    try {
      // deleteMany: 해당 조건에 맞는 북마크가 없어도 에러 없이 처리
      const result = await prisma.bookmark.deleteMany({
        where: { userId, eventId },
      });

      if (result.count === 0) {
        return NextResponse.json(
          { error: "북마크를 찾을 수 없습니다." },
          { status: 404 }
        );
      }

      return NextResponse.json({ message: "북마크가 삭제되었습니다." });
    } catch (error) {
      console.error("[DELETE /api/bookmarks/:eventId] DB error:", error);
      return NextResponse.json(
        { error: "북마크를 삭제하는 중 오류가 발생했습니다." },
        { status: 500 }
      );
    }
  }
);
