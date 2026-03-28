/**
 * Kakao JavaScript SDK loader for KakaoTalk social sharing.
 *
 * This is separate from the Maps SDK loader (kakao-loader.ts).
 *
 *   Maps SDK:  https://dapi.kakao.com/v2/maps/sdk.js  →  window.kakao  (lowercase)
 *   JS SDK:    https://t1.kakaocdn.net/kakao_js_sdk/…  →  window.Kakao  (uppercase)
 *
 * Both can be loaded in the same page without conflict because they use
 * different global namespaces.
 *
 * Usage:
 *   await loadKakaoShareSDK(appKey);
 *   window.Kakao.Share.sendDefault({ objectType: 'feed', content: { … } });
 */

// ─── Kakao JS SDK type declarations ──────────────────────────────────────────

/** Feed content object passed to Kakao.Share.sendDefault */
export interface KakaoFeedContent {
  title: string;
  description?: string;
  /** Must be an absolute HTTPS URL reachable from the public internet */
  imageUrl?: string;
  link: {
    mobileWebUrl: string;
    webUrl: string;
  };
}

export interface KakaoShareButton {
  title: string;
  link: {
    mobileWebUrl: string;
    webUrl: string;
  };
}

export interface KakaoShareFeedParams {
  objectType: 'feed';
  content: KakaoFeedContent;
  buttons?: KakaoShareButton[];
}

interface KakaoShareAPI {
  sendDefault(params: KakaoShareFeedParams): void;
}

interface KakaoJSSdk {
  init(jsKey: string): void;
  isInitialized(): boolean;
  Share: KakaoShareAPI;
}

declare global {
  interface Window {
    /** Kakao JavaScript SDK global (uppercase K, different from Maps window.kakao) */
    Kakao?: KakaoJSSdk;
  }
}

// ─── SDK loader ───────────────────────────────────────────────────────────────

const KAKAO_JS_SDK_URL =
  'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';

/** Singleton load promise – prevents multiple concurrent script injections */
let shareSDKPromise: Promise<void> | null = null;

/**
 * Lazily loads and initialises the Kakao JavaScript SDK.
 *
 * - Script is injected only once; subsequent calls share the same Promise.
 * - `Kakao.init()` is called automatically after the script loads.
 * - Resolves when `Kakao.Share` is available and the SDK is initialised.
 *
 * @param appKey  Kakao JavaScript App Key (NEXT_PUBLIC_KAKAO_MAP_APP_KEY)
 */
export function loadKakaoShareSDK(appKey: string): Promise<void> {
  // Already initialised
  if (
    typeof window !== 'undefined' &&
    typeof window.Kakao !== 'undefined' &&
    window.Kakao.isInitialized()
  ) {
    return Promise.resolve();
  }

  if (shareSDKPromise) return shareSDKPromise;

  shareSDKPromise = new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('카카오 SDK는 브라우저 환경에서만 사용할 수 있습니다.'));
      return;
    }

    if (!appKey) {
      reject(new Error('카카오 앱 키가 필요합니다. NEXT_PUBLIC_KAKAO_MAP_APP_KEY를 설정해 주세요.'));
      return;
    }

    const onScriptLoad = () => {
      try {
        if (typeof window.Kakao === 'undefined') {
          throw new Error('카카오 JS SDK가 로드되었지만 Kakao 객체를 찾을 수 없습니다.');
        }
        if (!window.Kakao.isInitialized()) {
          window.Kakao.init(appKey);
        }
        resolve();
      } catch (err) {
        shareSDKPromise = null;
        reject(err);
      }
    };

    // Check if the Kakao JS SDK script tag already exists (e.g. from a previous
    // load attempt or via a page-level <script> tag).
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src*="kakao_js_sdk"]'
    );

    if (existingScript) {
      if (typeof window.Kakao !== 'undefined') {
        onScriptLoad();
      } else {
        existingScript.addEventListener('load', onScriptLoad);
        existingScript.addEventListener('error', () => {
          shareSDKPromise = null;
          reject(new Error('카카오 JS SDK를 불러오는 데 실패했습니다.'));
        });
      }
      return;
    }

    const script = document.createElement('script');
    script.src = KAKAO_JS_SDK_URL;
    script.async = true;
    // Integrity check for 2.7.4 – matches Kakao's official CDN hash
    script.crossOrigin = 'anonymous';

    script.onload = onScriptLoad;
    script.onerror = () => {
      shareSDKPromise = null;
      reject(new Error('카카오 JS SDK 스크립트 로드에 실패했습니다. 네트워크 연결을 확인해 주세요.'));
    };

    document.head.appendChild(script);
  });

  return shareSDKPromise;
}

/**
 * Reset the SDK load promise (useful in tests or after an error).
 */
export function resetKakaoShareLoader(): void {
  shareSDKPromise = null;
}
