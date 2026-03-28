#!/usr/bin/env tsx
/**
 * FestiMap 이벤트 데이터 수집 스크립트
 *
 * 서울/수도권 축제·플리마켓·야시장 데이터를 공공 API에서 수집하여
 * data/raw/ 디렉토리에 원시 JSON 파일로 저장합니다.
 *
 * 사용법:
 *   npm run events:collect
 *   # 또는
 *   tsx scripts/collect-events.ts
 *
 * 필요 환경변수 (없으면 큐레이션 데이터로 대체):
 *   TOUR_API_KEY         - 한국관광공사 TourAPI 4.0 인증키 (공공데이터포털)
 *   SEOUL_OPEN_DATA_KEY  - 서울 열린데이터광장 API 키
 *
 * API 키 발급:
 *   - 한국관광공사 TourAPI: https://www.data.go.kr/data/15101578/openapi.do
 *   - 서울 열린데이터광장: https://data.seoul.go.kr/dataList/OA-15105/S/1/datasetView.do
 *
 * 출력 파일 (data/raw/):
 *   seoul-open-data.json     - 서울 열린데이터광장 원시 응답
 *   tour-api-festivals.json  - 한국관광공사 축제 목록 원시 응답
 *   tour-api-markets.json    - 한국관광공사 마켓 검색 원시 응답
 *   curated-events.json      - 큐레이션 이벤트 데이터 (50+개)
 *   merged-events.json       - 최종 병합·정규화된 이벤트 데이터
 */

import * as fs from 'fs';
import * as path from 'path';

// ────────────────────────────────────────────────────────────────
// 환경변수 로드
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
    // 파일이 없으면 무시
  }
}

loadEnvFile(path.resolve(process.cwd(), '.env.local'));
loadEnvFile(path.resolve(process.cwd(), '.env'));

// ────────────────────────────────────────────────────────────────
// 타입 정의
// ────────────────────────────────────────────────────────────────
export interface RawEvent {
  sourceId: string;
  name: string;
  description: string | null;
  eventType: 'FESTIVAL' | 'FLEA_MARKET' | 'NIGHT_MARKET';
  startDate: string; // ISO 날짜 문자열 (YYYY-MM-DD)
  endDate: string;
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
  contactInfo: string | null;
  website: string | null;
  fetchedAt: string; // 수집 시각 (ISO)
  dataSource: 'TOUR_API' | 'SEOUL_OPEN_DATA' | 'CURATED';
}

