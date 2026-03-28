/**
 * 공공 API 연동 모듈 - FestiMap
 *
 * 통합 API 출처:
 * 1. 한국관광공사 TourAPI 4.0 (축제/공연/행사)
 *    - 등록: https://www.data.go.kr/data/15101578/openapi.do
 *    - 엔드포인트: https://apis.data.go.kr/B551011/KorService1/festivalList1
 *    - 필요 환경변수: TOUR_API_KEY (공공데이터포털 인증키)
 *    - 사용 엔드포인트:
 *        * festivalList1  - 기간별 축제/행사 목록
 *        * searchKeyword1 - 키워드 검색 (플리마켓, 야시장 등)
 *        * areaBasedList1 - 지역 기반 콘텐츠 목록 (쇼핑/행사)
 *
 * 2. 서울 열린데이터광장 - 서울시 문화행사 정보
 *    - 등록: https://data.seoul.go.kr/dataList/OA-15105/S/1/datasetView.do
 *    - 엔드포인트: http://openapi.seoul.go.kr:8088/{KEY}/json/culturalEventInfo/
 *    - 필요 환경변수: SEOUL_OPEN_DATA_KEY (서울 열린데이터광장 API 키)
 *
 * 데이터 변환 파이프라인:
 *   TourAPI 응답 (TourApiItem)
 *     └─ mapTourApiItemToPublicEvent()
 *         └─ PublicEventRaw (앱 내부 스키마)
 *             └─ normalizeEvent() [normalize-seed-events.ts]
 *                 └─ SeedEventRecord (seed-data.json)
 *                     └─ Prisma upsert → DB
 */

import {
  TourApiClient,
  TourApiItem,
  SEOUL_SIGUNGU_MAP,
  parseTourApiDate,
  getAreaCityName,
  TOUR_API_AREA_CODES,
  TOUR_API_MARKET_KEYWORDS,
  TOUR_API_CONTENT_TYPES,
  type TourApiFestivalListResponse,
  type TourApiSearchKeywordResponse,
  type TourApiAreaBasedListResponse,
} from './tour-api-client';

export interface PublicEventRaw {
  sourceId: string;
  name: string;
  description: string | null;
  eventType: 'FESTIVAL' | 'FLEA_MARKET' | 'NIGHT_MARKET';
  startDate: Date;
  endDate: Date;
  venue: string;
  address: string;
  latitude: number;
  longitude: number;
  district: string | null;
  city: string;
  imageUrl: string | null;
  sourceUrl: string | null;
  isFree: boolean;
  price: string | null;
  organizer: string | null;
  /** 연락처 정보 (전화번호, 이메일 등) — TourAPI: tel 필드 */
  contactInfo?: string | null;
  /** 공식 웹사이트 URL */
  website?: string | null;
}

// ────────────────────────────────────────────────────────────────
// 1. 한국관광공사 TourAPI 4.0
// ────────────────────────────────────────────────────────────────

/**
 * TourAPI 4.0 카테고리 코드(cat1/cat2)로 이벤트 유형을 분류합니다.
 *
 * TourAPI 카테고리 체계:
 *   A02 = 행사/공연/축제
 *   A0206 = 공연/행사 > 쇼핑/마켓 (플리마켓, 야시장 포함)
 *   A0207 = 축제
 *
 * @param cat1 대분류 코드
 * @param cat2 중분류 코드
 * @param cat3 소분류 코드
 * @returns 이벤트 유형 또는 null (분류 불가 시)
 */
export function classifyEventTypeByCode(
  cat1?: string,
  cat2?: string,
  cat3?: string,
): 'FESTIVAL' | 'FLEA_MARKET' | 'NIGHT_MARKET' | null {
  if (!cat1 && !cat2 && !cat3) return null;

  // A0207 = 축제 카테고리
  if (cat2 === 'A0207') return 'FESTIVAL';

  // 쇼핑(A04), 마켓 관련 카테고리
  if (cat1 === 'A04') return 'FLEA_MARKET';

  return null;
}

