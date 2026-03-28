/**
 * POST /api/auth/logout
 *
 * 로그아웃 처리: HTTP-only 쿠키를 만료시켜 세션을 종료합니다.
 * JWT는 서버에 저장되지 않으므로 쿠키 제거만으로 충분합니다.
 */

import { NextResponse } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth';

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json(
    { message: '로그아웃되었습니다.' },
    { status: 200 }
  );

  // HTTP-only 쿠키를 즉시 만료시켜 제거
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,   // 즉시 만료
    path: '/',
  });

  return response;
}