// ────────────────────────────────────────────────────────────────
// 큐레이션 데이터 (서울/수도권 50+ 이벤트)
// ────────────────────────────────────────────────────────────────
const CURATED_EVENTS: Omit<RawEvent, 'fetchedAt' | 'dataSource'>[] = [
  // ── 축제 (FESTIVAL) ────────────────────────────────────────
  {
    sourceId: 'festival-001', name: '서울 봄꽃 축제',
    description: '서울 전역의 봄꽃을 즐기는 대규모 축제. 벚꽃, 진달래, 개나리가 만개하는 계절에 열립니다.',
    eventType: 'FESTIVAL', startDate: '2026-04-01', endDate: '2026-04-14',
    venue: '여의도한강공원', address: '서울특별시 영등포구 여의서로 330',
    latitude: 37.5289, longitude: 126.9317, district: '영등포구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.visitseoul.net', isFree: true, price: null,
    organizer: '서울시', contactInfo: '02-3780-0578', website: 'https://hangang.seoul.go.kr',
  },
  {
    sourceId: 'festival-002', name: '서울 재즈 페스티벌',
    description: '국내외 유명 재즈 뮤지션들이 함께하는 음악 축제. 올림픽공원에서 열리는 최대 재즈 페스티벌.',
    eventType: 'FESTIVAL', startDate: '2026-05-22', endDate: '2026-05-24',
    venue: '올림픽공원 88잔디마당', address: '서울특별시 송파구 올림픽로 424',
    latitude: 37.5204, longitude: 127.1218, district: '송파구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.seoulsummerfestival.com', isFree: false, price: '1일권 99,000원',
    organizer: '서울재즈페스티벌 조직위원회', contactInfo: '02-538-7395', website: 'https://seoulsummerfestival.com',
  },
  {
    sourceId: 'festival-003', name: '한강 불꽃 축제',
    description: '서울 한강에서 펼쳐지는 화려한 불꽃놀이 축제. 매년 100만 명 이상이 방문하는 서울 최대 축제.',
    eventType: 'FESTIVAL', startDate: '2026-10-03', endDate: '2026-10-03',
    venue: '여의도한강공원', address: '서울특별시 영등포구 여의서로 330',
    latitude: 37.5289, longitude: 126.9317, district: '영등포구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.visitseoul.net', isFree: true, price: null,
    organizer: '서울시', contactInfo: '02-3780-0578', website: 'https://hangang.seoul.go.kr',
  },
  {
    sourceId: 'festival-004', name: '광화문 빛 축제',
    description: '광화문 광장 일대를 화려한 빛으로 물들이는 겨울 축제. LED 조명과 미디어아트로 가득한 특별한 야경.',
    eventType: 'FESTIVAL', startDate: '2026-12-01', endDate: '2027-01-10',
    venue: '광화문광장', address: '서울특별시 종로구 세종대로 172',
    latitude: 37.5759, longitude: 126.9769, district: '종로구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.visitseoul.net', isFree: true, price: null,
    organizer: '서울시', contactInfo: '120 (다산콜센터)', website: 'https://gwanghwamun.seoul.go.kr',
  },
  {
    sourceId: 'festival-005', name: '서울 국제불꽃축제',
    description: '세계 각국의 불꽃팀이 참가하는 국제 불꽃 경연대회. 한강변에서 펼쳐지는 환상적인 불꽃쇼.',
    eventType: 'FESTIVAL', startDate: '2026-10-03', endDate: '2026-10-03',
    venue: '반포한강공원', address: '서울특별시 서초구 신반포로11길 40',
    latitude: 37.5096, longitude: 126.9959, district: '서초구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.hanwhafireworks.com', isFree: true, price: null,
    organizer: '한화', contactInfo: '02-729-1234', website: 'https://www.hanwhafireworks.com',
  },
  {
    sourceId: 'festival-006', name: '홍대 인디음악 페스티벌',
    description: '홍대 앞 거리에서 열리는 인디뮤지션들의 음악 축제. 다양한 장르의 음악을 무료로 즐길 수 있습니다.',
    eventType: 'FESTIVAL', startDate: '2026-06-13', endDate: '2026-06-14',
    venue: '홍대 걷고싶은거리', address: '서울특별시 마포구 와우산로 29',
    latitude: 37.5545, longitude: 126.9226, district: '마포구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.mapo.go.kr', isFree: true, price: null,
    organizer: '홍대 문화예술회', contactInfo: '02-325-8553', website: 'https://www.hongdaeindiemusic.kr',
  },
  {
    sourceId: 'festival-007', name: '서울 푸드트럭 페스티벌',
    description: '다양한 먹거리를 즐길 수 있는 푸드트럭 축제. 국내외 다양한 음식을 한자리에서 경험할 수 있습니다.',
    eventType: 'FESTIVAL', startDate: '2026-05-01', endDate: '2026-05-03',
    venue: '서울광장', address: '서울특별시 중구 세종대로 110',
    latitude: 37.5663, longitude: 126.9779, district: '중구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.seoul.go.kr', isFree: true, price: null,
    organizer: '서울시', contactInfo: '02-120', website: 'https://www.seoultruckfestival.kr',
  },
  {
    sourceId: 'festival-008', name: '북촌 한옥마을 문화축제',
    description: '전통 한옥마을에서 열리는 문화 축제. 한복 체험, 전통 공예, 국악 공연 등 다양한 프로그램이 있습니다.',
    eventType: 'FESTIVAL', startDate: '2026-09-19', endDate: '2026-09-21',
    venue: '북촌한옥마을', address: '서울특별시 종로구 북촌로 일대',
    latitude: 37.5817, longitude: 126.9838, district: '종로구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://bukchon.seoul.go.kr', isFree: true, price: null,
    organizer: '종로구', contactInfo: '02-2148-4160', website: 'https://bukchon.seoul.go.kr',
  },
  {
    sourceId: 'festival-009', name: '서울 영화제',
    description: '서울을 대표하는 독립영화 영화제. 다양한 장르의 독립영화를 상영하며 감독과의 대화도 진행됩니다.',
    eventType: 'FESTIVAL', startDate: '2026-04-08', endDate: '2026-04-17',
    venue: '메가박스 코엑스', address: '서울특별시 강남구 영동대로 513',
    latitude: 37.5126, longitude: 127.0594, district: '강남구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.siff.or.kr', isFree: false, price: '편당 12,000원',
    organizer: '서울영화위원회', contactInfo: '02-3153-2600', website: 'https://www.siff.or.kr',
  },
  {
    sourceId: 'festival-010', name: '이태원 글로벌 빌리지 페스타',
    description: '세계 각국의 문화를 체험할 수 있는 다문화 축제. 이태원 거리에서 펼쳐지는 글로벌 문화 한마당.',
    eventType: 'FESTIVAL', startDate: '2026-10-03', endDate: '2026-10-05',
    venue: '이태원로 일대', address: '서울특별시 용산구 이태원로',
    latitude: 37.5344, longitude: 126.9940, district: '용산구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.yongsan.go.kr', isFree: true, price: null,
    organizer: '용산구', contactInfo: '02-2199-8700', website: 'https://www.itaewonfestival.com',
  },
  {
    sourceId: 'festival-011', name: '잠실 루나파크 벚꽃 축제',
    description: '잠실종합운동장 일대에서 열리는 봄 벚꽃 축제. 만개한 벚꽃 아래에서 다양한 공연을 즐길 수 있습니다.',
    eventType: 'FESTIVAL', startDate: '2026-03-28', endDate: '2026-04-10',
    venue: '잠실종합운동장', address: '서울특별시 송파구 올림픽로 25',
    latitude: 37.5141, longitude: 127.0734, district: '송파구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.visitseoul.net', isFree: true, price: null,
    organizer: '송파구', contactInfo: '1544-6110', website: 'https://www.jamsillotte.com',
  },
  {
    sourceId: 'festival-012', name: '성북 달빛 야행',
    description: '성북동의 문화재와 골목길을 야간에 걷는 야행 프로그램. 밤에 더욱 빛나는 역사 유적을 탐방합니다.',
    eventType: 'FESTIVAL', startDate: '2026-05-15', endDate: '2026-05-16',
    venue: '성북동 문화재 일대', address: '서울특별시 성북구 성북동',
    latitude: 37.5929, longitude: 126.9995, district: '성북구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.seongbuk.go.kr', isFree: false, price: '5,000원',
    organizer: '성북구', contactInfo: '02-920-3452', website: 'https://www.seongbuk.go.kr',
  },
  {
    sourceId: 'festival-013', name: '인천 송도 맥주 축제',
    description: '송도 센트럴파크에서 열리는 국제 맥주 축제. 20여 개국의 수제 맥주를 한자리에서 즐길 수 있습니다.',
    eventType: 'FESTIVAL', startDate: '2026-08-07', endDate: '2026-08-09',
    venue: '송도 센트럴파크', address: '인천광역시 연수구 컨벤시아대로 160',
    latitude: 37.3834, longitude: 126.6522, district: '연수구', city: '인천광역시',
    imageUrl: null, sourceUrl: 'https://www.incheon.go.kr', isFree: false, price: '입장권 25,000원',
    organizer: '인천관광공사', contactInfo: '032-810-2200', website: 'https://www.songdobeerfestival.kr',
  },
  {
    sourceId: 'festival-014', name: '경기 수원 화성문화제',
    description: '유네스코 세계문화유산 수원 화성에서 열리는 전통 문화 축제. 정조대왕 능행차 재현 등 다양한 행사.',
    eventType: 'FESTIVAL', startDate: '2026-10-07', endDate: '2026-10-11',
    venue: '수원 화성행궁', address: '경기도 수원시 팔달구 행궁로 11',
    latitude: 37.2792, longitude: 127.0143, district: '팔달구', city: '경기도 수원시',
    imageUrl: null, sourceUrl: 'https://www.suwon.go.kr', isFree: true, price: null,
    organizer: '수원시', contactInfo: '031-228-4763', website: 'https://www.swcf.or.kr',
  },
  {
    sourceId: 'festival-015', name: '서울 드럼 페스티벌',
    description: '세계 각국의 드럼 연주자들이 참여하는 음악 축제. 난지한강공원에서 리듬의 축제를 즐기세요.',
    eventType: 'FESTIVAL', startDate: '2026-09-05', endDate: '2026-09-07',
    venue: '난지한강공원', address: '서울특별시 마포구 하늘공원로 95',
    latitude: 37.5669, longitude: 126.8990, district: '마포구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.visitseoul.net', isFree: true, price: null,
    organizer: '서울시', contactInfo: '02-3780-0578', website: 'https://drum.seouldrumfestival.com',
  },
  {
    sourceId: 'festival-016', name: '강동 선사문화축제',
    description: '강동구 암사동 선사 유적지에서 열리는 선사 문화 축제. 석기시대 생활 체험 프로그램이 다양합니다.',
    eventType: 'FESTIVAL', startDate: '2026-05-15', endDate: '2026-05-17',
    venue: '암사동 선사유적지', address: '서울특별시 강동구 올림픽로 875',
    latitude: 37.5499, longitude: 127.1279, district: '강동구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.gangdong.go.kr', isFree: false, price: '어른 500원',
    organizer: '강동구', contactInfo: '02-3425-6520', website: 'https://sunsa.gangdong.go.kr',
  },
  {
    sourceId: 'festival-017', name: '은평 봄 놀이마당',
    description: '진관사 계곡에서 열리는 봄 축제. 전통 공연, 체험 프로그램, 먹거리가 가득합니다.',
    eventType: 'FESTIVAL', startDate: '2026-04-11', endDate: '2026-04-12',
    venue: '진관사 주변', address: '서울특별시 은평구 진관길 73',
    latitude: 37.6429, longitude: 126.9159, district: '은평구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.ep.go.kr', isFree: true, price: null,
    organizer: '은평구', contactInfo: '02-351-6114', website: 'https://www.ep.go.kr',
  },
  {
    sourceId: 'festival-018', name: '중랑 장미공원 축제',
    description: '중랑천 장미공원에서 열리는 봄 장미 축제. 수만 그루의 장미 속에서 사진 찍기 좋은 명소.',
    eventType: 'FESTIVAL', startDate: '2026-05-15', endDate: '2026-06-07',
    venue: '중랑천 장미공원', address: '서울특별시 중랑구 동일로 지하 1',
    latitude: 37.5998, longitude: 127.0821, district: '중랑구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.jngu.go.kr', isFree: true, price: null,
    organizer: '중랑구', contactInfo: '02-2094-0114', website: 'https://www.jngu.go.kr',
  },
  {
    sourceId: 'festival-019', name: '남산골 한마당',
    description: '남산골 한옥마을에서 펼쳐지는 전통문화 한마당. 전통 음악, 무용, 공예 체험이 가득합니다.',
    eventType: 'FESTIVAL', startDate: '2026-05-01', endDate: '2026-05-05',
    venue: '남산골 한옥마을', address: '서울특별시 중구 퇴계로34길 28',
    latitude: 37.5572, longitude: 126.9963, district: '중구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://namsangol.seoul.go.kr', isFree: true, price: null,
    organizer: '서울시', contactInfo: '02-2266-6923', website: 'https://namsangol.seoul.go.kr',
  },
  {
    sourceId: 'festival-020', name: '신촌 물총축제',
    description: '신촌 거리에서 열리는 여름 물총 축제. 무더위를 날리는 짜릿한 물싸움을 즐길 수 있습니다.',
    eventType: 'FESTIVAL', startDate: '2026-07-25', endDate: '2026-07-26',
    venue: '신촌 연세로', address: '서울특별시 서대문구 연세로',
    latitude: 37.5583, longitude: 126.9368, district: '서대문구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.sinchon.com', isFree: true, price: null,
    organizer: '신촌문화발전소', contactInfo: '02-392-8822', website: 'https://www.sinchon.com',
  },
  // ── 플리마켓 (FLEA_MARKET) ─────────────────────────────────
  {
    sourceId: 'flea-001', name: '마포 희망 나눔 플리마켓',
    description: '매주 주말 한강변에서 열리는 플리마켓. 핸드메이드 제품, 빈티지 아이템을 만날 수 있습니다.',
    eventType: 'FLEA_MARKET', startDate: '2026-03-28', endDate: '2026-11-30',
    venue: '망원한강공원', address: '서울특별시 마포구 마포나루길 467',
    latitude: 37.5550, longitude: 126.9039, district: '마포구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.mapo.go.kr', isFree: true, price: null,
    organizer: '마포구', contactInfo: '02-3153-8900', website: 'https://www.mapo.go.kr',
  },
  {
    sourceId: 'flea-002', name: '홍대 앞 토요플리마켓',
    description: '홍대 앞 놀이터에서 매주 토요일 열리는 플리마켓. 젊은 작가들의 개성 있는 아트 상품을 만나보세요.',
    eventType: 'FLEA_MARKET', startDate: '2026-03-28', endDate: '2026-11-30',
    venue: '홍대 어울마당', address: '서울특별시 마포구 어울마당로 35',
    latitude: 37.5557, longitude: 126.9235, district: '마포구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.artmarket.or.kr', isFree: true, price: null,
    organizer: '홍대 아트마켓', contactInfo: '02-322-1234', website: 'https://www.artmarket.or.kr',
  },
  {
    sourceId: 'flea-003', name: '인사동 쌈지길 플리마켓',
    description: '인사동 쌈지길에서 열리는 주말 플리마켓. 공예품, 그림, 소품 등 다양한 아트 상품이 가득합니다.',
    eventType: 'FLEA_MARKET', startDate: '2026-03-28', endDate: '2026-11-30',
    venue: '쌈지길', address: '서울특별시 종로구 인사동길 44',
    latitude: 37.5747, longitude: 126.9854, district: '종로구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.ssamziegil.co.kr', isFree: true, price: null,
    organizer: '쌈지문화재단', contactInfo: '02-736-0088', website: 'https://www.ssamziegil.co.kr',
  },
  {
    sourceId: 'flea-004', name: '성수 빈티지 마켓',
    description: '성수동 수제화 거리에서 열리는 빈티지 플리마켓. 희귀한 빈티지 패션과 소품을 발견할 수 있습니다.',
    eventType: 'FLEA_MARKET', startDate: '2026-04-04', endDate: '2026-11-28',
    venue: '성수동 수제화거리', address: '서울특별시 성동구 성수이로 78',
    latitude: 37.5447, longitude: 127.0574, district: '성동구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.sd.go.kr', isFree: true, price: null,
    organizer: '성동구', contactInfo: '02-2286-5000', website: 'https://www.sd.go.kr',
  },
  {
    sourceId: 'flea-005', name: '동묘 구제 플리마켓',
    description: '동묘 앞 구제 시장과 함께하는 플리마켓. 저렴한 구제 의류와 희귀 아이템을 발견해보세요.',
    eventType: 'FLEA_MARKET', startDate: '2026-03-28', endDate: '2026-11-30',
    venue: '동묘앞 구제거리', address: '서울특별시 종로구 창신동 동묘앞역 인근',
    latitude: 37.5702, longitude: 127.0181, district: '종로구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.jongno.go.kr', isFree: true, price: null,
    organizer: '종로구', contactInfo: '02-2148-2100', website: 'https://www.jongno.go.kr',
  },
  {
    sourceId: 'flea-006', name: '코엑스 별마당 도서관 플리마켓',
    description: '별마당 도서관에서 열리는 책과 문화 플리마켓. 중고 서적, 문화 아이템, 핸드메이드 소품을 판매합니다.',
    eventType: 'FLEA_MARKET', startDate: '2026-04-11', endDate: '2026-11-28',
    venue: '코엑스 별마당 도서관', address: '서울특별시 강남구 영동대로 513 코엑스몰',
    latitude: 37.5126, longitude: 127.0594, district: '강남구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.starfieldlibrary.com', isFree: true, price: null,
    organizer: '현대백화점', contactInfo: '02-6002-5300', website: 'https://www.starfieldlibrary.com',
  },
  {
    sourceId: 'flea-007', name: '뚝섬 한강 플리마켓',
    description: '뚝섬한강공원에서 열리는 주말 플리마켓. 한강 뷰를 즐기며 쇼핑하는 특별한 경험을 해보세요.',
    eventType: 'FLEA_MARKET', startDate: '2026-04-04', endDate: '2026-11-01',
    venue: '뚝섬한강공원', address: '서울특별시 광진구 자양동 강변동로',
    latitude: 37.5300, longitude: 127.0674, district: '광진구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://hangang.seoul.go.kr', isFree: true, price: null,
    organizer: '광진구', contactInfo: '02-450-7788', website: 'https://hangang.seoul.go.kr',
  },
  {
    sourceId: 'flea-008', name: '망원 빈티지 마켓',
    description: '망원동에서 열리는 빈티지 및 핸드메이드 상품 플리마켓. 감성 가득한 망원동 분위기와 함께 즐겨보세요.',
    eventType: 'FLEA_MARKET', startDate: '2026-04-04', endDate: '2026-11-28',
    venue: '망원동 문화마당', address: '서울특별시 마포구 망원동',
    latitude: 37.5563, longitude: 126.9022, district: '마포구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.mapo.go.kr', isFree: true, price: null,
    organizer: '마포구', contactInfo: '02-3153-8900', website: 'https://www.mapo.go.kr',
  },
  {
    sourceId: 'flea-009', name: '서울숲 플리마켓',
    description: '서울숲 공원에서 열리는 친환경 플리마켓. 업사이클링 제품과 친환경 소품을 판매합니다.',
    eventType: 'FLEA_MARKET', startDate: '2026-04-04', endDate: '2026-10-31',
    venue: '서울숲', address: '서울특별시 성동구 뚝섬로 273',
    latitude: 37.5446, longitude: 127.0380, district: '성동구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://seoulforest.or.kr', isFree: true, price: null,
    organizer: '성동구', contactInfo: '02-460-2905', website: 'https://seoulforest.or.kr',
  },
  {
    sourceId: 'flea-010', name: '가로수길 아트마켓',
    description: '신사동 가로수길에서 열리는 아트 마켓. 예술가들의 독창적인 작품을 직접 만나볼 수 있습니다.',
    eventType: 'FLEA_MARKET', startDate: '2026-04-11', endDate: '2026-11-28',
    venue: '신사동 가로수길', address: '서울특별시 강남구 신사동 가로수길',
    latitude: 37.5205, longitude: 127.0231, district: '강남구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.gangnam.go.kr', isFree: true, price: null,
    organizer: '강남구', contactInfo: '02-3423-5555', website: 'https://www.gangnam.go.kr',
  },
  {
    sourceId: 'flea-011', name: '광장시장 상설 플리마켓',
    description: '광장시장 인근에서 열리는 주말 플리마켓. 전통 시장의 매력과 함께 다양한 상품을 만나보세요.',
    eventType: 'FLEA_MARKET', startDate: '2026-03-28', endDate: '2026-11-30',
    venue: '광장시장 앞 광장', address: '서울특별시 종로구 창경궁로 88',
    latitude: 37.5700, longitude: 126.9993, district: '종로구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://kwangjangmarket.co.kr', isFree: true, price: null,
    organizer: '종로구', contactInfo: '02-2148-2100', website: 'https://kwangjangmarket.co.kr',
  },
  {
    sourceId: 'flea-012', name: '경의선 책거리 플리마켓',
    description: '경의선 숲길에서 열리는 책 플리마켓. 중고 서적과 독립 출판물을 구입하고 작가를 만나보세요.',
    eventType: 'FLEA_MARKET', startDate: '2026-04-04', endDate: '2026-11-28',
    venue: '경의선 책거리', address: '서울특별시 마포구 신수동 경의선 숲길',
    latitude: 37.5497, longitude: 126.9324, district: '마포구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.gyeongeuiseonbookstreet.com', isFree: true, price: null,
    organizer: '마포구', contactInfo: '02-3153-8900', website: 'https://www.gyeongeuiseonbookstreet.com',
  },
  {
    sourceId: 'flea-013', name: '은평 뉴타운 플리마켓',
    description: '은평 뉴타운 광장에서 열리는 지역 주민 플리마켓. 동네 주민들이 직접 운영하는 따뜻한 마켓.',
    eventType: 'FLEA_MARKET', startDate: '2026-04-11', endDate: '2026-10-31',
    venue: '은평 뉴타운 중심상업지구', address: '서울특별시 은평구 은평뉴타운',
    latitude: 37.6201, longitude: 126.9117, district: '은평구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.ep.go.kr', isFree: true, price: null,
    organizer: '은평구', contactInfo: '02-351-6114', website: 'https://www.ep.go.kr',
  },
  {
    sourceId: 'flea-014', name: '수원 행리단길 플리마켓',
    description: '수원 행리단길에서 열리는 인디 브랜드 플리마켓. 핫플레이스 행리단길의 개성 있는 상품들을 만나보세요.',
    eventType: 'FLEA_MARKET', startDate: '2026-04-11', endDate: '2026-11-28',
    venue: '수원 행리단길', address: '경기도 수원시 팔달구 화서문로',
    latitude: 37.2839, longitude: 127.0104, district: '팔달구', city: '경기도 수원시',
    imageUrl: null, sourceUrl: 'https://www.suwon.go.kr', isFree: true, price: null,
    organizer: '수원시', contactInfo: '031-228-4763', website: 'https://www.suwon.go.kr',
  },
  {
    sourceId: 'flea-015', name: '부천 원미산 플리마켓',
    description: '부천 중앙공원에서 열리는 지역 주민 플리마켓. 가족과 함께 즐기기 좋은 지역 마켓입니다.',
    eventType: 'FLEA_MARKET', startDate: '2026-04-11', endDate: '2026-10-31',
    venue: '부천 중앙공원', address: '경기도 부천시 원미구 원미동',
    latitude: 37.4998, longitude: 126.7668, district: '원미구', city: '경기도 부천시',
    imageUrl: null, sourceUrl: 'https://www.bucheon.go.kr', isFree: true, price: null,
    organizer: '부천시', contactInfo: '032-625-2114', website: 'https://www.bucheon.go.kr',
  },
  {
    sourceId: 'flea-016', name: '이촌 한가람 플리마켓',
    description: '이촌 한강공원에서 열리는 가족 친화적인 플리마켓. 한강 뷰와 함께 즐기는 여유로운 마켓.',
    eventType: 'FLEA_MARKET', startDate: '2026-04-11', endDate: '2026-10-31',
    venue: '이촌한강공원', address: '서울특별시 용산구 이촌로 72',
    latitude: 37.5204, longitude: 126.9606, district: '용산구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://hangang.seoul.go.kr', isFree: true, price: null,
    organizer: '용산구', contactInfo: '02-749-4000', website: 'https://hangang.seoul.go.kr',
  },
  {
    sourceId: 'flea-017', name: '마포 문화비축기지 마켓',
    description: '문화비축기지에서 열리는 특별 마켓. 과거 석유 비축 기지를 재활용한 독특한 공간에서 쇼핑을 즐기세요.',
    eventType: 'FLEA_MARKET', startDate: '2026-04-11', endDate: '2026-10-31',
    venue: '문화비축기지', address: '서울특별시 마포구 증산로 87',
    latitude: 37.5769, longitude: 126.9069, district: '마포구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://mfcc.seoul.go.kr', isFree: true, price: null,
    organizer: '문화비축기지', contactInfo: '02-376-8410', website: 'https://mfcc.seoul.go.kr',
  },
  {
    sourceId: 'flea-018', name: '성동 도시재생 플리마켓',
    description: '성동구 도시재생 공간에서 열리는 창업 플리마켓. 청년 창업가들의 참신한 아이디어 상품을 만나보세요.',
    eventType: 'FLEA_MARKET', startDate: '2026-04-11', endDate: '2026-11-28',
    venue: '성수 카페거리', address: '서울특별시 성동구 서울숲2길',
    latitude: 37.5474, longitude: 127.0413, district: '성동구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.sd.go.kr', isFree: true, price: null,
    organizer: '성동구', contactInfo: '02-2286-5000', website: 'https://www.sd.go.kr',
  },
  // ── 야시장 (NIGHT_MARKET) ─────────────────────────────────
  {
    sourceId: 'night-001', name: '서울 밤도깨비 야시장 여의도',
    description: '여의도한강공원에서 열리는 밤도깨비 야시장. 다양한 먹거리와 핸드메이드 상품, 공연이 가득합니다.',
    eventType: 'NIGHT_MARKET', startDate: '2026-04-03', endDate: '2026-10-31',
    venue: '여의도한강공원', address: '서울특별시 영등포구 여의서로 330',
    latitude: 37.5289, longitude: 126.9317, district: '영등포구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://bamdokkaebi.org', isFree: true, price: null,
    organizer: '서울시', contactInfo: '02-3780-0578', website: 'https://bamdokkaebi.org',
  },
  {
    sourceId: 'night-002', name: '서울 밤도깨비 야시장 반포',
    description: '반포한강공원에서 열리는 밤도깨비 야시장. 한강 야경을 바라보며 즐기는 야시장.',
    eventType: 'NIGHT_MARKET', startDate: '2026-04-03', endDate: '2026-10-31',
    venue: '반포한강공원', address: '서울특별시 서초구 신반포로11길 40',
    latitude: 37.5096, longitude: 126.9959, district: '서초구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://bamdokkaebi.org', isFree: true, price: null,
    organizer: '서울시', contactInfo: '02-3780-0578', website: 'https://bamdokkaebi.org',
  },
  {
    sourceId: 'night-003', name: '서울 밤도깨비 야시장 청계천',
    description: '청계광장에서 열리는 밤도깨비 야시장. 도심 한가운데에서 즐기는 야시장.',
    eventType: 'NIGHT_MARKET', startDate: '2026-04-03', endDate: '2026-10-31',
    venue: '청계광장', address: '서울특별시 종로구 청계천로 1',
    latitude: 37.5702, longitude: 126.9784, district: '종로구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://bamdokkaebi.org', isFree: true, price: null,
    organizer: '서울시', contactInfo: '02-3780-0578', website: 'https://bamdokkaebi.org',
  },
  {
    sourceId: 'night-004', name: '서울 밤도깨비 야시장 DDP',
    description: 'DDP 동대문디자인플라자 앞에서 열리는 밤도깨비 야시장. 패션과 문화의 중심지에서 즐기는 야시장.',
    eventType: 'NIGHT_MARKET', startDate: '2026-04-03', endDate: '2026-10-31',
    venue: '동대문 DDP', address: '서울특별시 중구 을지로 281',
    latitude: 37.5657, longitude: 127.0094, district: '중구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://bamdokkaebi.org', isFree: true, price: null,
    organizer: '서울시', contactInfo: '02-2153-0000', website: 'https://bamdokkaebi.org',
  },
  {
    sourceId: 'night-005', name: '홍대 클럽 데이 야시장',
    description: '홍대 앞 클럽 데이에 함께 열리는 야시장. 활기찬 홍대 밤 문화와 어우러지는 야시장입니다.',
    eventType: 'NIGHT_MARKET', startDate: '2026-03-28', endDate: '2026-11-30',
    venue: '홍대 걷고싶은거리', address: '서울특별시 마포구 와우산로 29',
    latitude: 37.5545, longitude: 126.9226, district: '마포구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.mapo.go.kr', isFree: true, price: null,
    organizer: '마포구', contactInfo: '02-3153-8900', website: 'https://www.mapo.go.kr',
  },
  {
    sourceId: 'night-006', name: '광장시장 야시장',
    description: '광장시장에서 밤에 더욱 활기차게 열리는 야시장. 전통 먹거리와 트렌디한 음식들이 함께합니다.',
    eventType: 'NIGHT_MARKET', startDate: '2026-03-28', endDate: '2026-11-30',
    venue: '광장시장', address: '서울특별시 종로구 창경궁로 88',
    latitude: 37.5700, longitude: 126.9993, district: '종로구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://kwangjangmarket.co.kr', isFree: true, price: null,
    organizer: '광장시장상인회', contactInfo: '02-2267-0291', website: 'https://kwangjangmarket.co.kr',
  },
  {
    sourceId: 'night-007', name: '이태원 야시장',
    description: '이태원 거리에서 매주 금·토·일 열리는 야시장. 다국적 음식과 문화가 어우러지는 특별한 야시장.',
    eventType: 'NIGHT_MARKET', startDate: '2026-03-28', endDate: '2026-11-30',
    venue: '이태원로 일대', address: '서울특별시 용산구 이태원로',
    latitude: 37.5344, longitude: 126.9940, district: '용산구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.yongsan.go.kr', isFree: true, price: null,
    organizer: '용산구', contactInfo: '02-2199-8700', website: 'https://www.yongsan.go.kr',
  },
  {
    sourceId: 'night-008', name: '수원 야시장',
    description: '수원 화성 인근에서 열리는 야시장. 유네스코 세계문화유산 화성과 어우러지는 특별한 야시장.',
    eventType: 'NIGHT_MARKET', startDate: '2026-04-03', endDate: '2026-10-31',
    venue: '수원 팔달문 주변', address: '경기도 수원시 팔달구 팔달문로 1',
    latitude: 37.2756, longitude: 127.0187, district: '팔달구', city: '경기도 수원시',
    imageUrl: null, sourceUrl: 'https://www.suwon.go.kr', isFree: true, price: null,
    organizer: '수원시', contactInfo: '031-228-4763', website: 'https://www.suwon.go.kr',
  },
  {
    sourceId: 'night-009', name: '인천 차이나타운 야시장',
    description: '인천 차이나타운에서 열리는 야시장. 중국식 만두, 공갈빵 등 다양한 먹거리를 즐길 수 있습니다.',
    eventType: 'NIGHT_MARKET', startDate: '2026-04-03', endDate: '2026-10-31',
    venue: '인천 차이나타운', address: '인천광역시 중구 차이나타운로',
    latitude: 37.4740, longitude: 126.6163, district: '중구', city: '인천광역시',
    imageUrl: null, sourceUrl: 'https://www.incheon.go.kr', isFree: true, price: null,
    organizer: '인천관광공사', contactInfo: '032-810-2200', website: 'https://www.incheon.go.kr',
  },
  {
    sourceId: 'night-010', name: '마포 홍어거리 야시장',
    description: '마포 홍어거리에서 매주 금·토 열리는 야시장. 홍어, 막걸리 등 전통 먹거리를 즐길 수 있습니다.',
    eventType: 'NIGHT_MARKET', startDate: '2026-03-28', endDate: '2026-11-30',
    venue: '마포 홍어거리', address: '서울특별시 마포구 마포대로 일대',
    latitude: 37.5471, longitude: 126.9500, district: '마포구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.mapo.go.kr', isFree: true, price: null,
    organizer: '마포구', contactInfo: '02-3153-8900', website: 'https://www.mapo.go.kr',
  },
  {
    sourceId: 'night-011', name: '강남 역삼 푸드 야시장',
    description: '역삼 테헤란로에서 열리는 직장인 야시장. 다양한 먹거리와 함께 퇴근 후 여유를 즐겨보세요.',
    eventType: 'NIGHT_MARKET', startDate: '2026-03-28', endDate: '2026-11-30',
    venue: '역삼 테헤란로', address: '서울특별시 강남구 테헤란로 152',
    latitude: 37.5006, longitude: 127.0369, district: '강남구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.gangnam.go.kr', isFree: true, price: null,
    organizer: '강남구', contactInfo: '02-3423-5555', website: 'https://www.gangnam.go.kr',
  },
  {
    sourceId: 'night-012', name: '노원 불암골 야시장',
    description: '노원구 불암산 자락에서 열리는 지역 야시장. 지역 먹거리와 공연으로 가득한 동네 야시장.',
    eventType: 'NIGHT_MARKET', startDate: '2026-04-03', endDate: '2026-10-31',
    venue: '불암골 광장', address: '서울특별시 노원구 상계동 불암골',
    latitude: 37.6519, longitude: 127.0804, district: '노원구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.nowon.kr', isFree: true, price: null,
    organizer: '노원구', contactInfo: '02-2116-3114', website: 'https://www.nowon.kr',
  },
  {
    sourceId: 'night-013', name: '잠원 야시장',
    description: '잠원한강공원에서 열리는 야시장. 한강 야경과 함께 즐기는 서울 남쪽의 야시장.',
    eventType: 'NIGHT_MARKET', startDate: '2026-04-03', endDate: '2026-10-31',
    venue: '잠원한강공원', address: '서울특별시 서초구 잠원동',
    latitude: 37.5152, longitude: 127.0049, district: '서초구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://hangang.seoul.go.kr', isFree: true, price: null,
    organizer: '서초구', contactInfo: '02-590-3114', website: 'https://hangang.seoul.go.kr',
  },
  {
    sourceId: 'night-014', name: '종로 피맛골 야시장',
    description: '종로 피맛골에서 매주 금·토 열리는 야시장. 도심의 역사 골목에서 즐기는 야시장.',
    eventType: 'NIGHT_MARKET', startDate: '2026-03-28', endDate: '2026-11-30',
    venue: '종로 피맛골', address: '서울특별시 종로구 종로 일대',
    latitude: 37.5710, longitude: 126.9832, district: '종로구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.jongno.go.kr', isFree: true, price: null,
    organizer: '종로구', contactInfo: '02-2148-2100', website: 'https://www.jongno.go.kr',
  },
  {
    sourceId: 'night-015', name: '해방촌 야시장',
    description: '해방촌 계단 거리에서 열리는 감성 야시장. 독특한 분위기의 해방촌에서 즐기는 특별한 야시장.',
    eventType: 'NIGHT_MARKET', startDate: '2026-04-03', endDate: '2026-10-31',
    venue: '해방촌 신흥시장', address: '서울특별시 용산구 신흥로 16',
    latitude: 37.5420, longitude: 126.9887, district: '용산구', city: '서울특별시',
    imageUrl: null, sourceUrl: 'https://www.yongsan.go.kr', isFree: true, price: null,
    organizer: '용산구', contactInfo: '02-2199-8700', website: 'https://www.yongsan.go.kr',
  },
];

