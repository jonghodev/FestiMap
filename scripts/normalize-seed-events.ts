#!/usr/bin/env tsx
/**
 * 공공 API 데이터를 FestiMap 이벤트 스키마로 변환하여 시드 데이터 파일로 저장
 *
 * 사용법:
 *   npx tsx scripts/normalize-seed-events.ts
 *   # 또는
 *   npm run events:normalize
 *
 * 동작 방식:
 *   1. 공공 API (TourAPI / 서울 열린데이터광장) 또는 큐레이션 데이터를 입력으로 받음
 *   2. PublicEventRaw 형식 → 앱 이벤트 스키마로 정규화/변환
 *   3. 변환된 데이터를 prisma/seed-data.json 파일로 저장
 *
 * 스키마 매핑 (PublicEventRaw → SeedEventRecord):
 *   sourceId       → sourceId       (고유 식별자, 중복 제거 기준)
 *   name           → name           (행사명)
 *   description    → description    (설명, null 가능)
 *   eventType      → eventType      (FESTIVAL | FLEA_MARKET | NIGHT_MARKET)
 *   startDate      → startDate      (시작일, Date → "YYYY-MM-DD" 문자열)
 *   endDate        → endDate        (종료일, Date → "YYYY-MM-DD" 문자열)
 *   venue          → venue          (장소명)
 *   address        → address        (주소)
 *   latitude       → latitude       (위도)
 *   longitude      → longitude      (경도)
 *   district       → district       (자치구, null 가능)
 *   city           → city           (시/도)
 *   imageUrl       → imageUrl       (이미지 URL, null 가능)
 *   sourceUrl      → sourceUrl      (원본 출처 URL, null 가능)
 *   isFree         → isFree         (무료 여부)
 *   price          → price          (가격 정보, null 가능)
 *   organizer      → organizer      (주최 기관, null 가능)
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  fetchAllPublicEvents,
  mergeEventSources,
  filterMetropolitanArea,
  type PublicEventRaw,
} from '../src/lib/api/public-events';

// ────────────────────────────────────────────────────────────────
// 타입 정의
// ────────────────────────────────────────────────────────────────

/**
 * seed-data.json에 저장되는 정규화된 이벤트 레코드
 * Prisma Event 모델의 직렬화 가능한 형태
 * (Date 객체 대신 ISO 날짜 문자열 "YYYY-MM-DD" 사용)
 */
export interface SeedEventRecord {
  sourceId: string;
  name: string;
  description: string | null;
  eventType: 'FESTIVAL' | 'FLEA_MARKET' | 'NIGHT_MARKET';
  startDate: string;   // "YYYY-MM-DD"
  endDate: string;     // "YYYY-MM-DD"
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
  /** 연락처 정보 (전화번호, 이메일 등) */
  contactInfo?: string | null;
  /** 공식 웹사이트 URL */
  website?: string | null;
}

// ────────────────────────────────────────────────────────────────
// 변환 함수
// ────────────────────────────────────────────────────────────────

/**
 * Date 객체를 "YYYY-MM-DD" 형식의 문자열로 변환
 */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * PublicEventRaw (API/큐레이션 형식) → SeedEventRecord (정규화된 스키마)
 *
 * 변환 규칙:
 * - Date 객체 → ISO 날짜 문자열 (JSON 직렬화를 위해)
 * - 모든 필드 명시적 매핑 (스키마 불일치 방지)
 * - 유효성 검사: 좌표, 날짜 필수값 확인
 * - 수도권 좌표 범위 검증 (위도 36.9~38.0, 경도 126.3~127.8)
 */
export function normalizeEvent(raw: PublicEventRaw): SeedEventRecord | null {
  // 필수 좌표 검증
  if (
    isNaN(raw.latitude) ||
    isNaN(raw.longitude) ||
    raw.latitude === 0 ||
    raw.longitude === 0
  ) {
    console.warn(`[스킵] 유효하지 않은 좌표: ${raw.sourceId} (${raw.latitude}, ${raw.longitude})`);
    return null;
  }

  // 수도권 범위 검증 (서울/인천/경기)
  if (
    raw.latitude < 36.9 ||
    raw.latitude > 38.0 ||
    raw.longitude < 126.3 ||
    raw.longitude > 127.8
  ) {
    console.warn(`[스킵] 수도권 범위 외: ${raw.sourceId} (${raw.latitude}, ${raw.longitude})`);
    return null;
  }

  // 날짜 유효성 검증
  if (!(raw.startDate instanceof Date) || isNaN(raw.startDate.getTime())) {
    console.warn(`[스킵] 유효하지 않은 시작일: ${raw.sourceId}`);
    return null;
  }
  if (!(raw.endDate instanceof Date) || isNaN(raw.endDate.getTime())) {
    console.warn(`[스킵] 유효하지 않은 종료일: ${raw.sourceId}`);
    return null;
  }

  // 종료일이 시작일보다 이른 경우 시작일로 보정
  const endDate = raw.endDate < raw.startDate ? raw.startDate : raw.endDate;

  return {
    sourceId: raw.sourceId,
    name: raw.name.trim(),
    description: raw.description?.trim() || null,
    eventType: raw.eventType,
    startDate: formatDate(raw.startDate),
    endDate: formatDate(endDate),
    venue: raw.venue.trim(),
    address: raw.address.trim(),
    latitude: Math.round(raw.latitude * 1_000_000) / 1_000_000,  // 소수점 6자리 정규화
    longitude: Math.round(raw.longitude * 1_000_000) / 1_000_000,
    district: raw.district?.trim() || null,
    city: raw.city.trim(),
    imageUrl: raw.imageUrl || null,
    sourceUrl: raw.sourceUrl || null,
    isFree: raw.isFree,
    price: raw.price?.trim() || null,
    organizer: raw.organizer?.trim() || null,
    contactInfo: raw.contactInfo?.trim() || null,
    website: raw.website?.trim() || null,
  };
}