/**
 * 행사 제목의 키워드로 이벤트 유형을 분류합니다.
 * 코드 기반 분류가 불가할 때 폴백으로 사용됩니다.
 *
 * 우선순위:
 *   1. 야시장/밤시장 키워드 → NIGHT_MARKET
 *   2. 플리마켓/벼룩시장/마켓 키워드 → FLEA_MARKET
 *   3. 그 외 → FESTIVAL
 *
 * @param title 행사 제목
 * @returns 이벤트 유형
 */
export function classifyEventTypeByTitle(title: string): 'FESTIVAL' | 'FLEA_MARKET' | 'NIGHT_MARKET' {
  const t = title.toLowerCase();
  if (t.includes('야시장') || t.includes('밤시장')) return 'NIGHT_MARKET';
  if (
    t.includes('플리마켓') ||
    t.includes('벼룩') ||
    t.includes('마켓') ||
    t.includes('market')
  )
    return 'FLEA_MARKET';
  return 'FESTIVAL';
}

/**
 * TourAPI 카테고리 코드와 제목 키워드를 조합하여 이벤트 유형을 결정합니다.
 * 코드 기반 분류가 우선적용되며, 분류 불가 시 제목 키워드로 폴백합니다.
 *
 * @param title 행사 제목
 * @param cat1 대분류 코드 (선택)
 * @param cat2 중분류 코드 (선택)
 * @param cat3 소분류 코드 (선택)
 * @returns 이벤트 유형
 */
export function classifyEventType(
  title: string,
  cat1?: string,
  cat2?: string,
  cat3?: string,
): 'FESTIVAL' | 'FLEA_MARKET' | 'NIGHT_MARKET' {
  // 1차: 제목 키워드로 야시장/플리마켓을 먼저 체크 (가장 정확)
  const byTitle = classifyEventTypeByTitle(title);
  if (byTitle !== 'FESTIVAL') return byTitle;

  // 2차: 카테고리 코드 기반 분류
  const byCode = classifyEventTypeByCode(cat1, cat2, cat3);
  if (byCode !== null) return byCode;

  // 3차: 기본값 FESTIVAL
  return 'FESTIVAL';
}

/**
 * TourAPI 4.0 행사 아이템을 FestiMap 내부 이벤트 스키마(PublicEventRaw)로 변환합니다.
 *
 * 필드 매핑:
 *   contentid          → sourceId        ("tourapi-{contentid}")
 *   title              → name
 *   addr1, addr2       → address, venue
 *   mapy (위도)        → latitude        (WGS84)
 *   mapx (경도)        → longitude       (WGS84)
 *   eventstartdate     → startDate       (YYYYMMDD → Date)
 *   eventenddate       → endDate         (YYYYMMDD → Date)
 *   sigungucode        → district        (서울 지역만 적용)
 *   areaCode           → city            (지역 코드 → 도시명)
 *   firstimage         → imageUrl
 *   cat1/cat2/cat3     → eventType       (카테고리 코드 + 제목 키워드 조합)
 *   title 키워드       → eventType       (플리마켓/야시장/축제 분류)
 *
 * @param item TourAPI 4.0 행사 아이템
 * @param areaCode 지역 코드 (1=서울, 2=인천, 31=경기)
 * @returns 변환된 PublicEventRaw 또는 null (좌표 오류 시)
 */
