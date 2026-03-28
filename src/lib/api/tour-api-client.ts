/**
 * 한국관광공사 TourAPI 4.0 클라이언트 모듈
 *
 * 공식 문서: https://api.visitkorea.or.kr
 * API 등록: https://www.data.go.kr/data/15101578/openapi.do
 *
 * 환경변수:
 *   TOUR_API_KEY  - 공공데이터포털 인증키 (Decoding 키)
 *
 * 사용 예:
 *   const client = createTourApiClient();
 *
 *   // 축제 목록 조회
 *   const festivals = await client.fetchFestivalList({ areaCode: '1', eventStartDate: '20260101', eventEndDate: '20261231' });
 *
 *   // 키워드로 마켓 검색 (플리마켓, 야시장 등)
 *   const markets = await client.fetchSearchKeyword({ keyword: '플리마켓', areaCode: '1' });
 *
 *   // 지역/콘텐츠타입 기반 마켓 목록 조회
 *   const shopping = await client.fetchAreaBasedList({ areaCode: '1', contentTypeId: '38' });
 */

// ────────────────────────────────────────────────────────────────
// 상수
// ────────────────────────────────────────────────────────────────

/** TourAPI 4.0 기본 URL */
export const TOUR_API_BASE_URL = 'https://apis.data.go.kr/B551011/KorService1' as const;

/** TourAPI 4.0 축제/공연/행사 목록 엔드포인트 경로 */
export const TOUR_API_FESTIVAL_LIST_PATH = '/festivalList1' as const;

/** TourAPI 4.0 키워드 검색 엔드포인트 경로 (플리마켓, 야시장 검색에 활용) */
export const TOUR_API_SEARCH_KEYWORD_PATH = '/searchKeyword1' as const;

/** TourAPI 4.0 지역 기반 목록 엔드포인트 경로 (콘텐츠타입별 지역 행사 조회) */
export const TOUR_API_AREA_BASED_LIST_PATH = '/areaBasedList1' as const;

/**
 * TourAPI 4.0 콘텐츠 타입 코드
 * FestiMap에서 마켓/축제 분류에 활용되는 타입들
 */
export const TOUR_API_CONTENT_TYPES = {
  /** 관광지 */
  TOURIST_SPOT: '12',
  /** 문화시설 */
  CULTURAL_FACILITY: '14',
  /** 행사/공연/축제 (축제, 야시장, 일부 플리마켓 포함) */
  EVENT_FESTIVAL: '15',
  /** 레포츠 */
  LEISURE_SPORTS: '28',
  /** 쇼핑 (상설 시장, 플리마켓 공간 등) */
  SHOPPING: '38',
  /** 음식점 */
  RESTAURANT: '39',
} as const;

export type TourApiContentTypeId = (typeof TOUR_API_CONTENT_TYPES)[keyof typeof TOUR_API_CONTENT_TYPES];

/**
 * FestiMap 마켓 이벤트 검색에 사용하는 키워드 목록
 * TourAPI searchKeyword1 엔드포인트에서 활용
 */
export const TOUR_API_MARKET_KEYWORDS = ['플리마켓', '야시장', '벼룩시장', '밤시장', '마켓'] as const;

export type TourApiMarketKeyword = (typeof TOUR_API_MARKET_KEYWORDS)[number];

/** 지역 코드 (areaCode) */
export const TOUR_API_AREA_CODES = {
  SEOUL: '1',
  INCHEON: '2',
  GYEONGGI: '31',
} as const;

export type TourApiAreaCode = (typeof TOUR_API_AREA_CODES)[keyof typeof TOUR_API_AREA_CODES];