/**
 * PublicEventRaw 배열을 SeedEventRecord 배열로 일괄 변환
 * 유효하지 않은 항목은 자동으로 제외됩니다.
 */
export function normalizeEvents(events: PublicEventRaw[]): SeedEventRecord[] {
  const results: SeedEventRecord[] = [];
  for (const event of events) {
    const normalized = normalizeEvent(event);
    if (normalized) results.push(normalized);
  }
  return results;
}

/**
 * SeedEventRecord 배열을 JSON 파일로 저장
 */
export function saveSeedData(
  events: SeedEventRecord[],
  outputPath: string,
): void {
  const json = JSON.stringify(events, null, 2);
  fs.writeFileSync(outputPath, json, 'utf-8');
  console.log(`✅ 시드 데이터 저장 완료: ${outputPath} (${events.length}개 행사)`);
}

/**
 * 기존 seed-data.json에서 SeedEventRecord 배열을 불러옵니다.
 * prisma/seed.ts에서 사용합니다.
 */
export function loadSeedData(inputPath: string): SeedEventRecord[] {
  const content = fs.readFileSync(inputPath, 'utf-8');
  return JSON.parse(content) as SeedEventRecord[];
}

// ────────────────────────────────────────────────────────────────
// .env 파일 수동 로드 (Next.js 밖에서 실행 시 필요)
// ────────────────────────────────────────────────────────────────
function loadEnvFile(filePath: string) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch {
    // 파일 없으면 무시
  }
}

