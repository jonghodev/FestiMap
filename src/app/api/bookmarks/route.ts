/**
 * GET  /api/bookmarks  – 현재 로그인한 사용자의 북마크 목록 반환
 * POST /api/bookmarks  – 새 북마크 추가
 *
 * 이 라우트는 Edge 미들웨어(middleware.ts)에 의해 보호됩니다.
 * 미들웨어가 JWT를 검증하고 x-festimap-user-id / x-festimap-user-email 헤더를
 * 주입하므로 핸들러 내에서 재검증이 필요하지 않습니다.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/auth-middleware";

// ─── GET /api/bookmarks ───────────────────────────────────────────────────────

/**
 * 현재 사용자의 북마크 목록을 이벤트 정보와 함께 반환합니다.
 */
export const GET = withAuth(async (request: NextRequest, { auth }) => {
  const { userId } = auth.user;

  try {
    const bookmarks = await prisma.bookmark.findMany({
      where: { userId },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            eventType: true,
            startDate: true,
            endDate: true,
            venue: true,
            address: true,
            latitude: true,
            longitude: true,
            district: true,
            city: true,
            imageUrl: true,
            isFree: true,
            price: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({ bookmarks });
  } catch (error) {
    console.error("[GET /api/bookmarks] DB error:", error);
    return NextResponse.json(
      { error: "북마크 목록을 불러오는 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
});

// ─── POST /api/bookmarks ──────────────────────────────────────────────────────

/**
 * 새 북마크를 추가합니다.
 *
 * Request body: { eventId: string }
 * Response:     201 { bookmark } | 400 | 404 | 409
 */
export const POST = withAuth(async (request: NextRequest, { auth }) => {
  const { userId } = auth.user;

  // 요청 본문 파싱
  let body: { eventId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "올바르지 않은 요청 형식입니다." },
      { status: 400 }
    );
  }

  const { eventId } = body;
  if (!eventId || typeof eventId !== "string" || eventId.trim() === "") {
    return NextResponse.json(
      { error: "eventId가 필요합니다." },
      { status: 400 }
    );
  }

  try {
    // 이벤트 존재 여부 확인
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true },
    });

    if (!event) {
      return NextResponse.json(
        { error: "존재하지 않는 이벤트입니다." },
        { status: 404 }
      );
    }

    // 북마크 생성 (이미 존재하면 409 반환)
    const bookmark = await prisma.bookmark.create({
      data: { userId, eventId },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            eventType: true,
            startDate: true,
            endDate: true,
            venue: true,
            address: true,
            latitude: true,
            longitude: true,
            district: true,
            city: true,
            imageUrl: true,
            isFree: true,
            price: true,
          },
        },
      },
    });

    return NextResponse.json({ bookmark }, { status: 201 });
  } catch (error: unknown) {
    // Prisma unique constraint violation (P2002) → 이미 북마크된 이벤트
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "이미 북마크된 이벤트입니다." },
        { status: 409 }
      );
    }

    console.error("[POST /api/bookmarks] DB error:", error);
    return NextResponse.json(
      { error: "북마크를 추가하는 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
});