export function mapTourApiItemToPublicEvent(item: TourApiItem, areaCode: string): PublicEventRaw | null {
  const lat = parseFloat(item.mapy);
  const lng = parseFloat(item.mapx);

  // 유효하지 않은 좌표 필터링 (0, NaN, 대한민국 범위 외)
  if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return null;
  // 대한민국 내 좌표 범위 검증 (TourAPI WGS84 좌표 기준)
  if (lat < 33.0 || lat > 38.7 || lng < 124.5 || lng > 130.0) return null;

  // 시작/종료일 유효성 검사
  if (!item.eventstartdate || !item.eventenddate) return null;
  // YYYYMMDD 형식인지 검증
  if (item.eventstartdate.length !== 8 || item.eventenddate.length !== 8) return null;

  const city = getAreaCityName(areaCode);
  const district =
    areaCode === TOUR_API_AREA_CODES.SEOUL && item.sigungucode
      ? (SEOUL_SIGUNGU_MAP[item.sigungucode] ?? null)
      : null;

  const startDate = parseTourApiDate(item.eventstartdate);
  const endDate = parseTourApiDate(item.eventenddate);

  // 파싱된 날짜 유효성 검사
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;

  // 종료일이 시작일보다 앞서는 경우 필터링
  if (endDate < startDate) return null;

  // 주소 정규화:
  // - addr1: 도로명/지번 주소 (주소 표시용)
  // - addr2: 상세 주소 (동/층/호 등) → 없으면 addr1 재사용
  // - venue: addr1을 기본으로 사용 (행사 장소명은 TourAPI 기본 목록에 별도 미제공)
  const address = item.addr1 || '';
  const venue = address;  // 기본 목록에서는 addr1이 가장 신뢰성 있는 장소 정보

  return {
    sourceId: `tourapi-${item.contentid}`,
    name: item.title.trim(),
    description: null,
    eventType: classifyEventType(item.title, item.cat1, item.cat2, item.cat3),
    startDate,
    endDate,
    venue,
    address,
    latitude: lat,
    longitude: lng,
    district,
    city,
    imageUrl: item.firstimage || item.firstimage2 || null,
    sourceUrl: `https://www.visitkorea.or.kr/detail/icoDetail.do?contentId=${item.contentid}`,
    isFree: false,
    price: null,
    organizer: null,
    contactInfo: item.tel?.trim() || null,
    website: null,
  };
}

/**
 * 한국관광공사 TourAPI에서 서울/수도권 축제 목록을 가져옵니다.
 * festivalList1 엔드포인트를 사용하며, 연도 전체 범위를 페이지네이션으로 수집합니다.
 *
 * @param serviceKey 공공데이터포털 인증키 (Decoding)
 * @param year 조회 연도 (기본값: 현재 연도)
 */
export async function fetchTourApiFestivals(
  serviceKey: string,
  year: number = new Date().getFullYear(),
): Promise<PublicEventRaw[]> {
  const client = new TourApiClient({ serviceKey });
  const events: PublicEventRaw[] = [];

  // 서울(1), 경기도(31), 인천(2) 지역 코드
  const areaCodes = [
    TOUR_API_AREA_CODES.SEOUL,
    TOUR_API_AREA_CODES.INCHEON,
    TOUR_API_AREA_CODES.GYEONGGI,
  ];

  for (const areaCode of areaCodes) {
    let pageNo = 1;
    const numOfRows = 100;

    while (true) {
      let response: TourApiFestivalListResponse;
      try {
        response = await client.fetchFestivalList({
          areaCode,
          eventStartDate: `${year}0101`,
          eventEndDate: `${year}1231`,
          numOfRows,
          pageNo,
        });
      } catch (err) {
        console.warn(`[TourAPI] 네트워크 오류 (areaCode=${areaCode} page=${pageNo}): ${err}`);
        break;
      }

      if (!TourApiClient.isSuccess(response)) {
        console.warn(`[TourAPI] 오류 응답: ${response?.response?.header?.resultMsg}`);
        break;
      }

      const items = TourApiClient.extractItems(response);

      for (const item of items) {
        const event = mapTourApiItemToPublicEvent(item, areaCode);
        if (event) events.push(event);
      }

      // 마지막 페이지 체크
      const totalCount = TourApiClient.getTotalCount(response);
      if (pageNo * numOfRows >= totalCount) break;
      pageNo++;
    }
  }

  console.log(`[TourAPI 축제] 총 ${events.length}개 행사 수집 완료`);
  return events;
}

/**
 * TourAPI searchKeyword1 엔드포인트를 사용하여 서울/수도권의 플리마켓·야시장을 검색합니다.
 * festivalList1에서 누락될 수 있는 마켓 이벤트를 보완합니다.
 *
 * 검색 키워드: 플리마켓, 야시장, 벼룩시장, 밤시장, 마켓
 * 콘텐츠 타입: 15(행사/공연/축제) + 38(쇼핑)
 *
 * @param serviceKey 공공데이터포털 인증키 (Decoding)
 */