// ────────────────────────────────────────────────────────────────
// 큐레이션 이벤트 (API 미사용 시 기본 데이터)
// ────────────────────────────────────────────────────────────────
// 참고: 이 데이터는 prisma/seed-data.json 파일의 소스입니다.
// API 키 없이도 50개 이상의 수도권 행사 데이터를 제공합니다.
const CURATED_EVENTS: PublicEventRaw[] = [
  // 축제 (FESTIVAL) ─────────────────────────────────────────────
  {
    sourceId: 'festival-001', name: '서울 봄꽃 축제',
    description: '서울 전역의 봄꽃을 즐기는 대규모 축제. 벚꽃, 진달래, 개나리가 만개하는 계절에 열립니다.',
    eventType: 'FESTIVAL', startDate: new Date('2026-04-01'), endDate: new Date('2026-04-14'),
    venue: '여의도한강공원', address: '서울특별시 영등포구 여의서로 330',
    latitude: 37.5289, longitude: 126.9317, district: '영등포구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '서울시',
  },
  {
    sourceId: 'festival-002', name: '서울 재즈 페스티벌',
    description: '국내외 유명 재즈 뮤지션들이 함께하는 음악 축제. 올림픽공원에서 열리는 최대 재즈 페스티벌.',
    eventType: 'FESTIVAL', startDate: new Date('2026-05-22'), endDate: new Date('2026-05-24'),
    venue: '올림픽공원 88잔디마당', address: '서울특별시 송파구 올림픽로 424',
    latitude: 37.5204, longitude: 127.1218, district: '송파구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: false, price: '1일권 99,000원', organizer: '서울재즈페스티벌 조직위원회',
  },
  {
    sourceId: 'festival-003', name: '한강 불꽃 축제',
    description: '서울 한강에서 펼쳐지는 화려한 불꽃놀이 축제. 매년 100만 명 이상이 방문하는 서울 최대 축제.',
    eventType: 'FESTIVAL', startDate: new Date('2026-10-03'), endDate: new Date('2026-10-03'),
    venue: '여의도한강공원', address: '서울특별시 영등포구 여의서로 330',
    latitude: 37.5289, longitude: 126.9317, district: '영등포구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '서울시',
  },
  {
    sourceId: 'festival-004', name: '광화문 빛 축제',
    description: '광화문 광장 일대를 화려한 빛으로 물들이는 겨울 축제. LED 조명과 미디어아트로 가득한 특별한 야경.',
    eventType: 'FESTIVAL', startDate: new Date('2026-12-01'), endDate: new Date('2027-01-10'),
    venue: '광화문광장', address: '서울특별시 종로구 세종대로 172',
    latitude: 37.5759, longitude: 126.9769, district: '종로구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '서울시',
  },
  {
    sourceId: 'festival-005', name: '서울 국제불꽃축제',
    description: '세계 각국의 불꽃팀이 참가하는 국제 불꽃 경연대회. 한강변에서 펼쳐지는 환상적인 불꽃쇼.',
    eventType: 'FESTIVAL', startDate: new Date('2026-10-03'), endDate: new Date('2026-10-03'),
    venue: '반포한강공원', address: '서울특별시 서초구 신반포로11길 40',
    latitude: 37.5096, longitude: 126.9959, district: '서초구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '한화',
  },
  {
    sourceId: 'festival-006', name: '홍대 인디음악 페스티벌',
    description: '홍대 앞 거리에서 열리는 인디뮤지션들의 음악 축제. 다양한 장르의 음악을 무료로 즐길 수 있습니다.',
    eventType: 'FESTIVAL', startDate: new Date('2026-06-13'), endDate: new Date('2026-06-14'),
    venue: '홍대 걷고싶은거리', address: '서울특별시 마포구 와우산로 29',
    latitude: 37.5545, longitude: 126.9226, district: '마포구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '홍대 문화예술회',
  },
  {
    sourceId: 'festival-007', name: '서울 푸드트럭 페스티벌',
    description: '다양한 먹거리를 즐길 수 있는 푸드트럭 축제. 국내외 다양한 음식을 한자리에서 경험할 수 있습니다.',
    eventType: 'FESTIVAL', startDate: new Date('2026-05-01'), endDate: new Date('2026-05-03'),
    venue: '서울광장', address: '서울특별시 중구 세종대로 110',
    latitude: 37.5663, longitude: 126.9779, district: '중구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '서울시',
  },
  {
    sourceId: 'festival-008', name: '북촌 한옥마을 문화축제',
    description: '전통 한옥마을에서 열리는 문화 축제. 한복 체험, 전통 공예, 국악 공연 등 다양한 프로그램이 있습니다.',
    eventType: 'FESTIVAL', startDate: new Date('2026-09-19'), endDate: new Date('2026-09-21'),
    venue: '북촌한옥마을', address: '서울특별시 종로구 북촌로 일대',
    latitude: 37.5817, longitude: 126.9838, district: '종로구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '종로구',
  },
  {
    sourceId: 'festival-009', name: '서울 영화제',
    description: '서울을 대표하는 독립영화 영화제. 다양한 장르의 독립영화를 상영하며 감독과의 대화도 진행됩니다.',
    eventType: 'FESTIVAL', startDate: new Date('2026-04-08'), endDate: new Date('2026-04-17'),
    venue: '메가박스 코엑스', address: '서울특별시 강남구 영동대로 513',
    latitude: 37.5126, longitude: 127.0594, district: '강남구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: false, price: '편당 12,000원', organizer: '서울영화위원회',
  },
  {
    sourceId: 'festival-010', name: '이태원 글로벌 빌리지 페스타',
    description: '세계 각국의 문화를 체험할 수 있는 다문화 축제. 이태원 거리에서 펼쳐지는 글로벌 문화 한마당.',
    eventType: 'FESTIVAL', startDate: new Date('2026-10-03'), endDate: new Date('2026-10-05'),
    venue: '이태원로 일대', address: '서울특별시 용산구 이태원로',
    latitude: 37.5344, longitude: 126.9940, district: '용산구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '용산구',
  },
  {
    sourceId: 'festival-011', name: '잠실 루나파크 벚꽃 축제',
    description: '잠실종합운동장 일대에서 열리는 봄 벚꽃 축제. 만개한 벚꽃 아래에서 다양한 공연을 즐길 수 있습니다.',
    eventType: 'FESTIVAL', startDate: new Date('2026-03-28'), endDate: new Date('2026-04-10'),
    venue: '잠실종합운동장', address: '서울특별시 송파구 올림픽로 25',
    latitude: 37.5141, longitude: 127.0734, district: '송파구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '송파구',
  },
  {
    sourceId: 'festival-012', name: '성북 달빛 야행',
    description: '성북동의 문화재와 골목길을 야간에 걷는 야행 프로그램. 밤에 더욱 빛나는 역사 유적을 탐방합니다.',
    eventType: 'FESTIVAL', startDate: new Date('2026-05-15'), endDate: new Date('2026-05-16'),
    venue: '성북동 문화재 일대', address: '서울특별시 성북구 성북동',
    latitude: 37.5929, longitude: 126.9995, district: '성북구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: false, price: '5,000원', organizer: '성북구',
  },
  {
    sourceId: 'festival-013', name: '인천 송도 맥주 축제',
    description: '송도 센트럴파크에서 열리는 국제 맥주 축제. 국내외 다양한 수제맥주를 한자리에서 즐길 수 있습니다.',
    eventType: 'FESTIVAL', startDate: new Date('2026-08-07'), endDate: new Date('2026-08-09'),
    venue: '송도 센트럴파크', address: '인천광역시 연수구 송도동 센트럴로 160',
    latitude: 37.3834, longitude: 126.6522, district: '연수구', city: '인천광역시',
    imageUrl: null, sourceUrl: null, isFree: false, price: '입장권 25,000원', organizer: '인천관광공사',
  },
  {
    sourceId: 'festival-014', name: '경기 수원 화성문화제',
    description: '유네스코 세계문화유산 수원 화성에서 열리는 전통 문화 축제. 행궁 재현, 무예 공연 등이 펼쳐집니다.',
    eventType: 'FESTIVAL', startDate: new Date('2026-10-07'), endDate: new Date('2026-10-11'),
    venue: '수원 화성행궁', address: '경기도 수원시 팔달구 행궁로 11',
    latitude: 37.2792, longitude: 127.0143, district: '팔달구', city: '경기도 수원시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '수원시',
  },
  {
    sourceId: 'festival-015', name: '서울 드럼 페스티벌',
    description: '세계 각국의 드럼 연주자들이 참여하는 음악 축제. 다채로운 리듬과 퍼포먼스를 즐길 수 있습니다.',
    eventType: 'FESTIVAL', startDate: new Date('2026-09-05'), endDate: new Date('2026-09-07'),
    venue: '난지한강공원', address: '서울특별시 마포구 하늘공원로 95',
    latitude: 37.5669, longitude: 126.8990, district: '마포구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '서울시',
  },
  {
    sourceId: 'festival-016', name: '강동 선사문화축제',
    description: '강동구 암사동 선사 유적지에서 열리는 선사 문화 축제. 선사시대 생활체험, 고인돌 만들기 등 체험 프로그램.',
    eventType: 'FESTIVAL', startDate: new Date('2026-05-15'), endDate: new Date('2026-05-17'),
    venue: '암사동 선사유적지', address: '서울특별시 강동구 올림픽로 875',
    latitude: 37.5499, longitude: 127.1279, district: '강동구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: false, price: '어른 500원', organizer: '강동구',
  },
  {
    sourceId: 'festival-017', name: '은평 봄 놀이마당',
    description: '진관사 계곡에서 열리는 봄 축제. 꽃놀이와 전통 문화 체험을 함께 즐길 수 있습니다.',
    eventType: 'FESTIVAL', startDate: new Date('2026-04-11'), endDate: new Date('2026-04-12'),
    venue: '진관사 주변', address: '서울특별시 은평구 진관길 73',
    latitude: 37.6429, longitude: 126.9159, district: '은평구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '은평구',
  },
  {
    sourceId: 'festival-018', name: '중랑 장미공원 축제',
    description: '중랑천 장미공원에서 열리는 봄 장미 축제. 수만 송이의 장미를 배경으로 다양한 문화 행사가 열립니다.',
    eventType: 'FESTIVAL', startDate: new Date('2026-05-15'), endDate: new Date('2026-06-07'),
    venue: '중랑천 장미공원', address: '서울특별시 중랑구 동일로 지하 1',
    latitude: 37.5998, longitude: 127.0821, district: '중랑구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '중랑구',
  },
  {
    sourceId: 'festival-019', name: '남산골 한마당',
    description: '남산골 한옥마을에서 펼쳐지는 전통문화 한마당. 전통 공연, 민속놀이 체험 등 다채로운 프로그램.',
    eventType: 'FESTIVAL', startDate: new Date('2026-05-01'), endDate: new Date('2026-05-05'),
    venue: '남산골 한옥마을', address: '서울특별시 중구 퇴계로34길 28',
    latitude: 37.5572, longitude: 126.9963, district: '중구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '서울시',
  },
  {
    sourceId: 'festival-020', name: '신촌 물총축제',
    description: '신촌 거리에서 열리는 물총 축제. 여름 더위를 날리는 시원한 물총 배틀.',
    eventType: 'FESTIVAL', startDate: new Date('2026-07-25'), endDate: new Date('2026-07-26'),
    venue: '신촌 연세로', address: '서울특별시 서대문구 연세로',
    latitude: 37.5583, longitude: 126.9368, district: '서대문구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '신촌문화발전소',
  },
  // 플리마켓 (FLEA_MARKET) ───────────────────────────────────────
  {
    sourceId: 'flea-001', name: '마포 희망 나눔 플리마켓',
    description: '매주 주말 한강변에서 열리는 플리마켓. 핸드메이드 작품, 빈티지 의류, 음식 등을 판매합니다.',
    eventType: 'FLEA_MARKET', startDate: new Date('2026-03-28'), endDate: new Date('2026-11-30'),
    venue: '망원한강공원', address: '서울특별시 마포구 마포나루길 467',
    latitude: 37.5550, longitude: 126.9039, district: '마포구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '마포구',
  },
  {
    sourceId: 'flea-002', name: '홍대 앞 토요플리마켓',
    description: '홍대 앞 놀이터에서 매주 토요일 열리는 플리마켓. 아티스트들의 작품과 빈티지 아이템을 구경할 수 있습니다.',
    eventType: 'FLEA_MARKET', startDate: new Date('2026-03-28'), endDate: new Date('2026-11-30'),
    venue: '홍대 어울마당', address: '서울특별시 마포구 어울마당로 35',
    latitude: 37.5557, longitude: 126.9235, district: '마포구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '홍대 아트마켓',
  },
  {
    sourceId: 'flea-003', name: '인사동 쌈지길 플리마켓',
    description: '인사동 쌈지길에서 열리는 주말 플리마켓. 전통 공예품과 현대 아트 작품을 함께 만날 수 있습니다.',
    eventType: 'FLEA_MARKET', startDate: new Date('2026-03-28'), endDate: new Date('2026-11-30'),
    venue: '쌈지길', address: '서울특별시 종로구 인사동길 44',
    latitude: 37.5747, longitude: 126.9854, district: '종로구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '쌈지문화재단',
  },
  {
    sourceId: 'flea-004', name: '성수 빈티지 마켓',
    description: '성수동 수제화 거리에서 열리는 빈티지 플리마켓. 빈티지 의류, 소품, 빈티지 가구 등을 만날 수 있습니다.',
    eventType: 'FLEA_MARKET', startDate: new Date('2026-04-04'), endDate: new Date('2026-11-28'),
    venue: '성수동 수제화거리', address: '서울특별시 성동구 성수이로 78',
    latitude: 37.5447, longitude: 127.0574, district: '성동구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '성동구',
  },
  {
    sourceId: 'flea-005', name: '동묘 구제 플리마켓',
    description: '동묘 앞 구제 시장과 함께하는 플리마켓. 저렴한 빈티지 의류와 중고 물품을 구입할 수 있습니다.',
    eventType: 'FLEA_MARKET', startDate: new Date('2026-03-28'), endDate: new Date('2026-11-30'),
    venue: '동묘앞 구제거리', address: '서울특별시 종로구 창신동 동묘앞역 인근',
    latitude: 37.5702, longitude: 127.0181, district: '종로구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '종로구',
  },
  {
    sourceId: 'flea-006', name: '코엑스 별마당 도서관 플리마켓',
    description: '별마당 도서관에서 열리는 책과 문화 플리마켓. 중고 도서, 독립 출판물, 문화 상품을 만날 수 있습니다.',
    eventType: 'FLEA_MARKET', startDate: new Date('2026-04-11'), endDate: new Date('2026-11-28'),
    venue: '코엑스 별마당 도서관', address: '서울특별시 강남구 영동대로 513 코엑스몰',
    latitude: 37.5126, longitude: 127.0594, district: '강남구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '현대백화점',
  },
  {
    sourceId: 'flea-007', name: '뚝섬 한강 플리마켓',
    description: '뚝섬한강공원에서 열리는 주말 플리마켓. 핸드메이드 소품과 먹거리를 함께 즐길 수 있습니다.',
    eventType: 'FLEA_MARKET', startDate: new Date('2026-04-04'), endDate: new Date('2026-11-01'),
    venue: '뚝섬한강공원', address: '서울특별시 광진구 자양동 강변동로',
    latitude: 37.5300, longitude: 127.0674, district: '광진구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '광진구',
  },
  {
    sourceId: 'flea-008', name: '망원 빈티지 마켓',
    description: '망원동에서 열리는 빈티지 및 핸드메이드 상품 플리마켓. 개성 있는 소품과 패션 아이템이 가득합니다.',
    eventType: 'FLEA_MARKET', startDate: new Date('2026-04-04'), endDate: new Date('2026-11-28'),
    venue: '망원동 문화마당', address: '서울특별시 마포구 망원동',
    latitude: 37.5563, longitude: 126.9022, district: '마포구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '마포구',
  },
  {
    sourceId: 'flea-009', name: '서울숲 플리마켓',
    description: '서울숲 공원에서 열리는 친환경 플리마켓. 업사이클링 제품, 유기농 먹거리, 핸드메이드 소품을 판매합니다.',
    eventType: 'FLEA_MARKET', startDate: new Date('2026-04-04'), endDate: new Date('2026-10-31'),
    venue: '서울숲', address: '서울특별시 성동구 뚝섬로 273',
    latitude: 37.5446, longitude: 127.0380, district: '성동구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '성동구',
  },
  {
    sourceId: 'flea-010', name: '가로수길 아트마켓',
    description: '신사동 가로수길에서 열리는 아트 마켓. 젊은 아티스트들의 작품과 독특한 소품을 구입할 수 있습니다.',
    eventType: 'FLEA_MARKET', startDate: new Date('2026-04-11'), endDate: new Date('2026-11-28'),
    venue: '신사동 가로수길', address: '서울특별시 강남구 신사동 가로수길',
    latitude: 37.5205, longitude: 127.0231, district: '강남구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '강남구',
  },
  {
    sourceId: 'flea-011', name: '광장시장 상설 플리마켓',
    description: '광장시장 인근에서 열리는 주말 플리마켓. 전통 시장의 분위기와 현대적인 플리마켓이 어우러진 공간.',
    eventType: 'FLEA_MARKET', startDate: new Date('2026-03-28'), endDate: new Date('2026-11-30'),
    venue: '광장시장 앞 광장', address: '서울특별시 종로구 창경궁로 88',
    latitude: 37.5700, longitude: 126.9993, district: '종로구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '종로구',
  },
  {
    sourceId: 'flea-012', name: '경의선 책거리 플리마켓',
    description: '경의선 숲길에서 열리는 책 플리마켓. 중고 도서, 독립 출판물, 소장 도서를 합리적인 가격에 구입할 수 있습니다.',
    eventType: 'FLEA_MARKET', startDate: new Date('2026-04-04'), endDate: new Date('2026-11-28'),
    venue: '경의선 책거리', address: '서울특별시 마포구 신수동 경의선 숲길',
    latitude: 37.5497, longitude: 126.9324, district: '마포구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '마포구',
  },
  {
    sourceId: 'flea-013', name: '은평 뉴타운 플리마켓',
    description: '은평 뉴타운 광장에서 열리는 지역 주민 플리마켓. 중고 물품과 핸드메이드 제품을 판매합니다.',
    eventType: 'FLEA_MARKET', startDate: new Date('2026-04-11'), endDate: new Date('2026-10-31'),
    venue: '은평 뉴타운 중심상업지구', address: '서울특별시 은평구 은평뉴타운',
    latitude: 37.6201, longitude: 126.9117, district: '은평구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '은평구',
  },
  {
    sourceId: 'flea-014', name: '수원 행리단길 플리마켓',
    description: '수원 행리단길에서 열리는 인디 브랜드 플리마켓. 개성 있는 소품과 수공예 제품이 가득합니다.',
    eventType: 'FLEA_MARKET', startDate: new Date('2026-04-11'), endDate: new Date('2026-11-28'),
    venue: '수원 행리단길', address: '경기도 수원시 팔달구 화서문로',
    latitude: 37.2839, longitude: 127.0104, district: '팔달구', city: '경기도 수원시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '수원시',
  },
  {
    sourceId: 'flea-015', name: '부천 원미산 플리마켓',
    description: '부천 중앙공원에서 열리는 지역 주민 플리마켓. 다양한 중고 물품과 직접 만든 수공예품을 구입할 수 있습니다.',
    eventType: 'FLEA_MARKET', startDate: new Date('2026-04-11'), endDate: new Date('2026-10-31'),
    venue: '부천 중앙공원', address: '경기도 부천시 원미구 원미동',
    latitude: 37.4998, longitude: 126.7668, district: '원미구', city: '경기도 부천시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '부천시',
  },
  {
    sourceId: 'flea-016', name: '이촌 한가람 플리마켓',
    description: '이촌 한강공원에서 열리는 가족 친화적인 플리마켓. 어린이 물품, 가족용 중고 제품을 거래합니다.',
    eventType: 'FLEA_MARKET', startDate: new Date('2026-04-11'), endDate: new Date('2026-10-31'),
    venue: '이촌한강공원', address: '서울특별시 용산구 이촌로 72',
    latitude: 37.5204, longitude: 126.9606, district: '용산구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '용산구',
  },
  {
    sourceId: 'flea-017', name: '마포 문화비축기지 마켓',
    description: '문화비축기지에서 열리는 특별 마켓. 예술가들의 작품과 친환경 제품, 독립 브랜드 제품을 만날 수 있습니다.',
    eventType: 'FLEA_MARKET', startDate: new Date('2026-04-11'), endDate: new Date('2026-10-31'),
    venue: '문화비축기지', address: '서울특별시 마포구 증산로 87',
    latitude: 37.5769, longitude: 126.9069, district: '마포구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '문화비축기지',
  },
  {
    sourceId: 'flea-018', name: '성동 도시재생 플리마켓',
    description: '성동구 도시재생 공간에서 열리는 창업 플리마켓. 청년 창업가들의 새로운 제품을 만날 수 있습니다.',
    eventType: 'FLEA_MARKET', startDate: new Date('2026-04-11'), endDate: new Date('2026-11-28'),
    venue: '성수 카페거리', address: '서울특별시 성동구 서울숲2길',
    latitude: 37.5474, longitude: 127.0413, district: '성동구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '성동구',
  },
  // 야시장 (NIGHT_MARKET) ─────────────────────────────────────────
  {
    sourceId: 'night-001', name: '서울 밤도깨비 야시장 여의도',
    description: '여의도한강공원에서 열리는 밤도깨비 야시장. 다양한 먹거리와 핸드메이드 제품을 판매합니다.',
    eventType: 'NIGHT_MARKET', startDate: new Date('2026-04-03'), endDate: new Date('2026-10-31'),
    venue: '여의도한강공원', address: '서울특별시 영등포구 여의서로 330',
    latitude: 37.5289, longitude: 126.9317, district: '영등포구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '서울시',
  },
  {
    sourceId: 'night-002', name: '서울 밤도깨비 야시장 반포',
    description: '반포한강공원에서 열리는 밤도깨비 야시장. 분수쇼와 함께 즐기는 야경이 아름다운 야시장.',
    eventType: 'NIGHT_MARKET', startDate: new Date('2026-04-03'), endDate: new Date('2026-10-31'),
    venue: '반포한강공원', address: '서울특별시 서초구 신반포로11길 40',
    latitude: 37.5096, longitude: 126.9959, district: '서초구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '서울시',
  },
  {
    sourceId: 'night-003', name: '서울 밤도깨비 야시장 청계천',
    description: '청계광장에서 열리는 밤도깨비 야시장. 청계천의 야경과 함께하는 특별한 야시장.',
    eventType: 'NIGHT_MARKET', startDate: new Date('2026-04-03'), endDate: new Date('2026-10-31'),
    venue: '청계광장', address: '서울특별시 종로구 청계천로 1',
    latitude: 37.5702, longitude: 126.9784, district: '종로구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '서울시',
  },
  {
    sourceId: 'night-004', name: '서울 밤도깨비 야시장 DDP',
    description: 'DDP 동대문디자인플라자 앞에서 열리는 밤도깨비 야시장. 패션과 문화가 어우러진 야시장.',
    eventType: 'NIGHT_MARKET', startDate: new Date('2026-04-03'), endDate: new Date('2026-10-31'),
    venue: '동대문 DDP', address: '서울특별시 중구 을지로 281',
    latitude: 37.5657, longitude: 127.0094, district: '중구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '서울시',
  },
  {
    sourceId: 'night-005', name: '홍대 클럽 데이 야시장',
    description: '홍대 앞 클럽 데이에 함께 열리는 야시장. 인디 음악과 함께 즐기는 밤의 먹거리와 문화.',
    eventType: 'NIGHT_MARKET', startDate: new Date('2026-03-28'), endDate: new Date('2026-11-30'),
    venue: '홍대 걷고싶은거리', address: '서울특별시 마포구 와우산로 29',
    latitude: 37.5545, longitude: 126.9226, district: '마포구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '마포구',
  },
  {
    sourceId: 'night-006', name: '광장시장 야시장',
    description: '광장시장에서 밤에 더욱 활기차게 열리는 야시장. 빈대떡, 마약김밥 등 전통 먹거리를 야간에 즐깁니다.',
    eventType: 'NIGHT_MARKET', startDate: new Date('2026-03-28'), endDate: new Date('2026-11-30'),
    venue: '광장시장', address: '서울특별시 종로구 창경궁로 88',
    latitude: 37.5700, longitude: 126.9993, district: '종로구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '광장시장상인회',
  },
  {
    sourceId: 'night-007', name: '이태원 야시장',
    description: '이태원 거리에서 매주 금·토·일 열리는 야시장. 다국적 음식과 문화를 밤에 즐길 수 있습니다.',
    eventType: 'NIGHT_MARKET', startDate: new Date('2026-03-28'), endDate: new Date('2026-11-30'),
    venue: '이태원로 일대', address: '서울특별시 용산구 이태원로',
    latitude: 37.5344, longitude: 126.9940, district: '용산구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '용산구',
  },
  {
    sourceId: 'night-008', name: '수원 야시장',
    description: '수원 화성 인근에서 열리는 야시장. 수원 왕갈비와 다양한 전통 음식을 밤에 즐길 수 있습니다.',
    eventType: 'NIGHT_MARKET', startDate: new Date('2026-04-03'), endDate: new Date('2026-10-31'),
    venue: '수원 팔달문 주변', address: '경기도 수원시 팔달구 팔달문로 1',
    latitude: 37.2756, longitude: 127.0187, district: '팔달구', city: '경기도 수원시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '수원시',
  },
  {
    sourceId: 'night-009', name: '인천 차이나타운 야시장',
    description: '인천 차이나타운에서 열리는 야시장. 중국 음식과 다양한 먹거리를 야간에 즐길 수 있습니다.',
    eventType: 'NIGHT_MARKET', startDate: new Date('2026-04-03'), endDate: new Date('2026-10-31'),
    venue: '인천 차이나타운', address: '인천광역시 중구 차이나타운로',
    latitude: 37.4740, longitude: 126.6163, district: '중구', city: '인천광역시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '인천관광공사',
  },
  {
    sourceId: 'night-010', name: '마포 홍어거리 야시장',
    description: '마포 홍어거리에서 매주 금·토 열리는 야시장. 홍어 요리와 다양한 해산물 먹거리가 가득합니다.',
    eventType: 'NIGHT_MARKET', startDate: new Date('2026-03-28'), endDate: new Date('2026-11-30'),
    venue: '마포 홍어거리', address: '서울특별시 마포구 마포대로 일대',
    latitude: 37.5471, longitude: 126.9500, district: '마포구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '마포구',
  },
  {
    sourceId: 'night-011', name: '강남 역삼 푸드 야시장',
    description: '역삼 테헤란로에서 열리는 직장인 야시장. 퇴근 후 즐기는 다양한 먹거리와 간식.',
    eventType: 'NIGHT_MARKET', startDate: new Date('2026-03-28'), endDate: new Date('2026-11-30'),
    venue: '역삼 테헤란로', address: '서울특별시 강남구 테헤란로 152',
    latitude: 37.5006, longitude: 127.0369, district: '강남구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '강남구',
  },
  {
    sourceId: 'night-012', name: '노원 불암골 야시장',
    description: '노원구 불암산 자락에서 열리는 지역 야시장. 동네 주민들의 손맛이 담긴 집밥 요리가 특징.',
    eventType: 'NIGHT_MARKET', startDate: new Date('2026-04-03'), endDate: new Date('2026-10-31'),
    venue: '불암골 광장', address: '서울특별시 노원구 상계동 불암골',
    latitude: 37.6519, longitude: 127.0804, district: '노원구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '노원구',
  },
  {
    sourceId: 'night-013', name: '잠원 야시장',
    description: '잠원한강공원에서 열리는 야시장. 한강 야경을 배경으로 다양한 먹거리와 공연을 즐깁니다.',
    eventType: 'NIGHT_MARKET', startDate: new Date('2026-04-03'), endDate: new Date('2026-10-31'),
    venue: '잠원한강공원', address: '서울특별시 서초구 잠원동',
    latitude: 37.5152, longitude: 127.0049, district: '서초구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '서초구',
  },
  {
    sourceId: 'night-014', name: '종로 피맛골 야시장',
    description: '종로 피맛골에서 매주 금·토 열리는 야시장. 전통 거리의 분위기와 함께 다양한 전통 음식을 즐깁니다.',
    eventType: 'NIGHT_MARKET', startDate: new Date('2026-03-28'), endDate: new Date('2026-11-30'),
    venue: '종로 피맛골', address: '서울특별시 종로구 종로 일대',
    latitude: 37.5710, longitude: 126.9832, district: '종로구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '종로구',
  },
  {
    sourceId: 'night-015', name: '해방촌 야시장',
    description: '해방촌 계단 거리에서 열리는 감성 야시장. 독립 크리에이터들의 작품과 개성 있는 음식이 가득합니다.',
    eventType: 'NIGHT_MARKET', startDate: new Date('2026-04-03'), endDate: new Date('2026-10-31'),
    venue: '해방촌 신흥시장', address: '서울특별시 용산구 신흥로 16',
    latitude: 37.5420, longitude: 126.9887, district: '용산구', city: '서울특별시',
    imageUrl: null, sourceUrl: null, isFree: true, price: null, organizer: '용산구',
  },
];