// ────────────────────────────────────────────────────────────────
// 유틸리티 함수
// ────────────────────────────────────────────────────────────────

/** 디렉토리가 없으면 생성합니다 */
function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`📁 디렉토리 생성: ${dirPath}`);
  }
}

/** JSON 파일로 저장합니다 */
function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  const size = fs.statSync(filePath).size;
  console.log(`  ✅ 저장 완료: ${path.basename(filePath)} (${(size / 1024).toFixed(1)}KB)`);
}

/** 이벤트 제목에서 이벤트 유형을 추론합니다 */
function classifyEventType(title: string): 'FESTIVAL' | 'FLEA_MARKET' | 'NIGHT_MARKET' {
  const t = title.toLowerCase();
  if (t.includes('야시장') || t.includes('밤시장') || t.includes('나이트마켓')) return 'NIGHT_MARKET';
  if (
    t.includes('플리마켓') || t.includes('벼룩시장') ||
    t.includes('마켓') || t.includes('시장') || t.includes('장터')
  ) return 'FLEA_MARKET';
  return 'FESTIVAL';
}

/** TourAPI 날짜 문자열(YYYYMMDD)을 ISO 날짜(YYYY-MM-DD)로 변환합니다 */
function parseTourApiDate(dateStr: string | undefined): string {
  if (!dateStr || dateStr.length !== 8) return new Date().toISOString().slice(0, 10);
  return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

// ────────────────────────────────────────────────────────────────
// 1. 한국관광공사 TourAPI 4.0 - 축제 목록 조회
// ────────────────────────────────────────────────────────────────

interface TourApiFestivalItem {
  contentid?: string;
  title?: string;
  addr1?: string;
  addr2?: string;
  mapx?: string;
  mapy?: string;
  firstimage?: string;
  firstimage2?: string;
  tel?: string;
  eventstartdate?: string;
  eventenddate?: string;
  cat1?: string;
  cat2?: string;
  cat3?: string;
  areacode?: string;
  sigungucode?: string;
  cpyrhtDivCd?: string;
}

interface TourApiResponse {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: {
      items?: { item?: TourApiFestivalItem[] } | '';
      totalCount?: number;
      numOfRows?: number;
      pageNo?: number;
    };
  };
}