/** 서울 시군구 코드 → 구 이름 매핑 (areaCode=1일 때 적용) */
export const SEOUL_SIGUNGU_MAP: Readonly<Record<string, string>> = {
  '1': '종로구',
  '2': '중구',
  '3': '용산구',
  '4': '성동구',
  '5': '광진구',
  '6': '동대문구',
  '7': '중랑구',
  '8': '성북구',
  '9': '강북구',
  '10': '도봉구',
  '11': '노원구',
  '12': '은평구',
  '13': '서대문구',
  '14': '마포구',
  '15': '양천구',
  '16': '강서구',
  '17': '구로구',
  '18': '금천구',
  '19': '영등포구',
  '20': '동작구',
  '21': '관악구',
  '22': '서초구',
  '23': '강남구',
  '24': '송파구',
  '25': '강동구',
};

// ────────────────────────────────────────────────────────────────
// 요청 파라미터 타입
// ────────────────────────────────────────────────────────────────

/** TourAPI 4.0 공통 요청 파라미터 */
export interface TourApiBaseParams {
  /** 모바일 OS 구분 (ETC | IOS | AND | WIN) */
  MobileOS?: 'ETC' | 'IOS' | 'AND' | 'WIN';
  /** 모바일 앱 이름 */
  MobileApp?: string;
  /** 응답 형식 (json | xml) */
  _type?: 'json' | 'xml';
  /** 한 페이지 결과 수 (기본값: 10, 최대: 100) */
  numOfRows?: number;
  /** 페이지 번호 (1부터 시작) */
  pageNo?: number;
}

/** 축제/공연/행사 목록 조회 요청 파라미터 (festivalList1) */
export interface TourApiFestivalListParams extends TourApiBaseParams {
  /** 이벤트 시작일 (YYYYMMDD, 필수) */
  eventStartDate: string;
  /** 이벤트 종료일 (YYYYMMDD, 선택) */
  eventEndDate?: string;
  /** 지역 코드 (1=서울, 2=인천, 31=경기도, 선택) */
  areaCode?: string;
  /** 시군구 코드 (선택) */
  sigunguCode?: string;
  /** 대분류 코드 (선택) */
  cat1?: string;
  /** 중분류 코드 (선택) */
  cat2?: string;
  /** 소분류 코드 (선택) */
  cat3?: string;
  /** 수정일1 (선택, YYYYMMDD) */
  modifiedtime?: string;
}

/**
 * 키워드 검색 요청 파라미터 (searchKeyword1)
 * 플리마켓·야시장 등 마켓 이벤트 검색에 활용됩니다.
 *
 * @example
 * { keyword: '플리마켓', areaCode: '1', contentTypeId: '15' }
 */
export interface TourApiSearchKeywordParams extends TourApiBaseParams {
  /** 검색 키워드 (필수, 예: '플리마켓', '야시장') */
  keyword: string;
  /** 지역 코드 (1=서울, 2=인천, 31=경기도, 선택) */
  areaCode?: string;
  /** 시군구 코드 (선택) */
  sigunguCode?: string;
  /**
   * 콘텐츠 타입 ID (선택)
   * - '15' = 행사/공연/축제 (임시 마켓 행사)
   * - '38' = 쇼핑 (상설 마켓 공간)
   * 미지정 시 전체 타입 검색
   */
  contentTypeId?: TourApiContentTypeId | string;
  /** 대분류 코드 (선택) */
  cat1?: string;
  /** 중분류 코드 (선택) */
  cat2?: string;
  /** 소분류 코드 (선택) */
  cat3?: string;
}

/**
 * 지역 기반 관광 정보 목록 요청 파라미터 (areaBasedList1)
 * 특정 지역 + 콘텐츠 타입(쇼핑 '38', 행사 '15')으로 마켓 목록을 조회합니다.
 *
 * @example
 * { areaCode: '1', contentTypeId: '38' }  // 서울 쇼핑(마켓) 목록
 * { areaCode: '1', contentTypeId: '15' }  // 서울 행사(축제/마켓) 목록
 */