// ────────────────────────────────────────────────────────────────
// 디스크 캐시 로더
// ────────────────────────────────────────────────────────────────

/**
 * data/raw/merged-events.json 에서 PublicEventRaw 배열을 로드합니다.
 * 디스크의 데이터는 contactInfo, website, sourceUrl 등 더 풍부한 필드를 포함합니다.
 * 날짜 필드는 "YYYY-MM-DD" 문자열 → Date 객체로 변환합니다.
 */
function loadMergedEventsFromDisk(mergedEventsPath: string): PublicEventRaw[] | null {
  if (!fs.existsSync(mergedEventsPath)) return null;

  try {
    const content = fs.readFileSync(mergedEventsPath, 'utf-8');
    const json = JSON.parse(content);

    // { meta: ..., events: [...] } 또는 배열 형식 지원
    const rawEvents: unknown[] = Array.isArray(json)
      ? json
      : Array.isArray(json?.events)
      ? json.events
      : [];

    if (rawEvents.length === 0) return null;

    // 디스크 형식(문자열 날짜) → PublicEventRaw(Date 객체) 변환
    const events = rawEvents
      .map((e: unknown): PublicEventRaw | null => {
        const ev = e as Record<string, unknown>;
        const startStr = String(ev.startDate ?? '');
        const endStr = String(ev.endDate ?? '');
        const startDate = new Date(startStr + (startStr.length === 10 ? 'T00:00:00Z' : ''));
        const endDate = new Date(endStr + (endStr.length === 10 ? 'T00:00:00Z' : ''));

        // 유효하지 않은 날짜는 건너뜀
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;

        const sourceId = String(ev.sourceId ?? '');
        const name = String(ev.name ?? '');
        if (!sourceId || !name) return null;

        const eventTypeStr = String(ev.eventType ?? '');
        const eventType = (['FESTIVAL', 'FLEA_MARKET', 'NIGHT_MARKET'].includes(eventTypeStr)
          ? eventTypeStr
          : 'FESTIVAL') as 'FESTIVAL' | 'FLEA_MARKET' | 'NIGHT_MARKET';

        return {
          sourceId,
          name,
          description: ev.description != null ? String(ev.description) : null,
          eventType,
          startDate,
          endDate: endDate < startDate ? startDate : endDate,
          venue: String(ev.venue ?? ''),
          address: String(ev.address ?? ''),
          latitude: Number(ev.latitude) || 0,
          longitude: Number(ev.longitude) || 0,
          district: ev.district != null ? String(ev.district) : null,
          city: String(ev.city ?? '서울특별시'),
          imageUrl: ev.imageUrl != null ? String(ev.imageUrl) : null,
          sourceUrl: ev.sourceUrl != null ? String(ev.sourceUrl) : null,
          isFree: Boolean(ev.isFree),
          price: ev.price != null ? String(ev.price) : null,
          organizer: ev.organizer != null ? String(ev.organizer) : null,
          // contactInfo와 website는 PublicEventRaw에서 선택적 필드
          contactInfo: ev.contactInfo != null ? String(ev.contactInfo) : null,
          website: ev.website != null ? String(ev.website) : null,
        };
      })
      .filter((e): e is PublicEventRaw => e !== null);

    return events.length > 0 ? events : null;
  } catch (err) {
    console.warn(`  ⚠️  디스크 캐시 로드 실패 (${mergedEventsPath}): ${err}`);
    return null;
  }
}