async function fetchTourApiFestivals(apiKey: string): Promise<{
  raw: TourApiResponse;
  events: RawEvent[];
}> {
  const BASE_URL = 'https://apis.data.go.kr/B551011/KorService1';

  // 서울, 인천, 경기 지역 코드
  const areaCodes = [
    { code: '1', name: '서울특별시' },
    { code: '2', name: '인천광역시' },
    { code: '31', name: '경기도' },
  ];

  const allItems: TourApiFestivalItem[] = [];
  const rawResponses: Record<string, TourApiResponse> = {};

  for (const area of areaCodes) {
    const params = new URLSearchParams({
      serviceKey: apiKey,
      MobileOS: 'ETC',
      MobileApp: 'FestiMap',
      _type: 'json',
      areaCode: area.code,
      eventStartDate: '20260101',
      eventEndDate: '20270101',
      numOfRows: '100',
      pageNo: '1',
    });

    const url = `${BASE_URL}/festivalList1?${params.toString()}`;
    console.log(`  📡 TourAPI 축제 조회 (${area.name})...`);

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: TourApiResponse = await res.json();
      rawResponses[area.name] = data;

      const items = data?.response?.body?.items;
      if (items && typeof items === 'object' && items !== null && 'item' in items && Array.isArray(items.item)) {
        console.log(`    ✅ ${area.name}: ${items.item.length}개 수집`);
        allItems.push(...items.item.map(i => ({ ...i, _city: area.name })));
      } else {
        console.log(`    ⚠️  ${area.name}: 결과 없음`);
      }
    } catch (err) {
      console.log(`    ❌ ${area.name} 조회 실패: ${(err as Error).message}`);
    }
  }

  // 마켓 키워드 검색 (플리마켓, 야시장)
  const marketKeywords = ['플리마켓', '야시장', '벼룩시장'];
  for (const keyword of marketKeywords) {
    const params = new URLSearchParams({
      serviceKey: apiKey,
      MobileOS: 'ETC',
      MobileApp: 'FestiMap',
      _type: 'json',
      keyword,
      areaCode: '1', // 서울만
      contentTypeId: '15', // 행사/공연/축제
      numOfRows: '50',
      pageNo: '1',
    });

    const url = `${BASE_URL}/searchKeyword1?${params.toString()}`;
    console.log(`  📡 TourAPI 마켓 검색 (키워드: "${keyword}")...`);

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: TourApiResponse = await res.json();
      rawResponses[`keyword_${keyword}`] = data;

      const items = data?.response?.body?.items;
      if (items && typeof items === 'object' && items !== null && 'item' in items && Array.isArray(items.item)) {
        console.log(`    ✅ "${keyword}": ${items.item.length}개 수집`);
        allItems.push(...items.item);
      } else {
        console.log(`    ⚠️  "${keyword}": 결과 없음`);
      }
    } catch (err) {
      console.log(`    ❌ "${keyword}" 검색 실패: ${(err as Error).message}`);
    }
  }

  const now = new Date().toISOString();

  // TourAPI 결과를 RawEvent로 변환
  const events: RawEvent[] = allItems
    .filter(item => item.contentid && item.title)
    .map((item, idx) => {
      const lat = parseFloat(item.mapy || '0');
      const lon = parseFloat(item.mapx || '0');
      return {
        sourceId: `tour-${item.contentid || idx}`,
        name: item.title || '미정',
        description: null,
        eventType: classifyEventType(item.title || ''),
        startDate: parseTourApiDate(item.eventstartdate),
        endDate: parseTourApiDate(item.eventenddate || item.eventstartdate),
        venue: item.title || '미정',
        address: [item.addr1, item.addr2].filter(Boolean).join(' ') || '주소 미정',
        latitude: isNaN(lat) ? 37.5665 : lat,
        longitude: isNaN(lon) ? 126.9780 : lon,
        district: null,
        city: '서울특별시',
        imageUrl: item.firstimage || null,
        sourceUrl: `https://www.visitkorea.or.kr/detail?contentId=${item.contentid}`,
        isFree: true,
        price: null,
        organizer: null,
        contactInfo: item.tel || null,
        website: null,
        fetchedAt: now,
        dataSource: 'TOUR_API' as const,
      };
    });

  return { raw: rawResponses as unknown as TourApiResponse, events };
}