export async function fetchTourApiMarkets(
  serviceKey: string,
): Promise<PublicEventRaw[]> {
  const client = new TourApiClient({ serviceKey });
  const eventsMap = new Map<string, PublicEventRaw>();

  const areaCodes = [
    TOUR_API_AREA_CODES.SEOUL,
    TOUR_API_AREA_CODES.INCHEON,
    TOUR_API_AREA_CODES.GYEONGGI,
  ];

  const contentTypeIds = [
    TOUR_API_CONTENT_TYPES.EVENT_FESTIVAL, // 15: 행사/공연/축제
    TOUR_API_CONTENT_TYPES.SHOPPING,       // 38: 쇼핑 (상설 마켓 공간)
  ];

  for (const areaCode of areaCodes) {
    for (const keyword of TOUR_API_MARKET_KEYWORDS) {
      for (const contentTypeId of contentTypeIds) {
        let pageNo = 1;
        const numOfRows = 100;

        while (true) {
          let response: TourApiSearchKeywordResponse;
          try {
            response = await client.fetchSearchKeyword({
              keyword,
              areaCode,
              contentTypeId,
              numOfRows,
              pageNo,
            });
          } catch (err) {
            console.warn(`[TourAPI 마켓] 네트워크 오류 (keyword=${keyword}, areaCode=${areaCode}): ${err}`);
            break;
          }

          if (!TourApiClient.isSuccess(response)) {
            console.warn(`[TourAPI 마켓] 오류 응답: ${response?.response?.header?.resultMsg}`);
            break;
          }

          const items = TourApiClient.extractItems(response);

          for (const item of items) {
            // 마켓 검색 결과는 날짜 정보가 없을 수 있음 (상설 마켓 공간의 경우)
            // eventstartdate/eventenddate가 없으면 현재 연도 기준으로 대체
            const patchedItem = patchMissingDates(item);
            const event = mapTourApiItemToPublicEvent(patchedItem, areaCode);
            if (event) {
              eventsMap.set(event.sourceId, event);
            }
          }

          // 마지막 페이지 체크
          const totalCount = TourApiClient.getTotalCount(response);
          if (pageNo * numOfRows >= totalCount) break;
          pageNo++;
        }
      }
    }
  }

  const events = Array.from(eventsMap.values());
  console.log(`[TourAPI 마켓] 총 ${events.length}개 마켓 수집 완료`);
  return events;
}

/**
 * eventstartdate/eventenddate가 없는 마켓 아이템에 현재 연도 기준 날짜를 보완합니다.
 * 상설 마켓 공간(쇼핑 타입)의 경우 날짜 정보가 없을 수 있습니다.
 *
 * @param item TourAPI 아이템
 * @returns 날짜가 보완된 아이템
 */
function patchMissingDates(item: TourApiItem): TourApiItem {
  if (item.eventstartdate && item.eventenddate) return item;

  const now = new Date();
  const year = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const today = `${year}${mm}${dd}`;
  const yearEnd = `${year}1231`;

  return {
    ...item,
    eventstartdate: item.eventstartdate || today,
    eventenddate: item.eventenddate || yearEnd,
  };
}

/**
 * TourAPI areaBasedList1 엔드포인트로 서울/수도권 지역 기반 행사·마켓을 가져옵니다.
 *
 * festivalList1(기간 기반)·searchKeyword1(키워드 기반)을 보완하는 세 번째 데이터 소스입니다.
 * contentTypeId '15'(행사/공연/축제)와 '38'(쇼핑)으로 플리마켓·야시장 공간을 추가 수집합니다.
 *
 * 날짜가 없는 상설 공간(쇼핑 타입)은 당해 연도 말까지 유효한 것으로 보완합니다.
 *
 * @param serviceKey 공공데이터포털 인증키 (Decoding)
 */