export interface TourApiAreaBasedListParams extends TourApiBaseParams {
  /** 지역 코드 (1=서울, 2=인천, 31=경기도, 선택) */
  areaCode?: string;
  /** 시군구 코드 (선택) */
  sigunguCode?: string;
  /**
   * 콘텐츠 타입 ID (선택)
   * - '15' = 행사/공연/축제
   * - '38' = 쇼핑 (플리마켓 공간 등)
   */
  contentTypeId?: TourApiContentTypeId | string;
  /** 대분류 코드 (선택) */
  cat1?: string;
  /** 중분류 코드 (선택) */
  cat2?: string;
  /** 소분류 코드 (선택) */
  cat3?: string;
  /** 정렬 기준 (A=제목순, C=수정일순, D=생성일순, E=행사시작일순, Q=인기도순) */
  arrange?: 'A' | 'C' | 'D' | 'E' | 'Q';
  /** 수정일시 필터 (YYYYMMDD, 선택) */
  modifiedtime?: string;
}

// ────────────────────────────────────────────────────────────────
// 응답 타입
// ────────────────────────────────────────────────────────────────

/** TourAPI 4.0 응답 헤더 */
export interface TourApiHeader {
  /** 결과 코드 (성공: '0000') */
  resultCode: string;
  /** 결과 메시지 */
  resultMsg: string;
}

/** TourAPI 4.0 축제/공연/행사 단일 아이템 */
export interface TourApiItem {
  /** 콘텐츠 ID (고유 식별자) */
  contentid: string;
  /** 콘텐츠 타입 ID (15=행사/공연/축제) */
  contenttypeid?: string;
  /** 행사 제목 */
  title: string;
  /** 주소 1 (시/도 + 구/군) */
  addr1: string;
  /** 주소 2 (상세 주소) */
  addr2?: string;
  /** 경도 (longitude, WGS84) */
  mapx: string;
  /** 위도 (latitude, WGS84) */
  mapy: string;
  /** 이벤트 시작일 (YYYYMMDD) */
  eventstartdate: string;
  /** 이벤트 종료일 (YYYYMMDD) */
  eventenddate: string;
  /** 대표 이미지 URL (원본) */
  firstimage?: string;
  /** 대표 이미지 URL (섬네일) */
  firstimage2?: string;
  /** 시군구 코드 */
  sigungucode?: string;
  /** 지역 코드 */
  areacode?: string;
  /** 전화번호 */
  tel?: string;
  /** 대분류 코드 */
  cat1?: string;
  /** 중분류 코드 */
  cat2?: string;
  /** 소분류 코드 */
  cat3?: string;
  /** 수정일시 (YYYYMMDDHHmmss) */
  modifiedtime?: string;
  /** 등록일시 (YYYYMMDDHHmmss) */
  createdtime?: string;
  /** 부킹여부 */
  booktour?: string;
}

/** TourAPI 4.0 페이지네이션 바디 */
export interface TourApiBody<T> {
  /** 아이템 목록 (결과 없으면 빈 문자열 '') */
  items: { item: T[] | T } | '';
  /** 페이지당 결과 수 */
  numOfRows: number;
  /** 현재 페이지 번호 */
  pageNo: number;
  /** 전체 결과 수 */
  totalCount: number;
}

/** TourAPI 4.0 전체 응답 구조 */
export interface TourApiResponse<T = TourApiItem> {
  response: {
    header: TourApiHeader;
    body: TourApiBody<T>;
  };
}

/** TourAPI 4.0 축제 목록 응답 타입 */
export type TourApiFestivalListResponse = TourApiResponse<TourApiItem>;

/**
 * TourAPI 4.0 키워드 검색 결과 아이템 (searchKeyword1)
 * 기본 TourApiItem 필드에 추가로 콘텐츠 타입 정보가 포함됩니다.
 */
export interface TourApiSearchItem extends TourApiItem {
  /** 콘텐츠 타입 ID (15=행사, 38=쇼핑 등) */
  contenttypeid: string;
  /** 북마크 수 */
  bookmark?: string;
  /** 리뷰 수 */
  reviewcount?: string;
  /** 조회 수 */
  readcount?: string;
}

/** TourAPI 4.0 키워드 검색 응답 타입 (searchKeyword1) */
export type TourApiSearchKeywordResponse = TourApiResponse<TourApiSearchItem>;