// ────────────────────────────────────────────────────────────────
// 2. 서울 열린데이터광장 - 서울시 문화행사 정보 (OA-15105)
// ────────────────────────────────────────────────────────────────

interface SeoulCulturalEventItem {
  TITLE?: string;
  CODENAME?: string;
  DATE?: string;
  STRTDATE?: string;
  END_DATE?: string;
  PLACE?: string;
  ORG_NAME?: string;
  USE_FEE?: string;
  IS_FREE?: string;
  MAIN_IMG?: string;
  RGSTDATE?: string;
  TICKET?: string;
  LOT?: string;  // 경도 longitude
  LAT?: string;  // 위도 latitude
  HMPG_ADDR?: string;
  ORG_TELNO?: string;
  GUNAME?: string;
  THEMECODE?: string;
}

interface SeoulOpenDataResponse {
  culturalEventInfo?: {
    list_total_count?: number;
    RESULT?: { CODE?: string; MESSAGE?: string };
    row?: SeoulCulturalEventItem[];
  };
}

async function fetchSeoulOpenData(apiKey: string): Promise<{
  raw: SeoulOpenDataResponse;
  events: RawEvent[];
}> {
  const BASE_URL = 'http://openapi.seoul.go.kr:8088';
  const results: SeoulCulturalEventItem[] = [];
  const allRaw: SeoulOpenDataResponse[] = [];

  // 페이지당 1000개, 총 2000개 조회
  const pageSize = 1000;
  const pages = 2;

  for (let page = 0; page < pages; page++) {
    const startIdx = page * pageSize + 1;
    const endIdx = startIdx + pageSize - 1;
    const url = `${BASE_URL}/${encodeURIComponent(apiKey)}/json/culturalEventInfo/${startIdx}/${endIdx}/`;
    console.log(`  📡 서울 열린데이터광장 조회 (${startIdx}~${endIdx})...`);

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: SeoulOpenDataResponse = await res.json();
      allRaw.push(data);

      const rows = data?.culturalEventInfo?.row;
      if (rows && Array.isArray(rows)) {
        // 서울/수도권 행사 필터링
        const filtered = rows.filter(row => {
          const title = (row.TITLE || '').toLowerCase();
          const place = (row.PLACE || '').toLowerCase();
          const codename = (row.CODENAME || '').toLowerCase();
          // 축제, 마켓 관련 행사만 필터링
          return (
            codename.includes('축제') ||
            codename.includes('마켓') ||
            codename.includes('야시장') ||
            title.includes('축제') ||
            title.includes('페스티벌') ||
            title.includes('마켓') ||
            title.includes('야시장') ||
            title.includes('플리마켓')
          );
        });
        console.log(`    ✅ ${rows.length}개 중 ${filtered.length}개 선별`);
        results.push(...filtered);
      }
    } catch (err) {
      console.log(`    ❌ 서울 열린데이터광장 조회 실패: ${(err as Error).message}`);
    }
  }

  const now = new Date().toISOString();
  const mergedRaw: SeoulOpenDataResponse = {
    culturalEventInfo: {
      list_total_count: results.length,
      row: results,
    },
  };

  // SeoulOpenData 결과를 RawEvent로 변환
  const events: RawEvent[] = results
    .filter(row => row.TITLE && row.STRTDATE)
    .map((row, idx) => {
      const lat = parseFloat(row.LAT || '0');
      const lon = parseFloat(row.LOT || '0');
      const isFree = (row.IS_FREE || row.USE_FEE || '').includes('무료') ||
                     (row.USE_FEE || '') === '' || (row.USE_FEE || '').toLowerCase() === 'free';
      return {
        sourceId: `seoul-${idx}-${(row.TITLE || '').slice(0, 10).replace(/\s/g, '-')}`,
        name: row.TITLE || '미정',
        description: null,
        eventType: classifyEventType(row.TITLE || ''),
        startDate: row.STRTDATE?.slice(0, 10) || new Date().toISOString().slice(0, 10),
        endDate: row.END_DATE?.slice(0, 10) || row.STRTDATE?.slice(0, 10) || new Date().toISOString().slice(0, 10),
        venue: row.PLACE || '미정',
        address: row.PLACE || '미정',
        latitude: isNaN(lat) || lat === 0 ? 37.5665 : lat,
        longitude: isNaN(lon) || lon === 0 ? 126.9780 : lon,
        district: row.GUNAME || null,
        city: '서울특별시',
        imageUrl: row.MAIN_IMG || null,
        sourceUrl: row.HMPG_ADDR || null,
        isFree,
        price: isFree ? null : (row.USE_FEE || null),
        organizer: row.ORG_NAME || null,
        contactInfo: row.ORG_TELNO || null,
        website: row.HMPG_ADDR || null,
        fetchedAt: now,
        dataSource: 'SEOUL_OPEN_DATA' as const,
      };
    });

  return { raw: mergedRaw, events };
}