export async function fetchTourApiAreaBasedEvents(
  serviceKey: string,
): Promise<PublicEventRaw[]> {
  const client = new TourApiClient({ serviceKey });
  const eventsMap = new Map<string, PublicEventRaw>();

  const areaCodes = [
    TOUR_API_AREA_CODES.SEOUL,
    TOUR_API_AREA_CODES.INCHEON,
    TOUR_API_AREA_CODES.GYEONGGI,
  ];

  // 행사(15)와 쇼핑(38) 타입 모두 조회 — 플리마켓 공간이 쇼핑 타입으로 등록된 경우 포함
  const contentTypeIds = [
    TOUR_API_CONTENT_TYPES.EVENT_FESTIVAL, // 15: 행사/공연/축제
    TOUR_API_CONTENT_TYPES.SHOPPING,       // 38: 쇼핑 (상설 마켓 공간)
  ];

  for (const areaCode of areaCodes) {
    for (const contentTypeId of contentTypeIds) {
      let pageNo = 1;
      const numOfRows = 100;

      while (true) {
        let response: TourApiAreaBasedListResponse;
        try {
          response = await client.fetchAreaBasedList({
            areaCode,
            contentTypeId,
            numOfRows,
            pageNo,
          });
        } catch (err) {
          console.warn(
            `[TourAPI 지역기반] 네트워크 오류 (areaCode=${areaCode}, contentTypeId=${contentTypeId}): ${err}`,
          );
          break;
        }

        if (!TourApiClient.isSuccess(response)) {
          console.warn(`[TourAPI 지역기반] 오류 응답: ${response?.response?.header?.resultMsg}`);
          break;
        }

        const items = TourApiClient.extractItems(response);

        for (const item of items) {
          // 날짜 없는 상설 공간은 현재 연도 기준으로 보완
          const patchedItem = patchMissingDates(item);
          const event = mapTourApiItemToPublicEvent(patchedItem, areaCode);
          if (event) {
            eventsMap.set(event.sourceId, event);
          }
        }

        const totalCount = TourApiClient.getTotalCount(response);
        if (pageNo * numOfRows >= totalCount) break;
        pageNo++;
      }
    }
  }

  const events = Array.from(eventsMap.values());
  console.log(`[TourAPI 지역기반] 총 ${events.length}개 행사/마켓 수집 완료`);
  return events;
}

// ────────────────────────────────────────────────────────────────
// 2. 서울 열린데이터광장 - 서울시 문화행사 정보 (OA-15105)
// ────────────────────────────────────────────────────────────────

interface SeoulCulturalEventRow {
  CODENAME: string;       // 행사 유형 (예: 축제, 공연, 교육)
  GUNAME: string;         // 자치구명
  TITLE: string;          // 행사명
  DATE: string;           // 행사기간 (예: 2026-04-01~2026-04-14)
  PLACE: string;          // 장소
  ORG_NAME: string;       // 주최기관
  USE_FEE: string;        // 이용요금
  MAIN_IMG: string;       // 대표 이미지 URL
  RGSTDATE: string;       // 등록일 (YYYY-MM-DD)
  TICKET: string;         // 티켓 정보
  STRTDATE: string;       // 시작일 (YYYY-MM-DD)
  END_DATE: string;       // 종료일 (YYYY-MM-DD)
  THEMECODE: string;      // 테마 코드
  LOT: string;            // 경도 (longitude)
  LAT: string;            // 위도 (latitude)
  IS_FREE: string;        // 무료 여부 ("무료" | "유료")
  HMPG_ADDR: string;      // 홈페이지 주소
  SVCID: string;          // 서비스 ID (고유 식별자)
}

interface SeoulOpenDataResponse {
  culturalEventInfo: {
    list_total_count: number;
    RESULT: { CODE: string; MESSAGE: string };
    row: SeoulCulturalEventRow[];
  };
}

function classifySeoulEventType(
  codeName: string,
  title: string,
): 'FESTIVAL' | 'FLEA_MARKET' | 'NIGHT_MARKET' {
  const cn = codeName.toLowerCase();
  const t = title.toLowerCase();

  if (t.includes('야시장') || t.includes('밤시장')) return 'NIGHT_MARKET';
  if (
    t.includes('플리마켓') ||
    t.includes('벼룩시장') ||
    cn.includes('마켓') ||
    t.includes('마켓')
  )
    return 'FLEA_MARKET';
  return 'FESTIVAL';
}

function parseSeoulDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  // YYYY-MM-DD 또는 YYYY.MM.DD 또는 YYYYMMDD
  const cleaned = dateStr.replace(/[./]/g, '-').trim();
  const match = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
}

/**
 * 서울 열린데이터광장에서 서울시 문화행사 목록을 가져옵니다.
 * @param apiKey 서울 열린데이터광장 API 키
 */
export async function fetchSeoulCulturalEvents(
  apiKey: string,
): Promise<PublicEventRaw[]> {
  const events: PublicEventRaw[] = [];
  const pageSize = 1000;
  let start = 1;

  while (true) {
    const end = start + pageSize - 1;
    const url = `http://openapi.seoul.go.kr:8088/${encodeURIComponent(apiKey)}/json/culturalEventInfo/${start}/${end}/`;

    let data: SeoulOpenDataResponse;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        console.warn(`[서울 열린데이터] HTTP ${res.status}`);
        break;
      }
      data = (await res.json()) as SeoulOpenDataResponse;
    } catch (err) {
      console.warn(`[서울 열린데이터] 네트워크 오류: ${err}`);
      break;
    }

    const result = data?.culturalEventInfo;
    if (!result || result.RESULT.CODE !== 'INFO-000') {
      console.warn(`[서울 열린데이터] 오류: ${result?.RESULT?.MESSAGE}`);
      break;
    }

    const rows = result.row || [];

    for (const row of rows) {
      const lat = parseFloat(row.LAT);
      const lng = parseFloat(row.LOT);

      // 유효하지 않은 좌표 필터링
      if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) continue;

      const startDate = parseSeoulDate(row.STRTDATE);
      const endDate = parseSeoulDate(row.END_DATE);

      if (!startDate || !endDate) continue;

      const isFree = row.IS_FREE === '무료' || row.USE_FEE === '무료';

      events.push({
        sourceId: `seoul-${row.SVCID}`,
        name: row.TITLE,
        description: null,
        eventType: classifySeoulEventType(row.CODENAME, row.TITLE),
        startDate,
        endDate,
        venue: row.PLACE,
        address: `서울특별시 ${row.GUNAME} ${row.PLACE}`,
        latitude: lat,
        longitude: lng,
        district: row.GUNAME || null,
        city: '서울특별시',
        imageUrl: row.MAIN_IMG || null,
        sourceUrl: row.HMPG_ADDR || null,
        isFree,
        price: isFree ? null : row.USE_FEE || null,
        organizer: row.ORG_NAME || null,
        contactInfo: null,
        website: row.HMPG_ADDR || null,
      });
    }

    // 마지막 페이지 체크
    if (end >= result.list_total_count) break;
    start = end + 1;
  }

  console.log(`[서울 열린데이터] 총 ${events.length}개 행사 수집 완료`);
  return events;
}

// ────────────────────────────────────────────────────────────────
// 공통 유틸리티
// ────────────────────────────────────────────────────────────────

/**
 * 수도권(서울/인천/경기) 범위 내 이벤트만 필터링합니다.
 * 위도: 36.9 ~ 38.0, 경도: 126.3 ~ 127.8
 */
export function filterMetropolitanArea(events: PublicEventRaw[]): PublicEventRaw[] {
  return events.filter(
    (e) =>
      e.latitude >= 36.9 &&
      e.latitude <= 38.0 &&
      e.longitude >= 126.3 &&
      e.longitude <= 127.8,
  );
}

/**
 * 두 이벤트 배열을 sourceId 기준으로 중복 제거하며 병합합니다.
 * apiEvents가 curatedEvents보다 우선됩니다.
 */
export function mergeEventSources(
  curatedEvents: PublicEventRaw[],
  ...apiEventArrays: PublicEventRaw[][]
): PublicEventRaw[] {
  const map = new Map<string, PublicEventRaw>();

  // 큐레이션 데이터를 먼저 추가
  for (const e of curatedEvents) {
    map.set(e.sourceId, e);
  }

  // API 데이터로 덮어쓰기 (중복 sourceId는 API 데이터 우선)
  for (const apiEvents of apiEventArrays) {
    for (const e of apiEvents) {
      map.set(e.sourceId, e);
    }
  }

  return Array.from(map.values());
}