/**
 * TourAPI 4.0 지역 기반 목록 아이템 (areaBasedList1)
 * 마켓 공간(쇼핑 타입) 또는 행사(이벤트 타입) 정보가 포함됩니다.
 */
export interface TourApiAreaBasedItem extends TourApiItem {
  /** 콘텐츠 타입 ID */
  contenttypeid: string;
  /** 우편번호 */
  zipcode?: string;
  /** 조회 수 */
  readcount?: string;
}

/** TourAPI 4.0 지역 기반 목록 응답 타입 (areaBasedList1) */
export type TourApiAreaBasedListResponse = TourApiResponse<TourApiAreaBasedItem>;

// ────────────────────────────────────────────────────────────────
// 클라이언트 구현
// ────────────────────────────────────────────────────────────────

export interface TourApiClientConfig {
  /** 공공데이터포털 인증키 (Decoding 키) */
  serviceKey: string;
  /** 기본 URL (기본값: TOUR_API_BASE_URL) */
  baseUrl?: string;
  /** 기본 모바일 앱 이름 (기본값: 'FestiMap') */
  mobileApp?: string;
  /** 요청 타임아웃 ms (기본값: 10000) */
  timeoutMs?: number;
}

/**
 * TourAPI 4.0 클라이언트 클래스
 *
 * @example
 * const client = new TourApiClient({ serviceKey: process.env.TOUR_API_KEY! });
 * const result = await client.fetchFestivalList({ areaCode: '1', eventStartDate: '20260101' });
 */
export class TourApiClient {
  private readonly serviceKey: string;
  private readonly baseUrl: string;
  private readonly mobileApp: string;
  private readonly timeoutMs: number;

  constructor(config: TourApiClientConfig) {
    if (!config.serviceKey) {
      throw new Error('[TourApiClient] serviceKey는 필수입니다. TOUR_API_KEY 환경변수를 설정하세요.');
    }
    this.serviceKey = config.serviceKey;
    this.baseUrl = config.baseUrl ?? TOUR_API_BASE_URL;
    this.mobileApp = config.mobileApp ?? 'FestiMap';
    this.timeoutMs = config.timeoutMs ?? 10_000;
  }

  /**
   * 공통 요청 파라미터를 URLSearchParams로 빌드합니다.
   */
  private buildBaseParams(overrides: Record<string, string> = {}): URLSearchParams {
    return new URLSearchParams({
      serviceKey: this.serviceKey,
      MobileOS: 'ETC',
      MobileApp: this.mobileApp,
      _type: 'json',
      ...overrides,
    });
  }

  /**
   * 축제/공연/행사 목록을 가져옵니다 (festivalList1 엔드포인트).
   *
   * @param params 요청 파라미터
   * @returns TourAPI 응답 (파싱된 JSON)
   * @throws 네트워크 오류 또는 HTTP 오류 시 Error 예외 발생
   */
  async fetchFestivalList(
    params: TourApiFestivalListParams,
  ): Promise<TourApiFestivalListResponse> {
    const searchParams = this.buildBaseParams({
      eventStartDate: params.eventStartDate,
      ...(params.eventEndDate && { eventEndDate: params.eventEndDate }),
      ...(params.areaCode && { areaCode: params.areaCode }),
      ...(params.sigunguCode && { sigunguCode: params.sigunguCode }),
      ...(params.cat1 && { cat1: params.cat1 }),
      ...(params.cat2 && { cat2: params.cat2 }),
      ...(params.cat3 && { cat3: params.cat3 }),
      ...(params.modifiedtime && { modifiedtime: params.modifiedtime }),
      numOfRows: String(params.numOfRows ?? 100),
      pageNo: String(params.pageNo ?? 1),
      ...(params.MobileOS && { MobileOS: params.MobileOS }),
      ...(params.MobileApp && { MobileApp: params.MobileApp }),
      ...((params._type) && { _type: params._type }),
    });

    const url = `${this.baseUrl}${TOUR_API_FESTIVAL_LIST_PATH}?${searchParams}`;

    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      throw new Error(
        `[TourApiClient] HTTP ${res.status} ${res.statusText} — URL: ${url}`,
      );
    }