// ────────────────────────────────────────────────────────────────
// 메인 실행
// ────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔄 FestiMap 이벤트 데이터 정규화 시작...\n');

  // 환경변수 로드
  loadEnvFile(path.resolve(process.cwd(), '.env.local'));
  loadEnvFile(path.resolve(process.cwd(), '.env'));

  // 1. 공공 API에서 데이터 가져오기 (API 키가 있는 경우)
  let apiEvents: PublicEventRaw[] = [];
  let tourApiCount = 0;
  let seoulApiCount = 0;

  if (process.env.TOUR_API_KEY || process.env.SEOUL_OPEN_DATA_KEY) {
    console.log('📡 공공 API 데이터 수집 중...');
    const { tourApiEvents, tourApiMarketEvents, tourApiAreaBasedEvents, seoulEvents } = await fetchAllPublicEvents();
    tourApiCount = tourApiEvents.length + tourApiMarketEvents.length + tourApiAreaBasedEvents.length;
    seoulApiCount = seoulEvents.length;

    // fetchAllPublicEvents가 이미 filterMetropolitanArea를 적용함
    apiEvents = [...tourApiEvents, ...tourApiMarketEvents, ...tourApiAreaBasedEvents, ...seoulEvents];

    console.log(`  - 한국관광공사 TourAPI (축제/festivalList1): ${tourApiEvents.length}개`);
    console.log(`  - 한국관광공사 TourAPI (마켓/searchKeyword1): ${tourApiMarketEvents.length}개`);
    console.log(`  - 한국관광공사 TourAPI (지역기반/areaBasedList1): ${tourApiAreaBasedEvents.length}개`);
    console.log(`  - 서울 열린데이터광장: ${seoulApiCount}개`);
  } else {
    console.log('ℹ️  API 키 미설정 - 큐레이션 데이터만 사용합니다.');
    console.log('   (TOUR_API_KEY, SEOUL_OPEN_DATA_KEY 환경변수 설정 시 API 데이터 포함)');
  }

  // 2. 큐레이션 데이터 결정:
  //    API 키가 없는 경우, data/raw/merged-events.json 디스크 캐시를 우선 사용합니다.
  //    디스크 캐시는 contactInfo, website, sourceUrl 등 더 풍부한 필드를 포함합니다.
  const mergedEventsPath = path.resolve(process.cwd(), 'data', 'raw', 'merged-events.json');
  let baseCuratedEvents: PublicEventRaw[] = CURATED_EVENTS;

  if (apiEvents.length === 0) {
    const diskEvents = loadMergedEventsFromDisk(mergedEventsPath);
    if (diskEvents && diskEvents.length > 0) {
      baseCuratedEvents = diskEvents;
      console.log(`\n📂 디스크 캐시 로드: data/raw/merged-events.json (${diskEvents.length}개, contactInfo/website 포함)`);
    } else {
      console.log('\n📦 내장 큐레이션 데이터 사용 (기본 필드만 포함)');
    }
  }

  // 3. 데이터 병합 (큐레이션 + API)
  const merged = mergeEventSources(baseCuratedEvents, apiEvents);
  console.log(`\n📊 병합 결과: ${baseCuratedEvents.length}개 (큐레이션) + ${apiEvents.length}개 (API) → ${merged.length}개 (중복 제거 후)\n`);

  // 3. 정규화: PublicEventRaw → SeedEventRecord
  console.log('🔧 스키마 변환 및 정규화 중...');
  const normalized = normalizeEvents(merged);

  if (normalized.length < 50) {
    console.warn(`⚠️  경고: 정규화된 행사 수(${normalized.length})가 50개 미만입니다.`);
  }

  // 4. 유형별 통계
  const stats = normalized.reduce(
    (acc, e) => {
      acc[e.eventType] = (acc[e.eventType] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  console.log(`\n📈 유형별 통계:`);
  console.log(`  - 축제 (FESTIVAL):     ${stats.FESTIVAL || 0}개`);
  console.log(`  - 플리마켓 (FLEA_MARKET): ${stats.FLEA_MARKET || 0}개`);
  console.log(`  - 야시장 (NIGHT_MARKET):  ${stats.NIGHT_MARKET || 0}개`);
  console.log(`  - 합계:                ${normalized.length}개\n`);

  // 5. seed-data.json 파일로 저장
  const outputPath = path.resolve(process.cwd(), 'prisma', 'seed-data.json');
  saveSeedData(normalized, outputPath);

  console.log(`\n✅ 완료! prisma/seed-data.json 을 확인하세요.`);
  console.log(`   이 파일은 prisma/seed.ts 에서 자동으로 로드됩니다.`);
}

// 직접 실행 시에만 main() 호출 (import 시 자동 실행 방지)
const isDirectRun = process.argv[1]?.endsWith('normalize-seed-events.ts') ||
  process.argv[1]?.endsWith('normalize-seed-events.js');

if (isDirectRun) {
  main().catch((e) => {
    console.error('오류 발생:', e);
    process.exit(1);
  });
}