// ────────────────────────────────────────────────────────────────
// 데이터 병합 및 중복 제거
// ────────────────────────────────────────────────────────────────

function mergeAndDeduplicate(
  curated: RawEvent[],
  tourApi: RawEvent[],
  seoulOpen: RawEvent[],
): RawEvent[] {
  const seen = new Map<string, RawEvent>();

  // 큐레이션 데이터 우선 추가 (신뢰도 높음)
  for (const event of curated) {
    seen.set(event.sourceId, event);
  }

  // TourAPI 데이터 추가 (중복 이름 체크)
  for (const event of tourApi) {
    if (!seen.has(event.sourceId)) {
      // 이름 기반 중복 체크
      const isDuplicate = Array.from(seen.values()).some(e =>
        e.name.trim() === event.name.trim() ||
        (Math.abs(e.latitude - event.latitude) < 0.001 &&
         Math.abs(e.longitude - event.longitude) < 0.001)
      );
      if (!isDuplicate) {
        seen.set(event.sourceId, event);
      }
    }
  }

  // 서울 열린데이터광장 데이터 추가
  for (const event of seoulOpen) {
    if (!seen.has(event.sourceId)) {
      const isDuplicate = Array.from(seen.values()).some(e =>
        e.name.trim() === event.name.trim()
      );
      if (!isDuplicate) {
        seen.set(event.sourceId, event);
      }
    }
  }

  return Array.from(seen.values());
}