    return (await res.json()) as TourApiFestivalListResponse;
  }

  /**
   * 키워드로 관광 정보를 검색합니다 (searchKeyword1 엔드포인트).
   * 플리마켓, 야시장, 벼룩시장 등 마켓 이벤트 검색에 활용됩니다.
   *
   * @param params 검색 파라미터 (keyword 필수)
   * @returns TourAPI 키워드 검색 응답
   * @throws 네트워크 오류 또는 HTTP 오류 시 Error 예외 발생
   *
   * @example
   * const result = await client.fetchSearchKeyword({ keyword: '플리마켓', areaCode: '1' });
   * const items = TourApiClient.extractItems(result);
   */
  async fetchSearchKeyword(
    params: TourApiSearchKeywordParams,
  ): Promise<TourApiSearchKeywordResponse> {
    const searchParams = this.buildBaseParams({
      keyword: params.keyword,
      ...(params.areaCode && { areaCode: params.areaCode }),
      ...(params.sigunguCode && { sigunguCode: params.sigunguCode }),
      ...(params.contentTypeId && { contentTypeId: params.contentTypeId }),
      ...(params.cat1 && { cat1: params.cat1 }),
      ...(params.cat2 && { cat2: params.cat2 }),
      ...(params.cat3 && { cat3: params.cat3 }),
      numOfRows: String(params.numOfRows ?? 100),
      pageNo: String(params.pageNo ?? 1),
      ...(params.MobileOS && { MobileOS: params.MobileOS }),
      ...(params.MobileApp && { MobileApp: params.MobileApp }),
      ...(params._type && { _type: params._type }),
    });

    const url = `${this.baseUrl}${TOUR_API_SEARCH_KEYWORD_PATH}?${searchParams}`;

    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      throw new Error(
        `[TourApiClient] HTTP ${res.status} ${res.statusText} — URL: ${url}`,
      );
    }

    return (await res.json()) as TourApiSearchKeywordResponse;
  }

  /**
   * 지역 기반 관광 정보 목록을 가져옵니다 (areaBasedList1 엔드포인트).
   * contentTypeId를 '38'(쇼핑) 또는 '15'(행사)로 설정하여 마켓 목록을 조회합니다.
   *
   * @param params 요청 파라미터
   * @returns TourAPI 지역 기반 목록 응답
   * @throws 네트워크 오류 또는 HTTP 오류 시 Error 예외 발생
   *
   * @example
   * // 서울 쇼핑(마켓 공간) 목록
   * const result = await client.fetchAreaBasedList({ areaCode: '1', contentTypeId: '38' });
   * // 서울 행사(축제/이벤트 마켓) 목록
   * const result = await client.fetchAreaBasedList({ areaCode: '1', contentTypeId: '15' });
   */
  async fetchAreaBasedList(
    params: TourApiAreaBasedListParams,
  ): Promise<TourApiAreaBasedListResponse> {
    const searchParams = this.buildBaseParams({
      ...(params.areaCode && { areaCode: params.areaCode }),
      ...(params.sigunguCode && { sigunguCode: params.sigunguCode }),
      ...(params.contentTypeId && { contentTypeId: params.contentTypeId }),
      ...(params.cat1 && { cat1: params.cat1 }),
      ...(params.cat2 && { cat2: params.cat2 }),
      ...(params.cat3 && { cat3: params.cat3 }),
      ...(params.arrange && { arrange: params.arrange }),
      ...(params.modifiedtime && { modifiedtime: params.modifiedtime }),
      numOfRows: String(params.numOfRows ?? 100),
      pageNo: String(params.pageNo ?? 1),
      ...(params.MobileOS && { MobileOS: params.MobileOS }),
      ...(params.MobileApp && { MobileApp: params.MobileApp }),
      ...(params._type && { _type: params._type }),
    });

    const url = `${this.baseUrl}${TOUR_API_AREA_BASED_LIST_PATH}?${searchParams}`;

    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      throw new Error(
        `[TourApiClient] HTTP ${res.status} ${res.statusText} — URL: ${url}`,
      );
    }

    return (await res.json()) as TourApiAreaBasedListResponse;
  }

  /**
   * 응답 본문에서 아이템 배열을 안전하게 추출합니다.
   * items가 빈 문자열('') 또는 단일 객체일 경우를 처리합니다.
   * festivalList1, searchKeyword1, areaBasedList1 응답 모두에서 동작합니다.
   */
  static extractItems<T extends TourApiItem = TourApiItem>(
    response: TourApiResponse<T>,
  ): T[] {
    const body = response?.response?.body;
    if (!body || typeof body.items !== 'object') return [];

    const raw = body.items.item;
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [raw];
  }

  /**
   * 응답 헤더의 결과 코드가 성공(0000)인지 확인합니다.
   * 모든 TourAPI 응답 타입(festivalList1, searchKeyword1, areaBasedList1)에서 사용 가능합니다.
   */
  static isSuccess(response: TourApiResponse): boolean {
    return response?.response?.header?.resultCode === '0000';
  }

  /**
   * 응답의 전체 결과 수를 반환합니다.
   * 모든 TourAPI 응답 타입에서 사용 가능합니다.
   */
  static getTotalCount(response: TourApiResponse): number {
    return response?.response?.body?.totalCount ?? 0;
  }
}

