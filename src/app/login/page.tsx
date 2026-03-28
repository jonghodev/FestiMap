'use client';

/**
 * 로그인 / 회원가입 페이지
 *
 * 탭으로 로그인과 회원가입을 전환할 수 있는 단일 페이지입니다.
 * 북마크 등 인증이 필요한 기능에서 리다이렉트될 때 returnUrl 쿼리 파라미터를
 * 통해 로그인 후 원래 페이지로 돌아갑니다.
 *
 * ※ useSearchParams()는 Suspense 경계 안에서 사용해야 합니다.
 *    LoginContent 를 Suspense 로 감싸는 방식으로 구현합니다.
 */

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

type Tab = 'login' | 'signup';

interface FormState {
  email: string;
  password: string;
  name: string;
}

/** 실제 로그인/회원가입 UI – Suspense 내부에서 useSearchParams() 사용 */
function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl') ?? '/';

  const [tab, setTab] = useState<Tab>('login');
  const [form, setForm] = useState<FormState>({ email: '', password: '', name: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 탭 전환 시 입력값/오류 초기화
  useEffect(() => {
    setForm({ email: '', password: '', name: '' });
    setErrorMsg(null);
    setSuccessMsg(null);
  }, [tab]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
      setErrorMsg(null);
    },
    []
  );

  const handleLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSubmitting) return;

      setIsSubmitting(true);
      setErrorMsg(null);

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: form.email, password: form.password }),
        });

        const data = (await res.json()) as { error?: string };

        if (!res.ok) {
          setErrorMsg(data.error ?? '로그인에 실패했습니다.');
          return;
        }

        // 로그인 성공: returnUrl로 이동 (router.push를 사용해 히스토리에 추가)
        router.push(returnUrl);
        router.refresh(); // 서버 컴포넌트 재렌더링 (북마크 상태 갱신)
      } catch {
        setErrorMsg('네트워크 오류가 발생했습니다. 연결을 확인해주세요.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [form.email, form.password, isSubmitting, returnUrl, router]
  );

  const handleSignup = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSubmitting) return;

      setIsSubmitting(true);
      setErrorMsg(null);
      setSuccessMsg(null);

      try {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: form.email,
            password: form.password,
            name: form.name || undefined,
          }),
        });

        const data = (await res.json()) as { error?: string; message?: string };

        if (!res.ok) {
          setErrorMsg(data.error ?? '회원가입에 실패했습니다.');
          return;
        }

        // 회원가입 성공: 로그인 탭으로 전환하며 안내 메시지 표시
        setSuccessMsg('회원가입이 완료되었습니다! 로그인해주세요.');
        setTab('login');
      } catch {
        setErrorMsg('네트워크 오류가 발생했습니다. 연결을 확인해주세요.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [form.email, form.password, form.name, isSubmitting]
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
        <Link
          href="/"
          className="text-gray-600 hover:text-gray-900 p-1 -ml-1 rounded-lg hover:bg-gray-100 transition-colors"
          aria-label="홈으로"
        >
          ← 뒤로
        </Link>
        <h1 className="text-base font-bold text-gray-900">
          {tab === 'login' ? '로그인' : '회원가입'}
        </h1>
      </header>

      <div className="flex-1 flex flex-col items-center justify-start pt-8 px-4">
        {/* 앱 로고 */}
        <div className="text-3xl font-bold text-yellow-500 mb-6 flex items-center gap-1">
          🗺️ <span>FestiMap</span>
        </div>

        {/* 탭 전환 */}
        <div className="w-full max-w-sm flex rounded-xl overflow-hidden border border-gray-200 mb-6 bg-white">
          {(['login', 'signup'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={[
                'flex-1 py-2.5 text-sm font-semibold transition-colors',
                tab === t
                  ? 'bg-yellow-400 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50',
              ].join(' ')}
            >
              {t === 'login' ? '로그인' : '회원가입'}
            </button>
          ))}
        </div>

        {/* 폼 카드 */}
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {/* 성공 메시지 */}
          {successMsg && (
            <div
              role="status"
              className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700"
            >
              {successMsg}
            </div>
          )}

          {/* 오류 메시지 */}
          {errorMsg && (
            <div
              role="alert"
              className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600"
            >
              {errorMsg}
            </div>
          )}

          {tab === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4" noValidate>
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1">
                  이메일
                </label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={form.email}
                  onChange={handleChange}
                  placeholder="example@email.com"
                  className="w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-yellow-400 focus:bg-white transition-colors"
                />
              </div>
              <div>
                <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1">
                  비밀번호
                </label>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={form.password}
                  onChange={handleChange}
                  placeholder="비밀번호 입력"
                  className="w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-yellow-400 focus:bg-white transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting || !form.email || !form.password}
                className="w-full py-3 bg-yellow-400 hover:bg-yellow-500 active:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl transition-colors"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    로그인 중...
                  </span>
                ) : '로그인'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="space-y-4" noValidate>
              <div>
                <label htmlFor="signup-name" className="block text-sm font-medium text-gray-700 mb-1">
                  이름 <span className="text-gray-400 font-normal">(선택)</span>
                </label>
                <input
                  id="signup-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  value={form.name}
                  onChange={handleChange}
                  placeholder="홍길동"
                  className="w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-yellow-400 focus:bg-white transition-colors"
                />
              </div>
              <div>
                <label htmlFor="signup-email" className="block text-sm font-medium text-gray-700 mb-1">
                  이메일
                </label>
                <input
                  id="signup-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={form.email}
                  onChange={handleChange}
                  placeholder="example@email.com"
                  className="w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-yellow-400 focus:bg-white transition-colors"
                />
              </div>
              <div>
                <label htmlFor="signup-password" className="block text-sm font-medium text-gray-700 mb-1">
                  비밀번호 <span className="text-gray-400 font-normal">(8자 이상)</span>
                </label>
                <input
                  id="signup-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={form.password}
                  onChange={handleChange}
                  placeholder="비밀번호 입력 (8자 이상)"
                  className="w-full px-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-yellow-400 focus:bg-white transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmitting || !form.email || !form.password}
                className="w-full py-3 bg-yellow-400 hover:bg-yellow-500 active:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl transition-colors"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    가입 중...
                  </span>
                ) : '회원가입'}
              </button>
            </form>
          )}
        </div>

        {/* 안내 문구 */}
        <p className="mt-4 text-xs text-gray-400 text-center">
          비회원도 지도 탐색 및 행사 상세 페이지를 이용할 수 있습니다.
        </p>

        <div className="h-8" />
      </div>
    </div>
  );
}

/** 페이지 기본 익스포트 – LoginContent 를 Suspense로 감쌉니다 */
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-yellow-400 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