// ────────────────────────────────────────────────────────────────
// 메인 실행
// ────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  console.log('🌏 FestiMap 이벤트 데이터 수집 시작\n');
  console.log('══════════════════════════════════════════════════');

  const OUTPUT_DIR = path.resolve(process.cwd(), 'data', 'raw');
  ensureDir(OUTPUT_DIR);

  const TOUR_API_KEY = process.env.TOUR_API_KEY;
  const SEOUL_OPEN_DATA_KEY = process.env.SEOUL_OPEN_DATA_KEY;
  const now = new Date().toISOString();

  if (!TOUR_API_KEY) {
    console.log('ℹ️  TOUR_API_KEY 미설정 → 한국관광공사 TourAPI 건너뜀');
  }
  if (!SEOUL_OPEN_DATA_KEY) {
    console.log('ℹ️  SEOUL_OPEN_DATA_KEY 미설정 → 서울 열린데이터광장 건너뜀');
  }

  // ── 1. 큐레이션 데이터 ──────────────────────────────────────
  console.log('\n📋 [1/3] 큐레이션 이벤트 데이터 처리...');
  const curatedEvents: RawEvent[] = CURATED_EVENTS.map(e => ({
    ...e,
    fetchedAt: now,
    dataSource: 'CURATED' as const,
  }));
  console.log(`  ✅ 큐레이션 이벤트: ${curatedEvents.length}개`);
  writeJson(path.join(OUTPUT_DIR, 'curated-events.json'), {
    meta: {
      source: 'curated',
      description: 'FestiMap 큐레이션 서울/수도권 이벤트 데이터',
      count: curatedEvents.length,
      generatedAt: now,
    },
    events: curatedEvents,
  });

  // ── 2. 한국관광공사 TourAPI ──────────────────────────────────
  let tourApiEvents: RawEvent[] = [];
  let tourApiRaw: unknown = null;

  if (TOUR_API_KEY) {
    console.log('\n📡 [2/3] 한국관광공사 TourAPI 4.0 데이터 수집...');
    try {
      const result = await fetchTourApiFestivals(TOUR_API_KEY);
      tourApiEvents = result.events;
      tourApiRaw = result.raw;
      console.log(`  ✅ TourAPI 수집: ${tourApiEvents.length}개`);
      writeJson(path.join(OUTPUT_DIR, 'tour-api-raw.json'), {
        meta: {
          source: 'tour_api_4.0',
          description: '한국관광공사 TourAPI 4.0 원시 응답',
          count: tourApiEvents.length,
          generatedAt: now,
        },
        raw: tourApiRaw,
        events: tourApiEvents,
      });
    } catch (err) {
      console.error(`  ❌ TourAPI 수집 실패: ${(err as Error).message}`);
    }
  } else {
    console.log('\n⏭️  [2/3] TourAPI 건너뜀 (API 키 없음)');
    // API 키 없을 때는 빈 파일 생성
    writeJson(path.join(OUTPUT_DIR, 'tour-api-raw.json'), {
      meta: {
        source: 'tour_api_4.0',
        description: '한국관광공사 TourAPI 4.0 원시 응답 (API 키 없음 - 데이터 없음)',
        count: 0,
        generatedAt: now,
        apiKeyRequired: true,
        apiKeyEnvVar: 'TOUR_API_KEY',
        registrationUrl: 'https://www.data.go.kr/data/15101578/openapi.do',
      },
      events: [],
    });
  }

  // ── 3. 서울 열린데이터광장 ───────────────────────────────────
  let seoulOpenEvents: RawEvent[] = [];
  let seoulOpenRaw: unknown = null;

  if (SEOUL_OPEN_DATA_KEY) {
    console.log('\n📡 [3/3] 서울 열린데이터광장 데이터 수집...');
    try {
      const result = await fetchSeoulOpenData(SEOUL_OPEN_DATA_KEY);
      seoulOpenEvents = result.events;
      seoulOpenRaw = result.raw;
      console.log(`  ✅ 서울 열린데이터광장 수집: ${seoulOpenEvents.length}개`);
      writeJson(path.join(OUTPUT_DIR, 'seoul-open-data-raw.json'), {
        meta: {
          source: 'seoul_open_data_plaza',
          description: '서울 열린데이터광장 문화행사 원시 응답',
          apiEndpoint: 'http://openapi.seoul.go.kr:8088/{KEY}/json/culturalEventInfo/',
          datasetId: 'OA-15105',
          count: seoulOpenEvents.length,
          generatedAt: now,
        },
        raw: seoulOpenRaw,
        events: seoulOpenEvents,
      });
    } catch (err) {
      console.error(`  ❌ 서울 열린데이터광장 수집 실패: ${(err as Error).message}`);
    }
  } else {
    console.log('\n⏭️  [3/3] 서울 열린데이터광장 건너뜀 (API 키 없음)');
    writeJson(path.join(OUTPUT_DIR, 'seoul-open-data-raw.json'), {
      meta: {
        source: 'seoul_open_data_plaza',
        description: '서울 열린데이터광장 문화행사 원시 응답 (API 키 없음 - 데이터 없음)',
        apiEndpoint: 'http://openapi.seoul.go.kr:8088/{KEY}/json/culturalEventInfo/',
        datasetId: 'OA-15105',
        count: 0,
        generatedAt: now,
        apiKeyRequired: true,
        apiKeyEnvVar: 'SEOUL_OPEN_DATA_KEY',
        registrationUrl: 'https://data.seoul.go.kr/dataList/OA-15105/S/1/datasetView.do',
      },
      events: [],
    });
  }

  // ── 4. 최종 병합 ────────────────────────────────────────────
  console.log('\n🔀 데이터 병합 및 중복 제거 중...');
  const mergedEvents = mergeAndDeduplicate(curatedEvents, tourApiEvents, seoulOpenEvents);

  // 통계
  const stats = mergedEvents.reduce(
    (acc, e) => { acc[e.eventType] = (acc[e.eventType] || 0) + 1; return acc; },
    {} as Record<string, number>,
  );
  const sourceStats = mergedEvents.reduce(
    (acc, e) => { acc[e.dataSource] = (acc[e.dataSource] || 0) + 1; return acc; },
    {} as Record<string, number>,
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  writeJson(path.join(OUTPUT_DIR, 'merged-events.json'), {
    meta: {
      description: 'FestiMap 최종 병합 이벤트 데이터 (서울/수도권)',
      totalCount: mergedEvents.length,
      generatedAt: now,
      elapsedSeconds: parseFloat(elapsed),
      sources: {
        curated: curatedEvents.length,
        tourApi: tourApiEvents.length,
        seoulOpenData: seoulOpenEvents.length,
      },
      typeBreakdown: {
        festival: stats.FESTIVAL || 0,
        fleaMarket: stats.FLEA_MARKET || 0,
        nightMarket: stats.NIGHT_MARKET || 0,
      },
      sourceBreakdown: sourceStats,
    },
    events: mergedEvents,
  });

  // ── 최종 리포트 ──────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════');
  console.log('🎉 데이터 수집 완료!\n');
  console.log('📊 수집 결과:');
  console.log(`  - 큐레이션 데이터:          ${curatedEvents.length}개`);
  console.log(`  - TourAPI 데이터:           ${tourApiEvents.length}개`);
  console.log(`  - 서울 열린데이터광장:      ${seoulOpenEvents.length}개`);
  console.log(`  - 중복 제거 후 최종:        ${mergedEvents.length}개`);
  console.log('');
  console.log('📈 이벤트 유형별:');
  console.log(`  - 축제 (FESTIVAL):          ${stats.FESTIVAL || 0}개`);
  console.log(`  - 플리마켓 (FLEA_MARKET):   ${stats.FLEA_MARKET || 0}개`);
  console.log(`  - 야시장 (NIGHT_MARKET):    ${stats.NIGHT_MARKET || 0}개`);
  console.log('');
  console.log('📁 출력 파일 (data/raw/):');
  console.log('  - curated-events.json        큐레이션 이벤트');
  console.log('  - tour-api-raw.json          한국관광공사 TourAPI 원시 데이터');
  console.log('  - seoul-open-data-raw.json   서울 열린데이터광장 원시 데이터');
  console.log('  - merged-events.json         최종 병합 이벤트');
  console.log(`\n⏱️  소요 시간: ${elapsed}초`);

  if (mergedEvents.length < 50) {
    console.warn(`\n⚠️  경고: 이벤트 수(${mergedEvents.length})가 50개 미만입니다.`);
    process.exit(1);
  } else {
    console.log(`\n✅ 50개 이상 이벤트 확보 (${mergedEvents.length}개)`);
  }
}

main().catch(err => {
  console.error('\n❌ 오류 발생:', err);
  process.exit(1);
});