// ────────────────────────────────────────────────────────────────
// 팩토리 함수
// ────────────────────────────────────────────────────────────────

/**
 * 환경변수(TOUR_API_KEY)에서 API 키를 읽어 TourApiClient를 생성합니다.
 *
 * @param overrideKey API 키를 직접 지정할 경우 (선택, 기본값: process.env.TOUR_API_KEY)
 * @returns TourApiClient 인스턴스
 * @throws TOUR_API_KEY 환경변수가 설정되지 않은 경우 Error 예외 발생
 *
 * @example
 * // 환경변수에서 자동으로 API 키 읽기
 * const client = createTourApiClient();
 *
 * // API 키 직접 지정
 * const client = createTourApiClient('my-api-key');
 */
export function createTourApiClient(overrideKey?: string): TourApiClient {
  const serviceKey = overrideKey ?? process.env.TOUR_API_KEY;
  if (!serviceKey) {
    throw new Error(
      '[createTourApiClient] TOUR_API_KEY 환경변수가 설정되지 않았습니다. ' +
      '.env.local 파일에 TOUR_API_KEY를 추가하세요.\n' +
      '발급: https://www.data.go.kr/data/15101578/openapi.do',
    );
  }
  return new TourApiClient({ serviceKey });
}

// ────────────────────────────────────────────────────────────────
// 날짜 유틸리티
// ────────────────────────────────────────────────────────────────

/**
 * YYYYMMDD 형식의 문자열을 Date 객체로 변환합니다.
 * @example parseTourApiDate('20260401') // Date(2026, 3, 1)
 */
export function parseTourApiDate(dateStr: string): Date {
  const y = parseInt(dateStr.slice(0, 4), 10);
  const m = parseInt(dateStr.slice(4, 6), 10) - 1;
  const d = parseInt(dateStr.slice(6, 8), 10);
  return new Date(y, m, d);
}

/**
 * Date 객체를 YYYYMMDD 형식의 문자열로 변환합니다.
 * @example formatTourApiDate(new Date(2026, 3, 1)) // '20260401'
 */
export function formatTourApiDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * areaCode에 해당하는 도시 이름을 반환합니다.
 */
export function getAreaCityName(areaCode: string): string {
  switch (areaCode) {
    case TOUR_API_AREA_CODES.SEOUL:
      return '서울특별시';
    case TOUR_API_AREA_CODES.INCHEON:
      return '인천광역시';
    case TOUR_API_AREA_CODES.GYEONGGI:
      return '경기도';
    default:
      return '대한민국';
  }
}