/**
 * 모든 공공 API에서 이벤트를 가져오는 통합 함수입니다.
 * 환경변수에 API 키가 없으면 해당 API는 건너뜁니다.
 *
 * 수집 소스 (TourAPI 4.0):
 *   1. festivalList1   - 서울/인천/경기 기간별 축제 목록
 *   2. searchKeyword1  - 플리마켓·야시장 키워드 검색 (보완)
 *   3. areaBasedList1  - 지역+콘텐츠타입 기반 행사·마켓 공간 (보완)
 * 추가 소스:
 *   4. 서울 열린데이터광장 culturalEventInfo - 서울 문화행사
 *
 * 중복 처리: sourceId 기준으로 중복 이벤트는 자동 제거됩니다.
 */
export async function fetchAllPublicEvents(): Promise<{
  tourApiEvents: PublicEventRaw[];
  tourApiMarketEvents: PublicEventRaw[];
  tourApiAreaBasedEvents: PublicEventRaw[];
  seoulEvents: PublicEventRaw[];
  total: number;
}> {
  const tourApiKey = process.env.TOUR_API_KEY;
  const seoulOpenDataKey = process.env.SEOUL_OPEN_DATA_KEY;

  const results = await Promise.allSettled([
    // 1. 기간별 축제 목록 (festivalList1)
    tourApiKey
      ? fetchTourApiFestivals(tourApiKey)
      : Promise.resolve([] as PublicEventRaw[]),
    // 2. 키워드 기반 마켓 검색 (searchKeyword1)
    tourApiKey
      ? fetchTourApiMarkets(tourApiKey)
      : Promise.resolve([] as PublicEventRaw[]),
    // 3. 지역 기반 행사·마켓 목록 (areaBasedList1)
    tourApiKey
      ? fetchTourApiAreaBasedEvents(tourApiKey)
      : Promise.resolve([] as PublicEventRaw[]),
    // 4. 서울 열린데이터광장
    seoulOpenDataKey
      ? fetchSeoulCulturalEvents(seoulOpenDataKey)
      : Promise.resolve([] as PublicEventRaw[]),
  ]);

  const tourApiEvents =
    results[0].status === 'fulfilled'
      ? filterMetropolitanArea(results[0].value)
      : [];

  const tourApiMarketEvents =
    results[1].status === 'fulfilled'
      ? filterMetropolitanArea(results[1].value)
      : [];

  const tourApiAreaBasedEvents =
    results[2].status === 'fulfilled'
      ? filterMetropolitanArea(results[2].value)
      : [];

  const seoulEvents =
    results[3].status === 'fulfilled'
      ? filterMetropolitanArea(results[3].value)
      : [];

  if (results[0].status === 'rejected') {
    console.warn('[TourAPI 축제] 가져오기 실패:', results[0].reason);
  }
  if (results[1].status === 'rejected') {
    console.warn('[TourAPI 마켓] 가져오기 실패:', results[1].reason);
  }
  if (results[2].status === 'rejected') {
    console.warn('[TourAPI 지역기반] 가져오기 실패:', results[2].reason);
  }
  if (results[3].status === 'rejected') {
    console.warn('[서울 열린데이터] 가져오기 실패:', results[3].reason);
  }

  if (!tourApiKey) {
    console.log('[TourAPI] TOUR_API_KEY 미설정 - TourAPI 소스 전체 건너뜀');
  }
  if (!seoulOpenDataKey) {
    console.log('[서울 열린데이터] SEOUL_OPEN_DATA_KEY 미설정 - 건너뜀');
  }

  return {
    tourApiEvents,
    tourApiMarketEvents,
    tourApiAreaBasedEvents,
    seoulEvents,
    total:
      tourApiEvents.length +
      tourApiMarketEvents.length +
      tourApiAreaBasedEvents.length +
      seoulEvents.length,
  };
}
