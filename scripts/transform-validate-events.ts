#!/usr/bin/env tsx
/**
 * FestiMap 이벤트 데이터 변환 및 검증 스크립트
 *
 * 사용법:
 *   npx tsx scripts/transform-validate-events.ts
 *   # 또는
 *   npm run events:validate
 *
 * 기능:
 *   1. data/raw/ 디렉토리의 원시 JSON 파일에서 이벤트 데이터 로드
 *   2. 필수 필드 유효성 검사 (누락 시 에러 플래그)
 *   3. 권장 필드 완전성 검사 (누락 시 경고 플래그)
 *   4. 수도권 좌표 범위 및 날짜 유효성 검증
 *   5. 유효한 레코드를 prisma/seed-data.json 으로 저장
 *   6. 플래그된 레코드를 data/flagged-events.json 으로 저장
 *   7. 검증 보고서를 data/validation-report.json 으로 저장
 *
 * 스키마 필드:
 *   필수 (누락 시 에러):
 *     sourceId, name, eventType, startDate, endDate,
 *     venue, address, latitude, longitude
 *   권장 (누락 시 경고):
 *     description, district, organizer, contactInfo, website, imageUrl
 */

import * as fs from 'fs';
import * as path from 'path';

// ────────────────────────────────────────────────────────────────
// 타입 정의
// ────────────────────────────────────────────────────────────────

/** 이벤트 유형 */
type EventType = 'FESTIVAL' | 'FLEA_MARKET' | 'NIGHT_MARKET';

/** 검증 플래그 심각도 */
type FlagSeverity = 'ERROR' | 'WARNING';

/** 검증 플래그 코드 */
type FlagCode =
  // 에러 코드 (필수 필드 누락/유효하지 않음)
  | 'MISSING_SOURCE_ID'
  | 'MISSING_NAME'
  | 'INVALID_EVENT_TYPE'
  | 'MISSING_START_DATE'
  | 'MISSING_END_DATE'
  | 'INVALID_START_DATE_FORMAT'
  | 'INVALID_END_DATE_FORMAT'
  | 'END_DATE_BEFORE_START_DATE'
  | 'MISSING_VENUE'
  | 'MISSING_ADDRESS'
  | 'MISSING_COORDINATES'
  | 'INVALID_COORDINATES'
  | 'OUT_OF_METRO_AREA'
  | 'DUPLICATE_SOURCE_ID'
  // 경고 코드 (권장 필드 누락)
  | 'MISSING_DESCRIPTION'
  | 'MISSING_DISTRICT'
  | 'MISSING_ORGANIZER'
  | 'MISSING_CONTACT_INFO'
  | 'MISSING_WEBSITE'
  | 'MISSING_IMAGE_URL'
  | 'SHORT_DESCRIPTION'
  | 'COORDINATES_ADJUSTED';

/** 개별 검증 플래그 */
interface ValidationFlag {
  code: FlagCode;
  severity: FlagSeverity;
  field: string;
  message: string;
}

/** 검증 결과 */
type ValidationStatus = 'VALID' | 'VALID_WITH_WARNINGS' | 'INVALID';

/** 변환된 이벤트 레코드 (정규화된 스키마) */
interface SeedEventRecord {
  sourceId: string;
  name: string;
  description: string | null;
  eventType: EventType;
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
  contactInfo: string | null;
  website: string | null;
}

/** 검증된 이벤트 레코드 (플래그 포함) */
interface ValidatedEventRecord {
  record: SeedEventRecord;
  status: ValidationStatus;
  flags: ValidationFlag[];
  originalSourceId: string;
}

/** 원시 JSON 레코드 (data/raw/*.json 의 events 배열) */
interface RawEventRecord {
  sourceId?: unknown;
  name?: unknown;
  description?: unknown;
  eventType?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  venue?: unknown;
  address?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  district?: unknown;
  city?: unknown;
  imageUrl?: unknown;
  sourceUrl?: unknown;
  isFree?: unknown;
  price?: unknown;
  organizer?: unknown;
  contactInfo?: unknown;
  website?: unknown;
  fetchedAt?: unknown;
  dataSource?: unknown;
}

/** 검증 보고서 */
interface ValidationReport {
  generatedAt: string;
  summary: {
    total: number;
    valid: number;
    validWithWarnings: number;
    invalid: number;
    seededCount: number;
  };
  typeBreakdown: {
    FESTIVAL: number;
    FLEA_MARKET: number;
    NIGHT_MARKET: number;
  };
  errorBreakdown: Record<string, number>;
  warningBreakdown: Record<string, number>;
  flaggedRecords: Array<{
    sourceId: string;
    name: string;
    status: ValidationStatus;
    flags: ValidationFlag[];
  }>;
}

// ────────────────────────────────────────────────────────────────
// 수도권 좌표 범위 상수
// ────────────────────────────────────────────────────────────────

const METRO_BOUNDS = {
  latMin: 36.9,
  latMax: 38.0,
  lngMin: 126.3,
  lngMax: 127.8,
} as const;

const VALID_EVENT_TYPES: EventType[] = ['FESTIVAL', 'FLEA_MARKET', 'NIGHT_MARKET'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MIN_DESCRIPTION_LENGTH = 10;

// ────────────────────────────────────────────────────────────────
// 검증 유틸리티 함수
// ────────────────────────────────────────────────────────────────

/**
 * 값이 비어있는지 확인 (null, undefined, 빈 문자열, 공백만 있는 문자열)
 */
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

/**
 * "YYYY-MM-DD" 형식 날짜 문자열의 유효성 검사
 */
function isValidDateString(dateStr: string): boolean {
  if (!DATE_PATTERN.test(dateStr)) return false;
  const date = new Date(dateStr + 'T00:00:00Z');
  return !isNaN(date.getTime());
}

/**
 * 좌표가 수도권 범위 내에 있는지 확인
 */
function isInMetroArea(lat: number, lng: number): boolean {
  return (
    lat >= METRO_BOUNDS.latMin &&
    lat <= METRO_BOUNDS.latMax &&
    lng >= METRO_BOUNDS.lngMin &&
    lng <= METRO_BOUNDS.lngMax
  );
}

/**
 * 숫자 좌표 소수점 6자리로 정규화
 */
function normalizeCoordinate(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

// ────────────────────────────────────────────────────────────────
// 필드 정규화 함수
// ────────────────────────────────────────────────────────────────

/**
 * 문자열 필드 정규화: trim + null 처리
 */
function normalizeString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
}

/**
 * boolean 필드 정규화
 */
function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true' || value === '1';
  }
  return false;
}

/**
 * 숫자 좌표 필드 정규화
 */
function normalizeNumeric(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (isNaN(num)) return null;
  return num;
}

/**
 * 날짜 문자열 정규화:
 * - "YYYYMMDD" → "YYYY-MM-DD"
 * - ISO 8601 문자열 → "YYYY-MM-DD"
 * - 이미 "YYYY-MM-DD" 형식이면 그대로
 */
function normalizeDateString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (str === '') return null;

  // 이미 YYYY-MM-DD 형식
  if (DATE_PATTERN.test(str)) return str;

  // YYYYMMDD 형식
  if (/^\d{8}$/.test(str)) {
    return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
  }

  // ISO 8601 또는 기타 Date 파싱 가능한 형식
  const date = new Date(str);
  if (!isNaN(date.getTime())) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}

/**
 * eventType 정규화: 다양한 입력값 → EventType
 */
function normalizeEventType(value: unknown): EventType | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim().toUpperCase();

  if (str === 'FESTIVAL') return 'FESTIVAL';
  if (str === 'FLEA_MARKET' || str === 'FLEAMARKET' || str === 'FLEA') return 'FLEA_MARKET';
  if (str === 'NIGHT_MARKET' || str === 'NIGHTMARKET' || str === 'NIGHT') return 'NIGHT_MARKET';

  // 한국어 키워드 매핑
  const raw = String(value).trim();
  if (raw.includes('축제') || raw.includes('festival') || raw.includes('Festival')) return 'FESTIVAL';
  if (raw.includes('플리') || raw.includes('벼룩') || raw.includes('flea') || raw.includes('마켓')) return 'FLEA_MARKET';
  if (raw.includes('야시장') || raw.includes('night') || raw.includes('밤시장')) return 'NIGHT_MARKET';

  return null;
}

// ────────────────────────────────────────────────────────────────
// 검증 함수
// ────────────────────────────────────────────────────────────────

/**
 * 필수 필드 검증 (에러 플래그 생성)
 */
function validateRequiredFields(
  raw: RawEventRecord,
  normalized: Partial<SeedEventRecord>,
): ValidationFlag[] {
  const flags: ValidationFlag[] = [];

  // sourceId 검증
  if (isEmpty(normalized.sourceId)) {
    flags.push({
      code: 'MISSING_SOURCE_ID',
      severity: 'ERROR',
      field: 'sourceId',
      message: '고유 식별자(sourceId)가 누락되었습니다.',
    });
  }

  // name 검증
  if (isEmpty(normalized.name)) {
    flags.push({
      code: 'MISSING_NAME',
      severity: 'ERROR',
      field: 'name',
      message: '행사명(name)이 누락되었습니다.',
    });
  }

  // eventType 검증
  if (!normalized.eventType || !VALID_EVENT_TYPES.includes(normalized.eventType)) {
    flags.push({
      code: 'INVALID_EVENT_TYPE',
      severity: 'ERROR',
      field: 'eventType',
      message: `이벤트 유형이 유효하지 않습니다. 원본값: "${raw.eventType}", 허용값: FESTIVAL | FLEA_MARKET | NIGHT_MARKET`,
    });
  }

  // startDate 검증
  if (isEmpty(normalized.startDate)) {
    flags.push({
      code: 'MISSING_START_DATE',
      severity: 'ERROR',
      field: 'startDate',
      message: '시작일(startDate)이 누락되었습니다.',
    });
  } else if (!isValidDateString(normalized.startDate!)) {
    flags.push({
      code: 'INVALID_START_DATE_FORMAT',
      severity: 'ERROR',
      field: 'startDate',
      message: `시작일 형식이 유효하지 않습니다. 원본값: "${raw.startDate}", 정규화값: "${normalized.startDate}"`,
    });
  }

  // endDate 검증
  if (isEmpty(normalized.endDate)) {
    flags.push({
      code: 'MISSING_END_DATE',
      severity: 'ERROR',
      field: 'endDate',
      message: '종료일(endDate)이 누락되었습니다.',
    });
  } else if (!isValidDateString(normalized.endDate!)) {
    flags.push({
      code: 'INVALID_END_DATE_FORMAT',
      severity: 'ERROR',
      field: 'endDate',
      message: `종료일 형식이 유효하지 않습니다. 원본값: "${raw.endDate}", 정규화값: "${normalized.endDate}"`,
    });
  } else if (
    normalized.startDate &&
    isValidDateString(normalized.startDate) &&
    normalized.endDate !== undefined &&
    normalized.endDate < normalized.startDate
  ) {
    flags.push({
      code: 'END_DATE_BEFORE_START_DATE',
      severity: 'ERROR',
      field: 'endDate',
      message: `종료일(${normalized.endDate})이 시작일(${normalized.startDate})보다 이릅니다.`,
    });
  }

  // venue 검증
  if (isEmpty(normalized.venue)) {
    flags.push({
      code: 'MISSING_VENUE',
      severity: 'ERROR',
      field: 'venue',
      message: '장소명(venue)이 누락되었습니다.',
    });
  }

  // address 검증
  if (isEmpty(normalized.address)) {
    flags.push({
      code: 'MISSING_ADDRESS',
      severity: 'ERROR',
      field: 'address',
      message: '주소(address)가 누락되었습니다.',
    });
  }

  // 좌표 검증
  const lat = normalized.latitude;
  const lng = normalized.longitude;

  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    flags.push({
      code: 'MISSING_COORDINATES',
      severity: 'ERROR',
      field: 'latitude/longitude',
      message: `좌표가 누락되었습니다. latitude: ${raw.latitude}, longitude: ${raw.longitude}`,
    });
  } else if (lat === 0 && lng === 0) {
    flags.push({
      code: 'INVALID_COORDINATES',
      severity: 'ERROR',
      field: 'latitude/longitude',
      message: '좌표가 (0, 0)으로 유효하지 않습니다.',
    });
  } else if (isNaN(lat) || isNaN(lng)) {
    flags.push({
      code: 'INVALID_COORDINATES',
      severity: 'ERROR',
      field: 'latitude/longitude',
      message: `좌표가 숫자가 아닙니다. latitude: "${raw.latitude}", longitude: "${raw.longitude}"`,
    });
  } else if (!isInMetroArea(lat, lng)) {
    flags.push({
      code: 'OUT_OF_METRO_AREA',
      severity: 'ERROR',
      field: 'latitude/longitude',
      message: `좌표(${lat}, ${lng})가 수도권 범위(위도 ${METRO_BOUNDS.latMin}~${METRO_BOUNDS.latMax}, 경도 ${METRO_BOUNDS.lngMin}~${METRO_BOUNDS.lngMax}) 밖에 있습니다.`,
    });
  }

  return flags;
}

/**
 * 권장 필드 완전성 검증 (경고 플래그 생성)
 */
function validateCompleteness(normalized: Partial<SeedEventRecord>): ValidationFlag[] {
  const flags: ValidationFlag[] = [];

  // description 검증
  if (isEmpty(normalized.description)) {
    flags.push({
      code: 'MISSING_DESCRIPTION',
      severity: 'WARNING',
      field: 'description',
      message: '행사 설명(description)이 없습니다. 사용자 경험을 위해 설명을 추가하는 것을 권장합니다.',
    });
  } else if (
    normalized.description &&
    normalized.description.length < MIN_DESCRIPTION_LENGTH
  ) {
    flags.push({
      code: 'SHORT_DESCRIPTION',
      severity: 'WARNING',
      field: 'description',
      message: `행사 설명이 너무 짧습니다 (${normalized.description.length}자). ${MIN_DESCRIPTION_LENGTH}자 이상을 권장합니다.`,
    });
  }

  // district 검증
  if (isEmpty(normalized.district)) {
    flags.push({
      code: 'MISSING_DISTRICT',
      severity: 'WARNING',
      field: 'district',
      message: '자치구(district) 정보가 없습니다. 지역 필터 기능에 사용됩니다.',
    });
  }

  // organizer 검증
  if (isEmpty(normalized.organizer)) {
    flags.push({
      code: 'MISSING_ORGANIZER',
      severity: 'WARNING',
      field: 'organizer',
      message: '주최 기관(organizer) 정보가 없습니다.',
    });
  }

  // contactInfo 검증
  if (isEmpty(normalized.contactInfo)) {
    flags.push({
      code: 'MISSING_CONTACT_INFO',
      severity: 'WARNING',
      field: 'contactInfo',
      message: '연락처(contactInfo) 정보가 없습니다.',
    });
  }

  // website 검증
  if (isEmpty(normalized.website)) {
    flags.push({
      code: 'MISSING_WEBSITE',
      severity: 'WARNING',
      field: 'website',
      message: '공식 웹사이트(website) URL이 없습니다.',
    });
  }

  // imageUrl 검증
  if (isEmpty(normalized.imageUrl)) {
    flags.push({
      code: 'MISSING_IMAGE_URL',
      severity: 'WARNING',
      field: 'imageUrl',
      message: '대표 이미지(imageUrl)가 없습니다. 지도 마커 및 목록 표시에 사용됩니다.',
    });
  }

  return flags;
}

// ────────────────────────────────────────────────────────────────
// 변환 함수
// ────────────────────────────────────────────────────────────────

/**
 * 원시 JSON 레코드를 정규화된 SeedEventRecord로 변환하고 검증
 */
function transformAndValidate(raw: RawEventRecord): ValidatedEventRecord {
  const originalSourceId = String(raw.sourceId ?? '(없음)');

  // 1. 정규화: 모든 필드를 앱 스키마 타입으로 변환
  const latRaw = normalizeNumeric(raw.latitude);
  const lngRaw = normalizeNumeric(raw.longitude);
  const startDateNorm = normalizeDateString(raw.startDate);
  const endDateNorm = normalizeDateString(raw.endDate);
  const eventTypeNorm = normalizeEventType(raw.eventType);

  // 종료일이 시작일보다 이른 경우 시작일로 보정 (경고 아닌 자동 수정)
  let endDateFinal = endDateNorm;
  let endDateAdjusted = false;
  if (
    startDateNorm &&
    endDateNorm &&
    isValidDateString(startDateNorm) &&
    isValidDateString(endDateNorm) &&
    endDateNorm < startDateNorm
  ) {
    endDateFinal = startDateNorm;
    endDateAdjusted = true;
  }

  const normalized: Partial<SeedEventRecord> = {
    sourceId: normalizeString(raw.sourceId) ?? undefined,
    name: normalizeString(raw.name) ?? undefined,
    description: normalizeString(raw.description),
    eventType: eventTypeNorm ?? undefined,
    startDate: startDateNorm ?? undefined,
    endDate: endDateFinal ?? undefined,
    venue: normalizeString(raw.venue) ?? undefined,
    address: normalizeString(raw.address) ?? undefined,
    latitude: latRaw !== null ? normalizeCoordinate(latRaw) : undefined,
    longitude: lngRaw !== null ? normalizeCoordinate(lngRaw) : undefined,
    district: normalizeString(raw.district),
    city: normalizeString(raw.city) ?? '서울특별시',
    imageUrl: normalizeString(raw.imageUrl),
    sourceUrl: normalizeString(raw.sourceUrl),
    isFree: normalizeBoolean(raw.isFree),
    price: normalizeString(raw.price),
    organizer: normalizeString(raw.organizer),
    contactInfo: normalizeString(raw.contactInfo),
    website: normalizeString(raw.website),
  };

  // 2. 검증
  const requiredFlags = validateRequiredFields(raw, normalized);
  const completenessFlags = validateCompleteness(normalized);

  // 종료일 자동 보정 플래그
  if (endDateAdjusted) {
    completenessFlags.push({
      code: 'COORDINATES_ADJUSTED', // 재활용: 날짜 보정에도 사용
      severity: 'WARNING',
      field: 'endDate',
      message: `종료일(${endDateNorm})이 시작일(${startDateNorm})보다 이르므로 시작일로 보정되었습니다.`,
    });
  }

  const allFlags = [...requiredFlags, ...completenessFlags];
  const hasErrors = requiredFlags.length > 0;
  const hasWarnings = completenessFlags.length > 0;

  // 3. 검증 상태 결정
  const status: ValidationStatus = hasErrors
    ? 'INVALID'
    : hasWarnings
    ? 'VALID_WITH_WARNINGS'
    : 'VALID';

  // 4. 에러가 있어도 가능한 필드로 레코드 구성 (플래그 분석용)
  const record: SeedEventRecord = {
    sourceId: normalized.sourceId ?? `generated-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: normalized.name ?? '(이름 없음)',
    description: normalized.description ?? null,
    eventType: normalized.eventType ?? 'FESTIVAL',
    startDate: normalized.startDate ?? new Date().toISOString().slice(0, 10),
    endDate: normalized.endDate ?? new Date().toISOString().slice(0, 10),
    venue: normalized.venue ?? '(장소 없음)',
    address: normalized.address ?? '(주소 없음)',
    latitude: normalized.latitude ?? 0,
    longitude: normalized.longitude ?? 0,
    district: normalized.district ?? null,
    city: normalized.city ?? '서울특별시',
    imageUrl: normalized.imageUrl ?? null,
    sourceUrl: normalized.sourceUrl ?? null,
    isFree: normalized.isFree ?? false,
    price: normalized.price ?? null,
    organizer: normalized.organizer ?? null,
    contactInfo: normalized.contactInfo ?? null,
    website: normalized.website ?? null,
  };

  return {
    record,
    status,
    flags: allFlags,
    originalSourceId,
  };
}

// ────────────────────────────────────────────────────────────────
// 데이터 로드 함수
// ────────────────────────────────────────────────────────────────

/**
 * JSON 파일에서 이벤트 배열 로드
 */
function loadEventsFromFile(filePath: string): RawEventRecord[] {
  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠️  파일 없음: ${filePath}`);
    return [];
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const json = JSON.parse(content);

    // { meta: ..., events: [...] } 형식
    if (json && typeof json === 'object' && Array.isArray(json.events)) {
      return json.events as RawEventRecord[];
    }

    // 배열 직접
    if (Array.isArray(json)) {
      return json as RawEventRecord[];
    }

    console.warn(`  ⚠️  인식할 수 없는 파일 형식: ${filePath}`);
    return [];
  } catch (err) {
    console.error(`  ❌ 파일 파싱 오류 (${filePath}): ${err}`);
    return [];
  }
}

/**
 * 여러 소스에서 이벤트 로드 및 sourceId 기준 중복 제거
 */
function loadAndMergeRawEvents(dataDir: string): RawEventRecord[] {
  const sources = [
    { file: path.join(dataDir, 'merged-events.json'), label: '병합 데이터' },
    { file: path.join(dataDir, 'curated-events.json'), label: '큐레이션 데이터' },
    { file: path.join(dataDir, 'tour-api-raw.json'), label: 'TourAPI 원시 데이터' },
    { file: path.join(dataDir, 'seoul-open-data-raw.json'), label: '서울 열린데이터 원시 데이터' },
  ];

  const seen = new Set<string>();
  const allEvents: RawEventRecord[] = [];

  for (const source of sources) {
    const events = loadEventsFromFile(source.file);
    if (events.length === 0) continue;

    let added = 0;
    let duplicates = 0;

    for (const event of events) {
      const sid = String(event.sourceId ?? '');
      if (sid && seen.has(sid)) {
        duplicates++;
        continue;
      }
      if (sid) seen.add(sid);
      allEvents.push(event);
      added++;
    }

    console.log(`  📄 ${source.label}: ${added}개 로드 (중복 ${duplicates}개 제외)`);
  }

  return allEvents;
}

// ────────────────────────────────────────────────────────────────
// 보고서 생성 함수
// ────────────────────────────────────────────────────────────────

function generateReport(results: ValidatedEventRecord[]): ValidationReport {
  const valid = results.filter(r => r.status === 'VALID').length;
  const validWithWarnings = results.filter(r => r.status === 'VALID_WITH_WARNINGS').length;
  const invalid = results.filter(r => r.status === 'INVALID').length;
  const seededCount = valid + validWithWarnings;

  // 유형별 통계 (유효한 레코드만)
  const typeBreakdown = { FESTIVAL: 0, FLEA_MARKET: 0, NIGHT_MARKET: 0 };
  for (const result of results) {
    if (result.status !== 'INVALID') {
      const t = result.record.eventType;
      if (t in typeBreakdown) typeBreakdown[t]++;
    }
  }

  // 에러/경고 코드별 집계
  const errorBreakdown: Record<string, number> = {};
  const warningBreakdown: Record<string, number> = {};

  for (const result of results) {
    for (const flag of result.flags) {
      if (flag.severity === 'ERROR') {
        errorBreakdown[flag.code] = (errorBreakdown[flag.code] ?? 0) + 1;
      } else {
        warningBreakdown[flag.code] = (warningBreakdown[flag.code] ?? 0) + 1;
      }
    }
  }

  // 플래그된 레코드 목록 (에러 또는 경고가 있는 것)
  const flaggedRecords = results
    .filter(r => r.flags.length > 0)
    .map(r => ({
      sourceId: r.record.sourceId,
      name: r.record.name,
      status: r.status,
      flags: r.flags,
    }));

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: results.length,
      valid,
      validWithWarnings,
      invalid,
      seededCount,
    },
    typeBreakdown,
    errorBreakdown,
    warningBreakdown,
    flaggedRecords,
  };
}

// ────────────────────────────────────────────────────────────────
// 출력 함수
// ────────────────────────────────────────────────────────────────

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeJson(filePath: string, data: unknown, label: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`  ✅ 저장: ${filePath} (${label})`);
}

// ────────────────────────────────────────────────────────────────
// 중복 sourceId 감지
// ────────────────────────────────────────────────────────────────

function detectDuplicates(results: ValidatedEventRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const result of results) {
    const sid = result.record.sourceId;
    counts.set(sid, (counts.get(sid) ?? 0) + 1);
  }
  return new Map([...counts.entries()].filter(([, count]) => count > 1));
}

// ────────────────────────────────────────────────────────────────
// 메인 실행
// ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🔍 FestiMap 이벤트 데이터 변환 및 검증 시작...\n');

  const projectRoot = process.cwd();
  const dataRawDir = path.join(projectRoot, 'data', 'raw');
  const dataDir = path.join(projectRoot, 'data');
  const prismaDir = path.join(projectRoot, 'prisma');

  // 1. 원시 데이터 로드
  console.log('📂 원시 데이터 로드 중...');
  const rawEvents = loadAndMergeRawEvents(dataRawDir);
  console.log(`   총 ${rawEvents.length}개 원시 레코드 로드\n`);

  if (rawEvents.length === 0) {
    console.error('❌ 로드된 이벤트가 없습니다. data/raw/ 디렉토리를 확인하세요.');
    console.error('   npm run events:collect 을 먼저 실행하세요.');
    process.exit(1);
  }

  // 2. 변환 및 검증
  console.log('🔧 데이터 변환 및 검증 중...');
  const results = rawEvents.map(raw => transformAndValidate(raw));

  // 3. 중복 sourceId 감지
  const duplicates = detectDuplicates(results);
  if (duplicates.size > 0) {
    console.warn(`\n⚠️  중복 sourceId 감지: ${duplicates.size}개`);
    for (const [sid, count] of duplicates.entries()) {
      console.warn(`   - "${sid}": ${count}회 등장`);
      // 중복 레코드에 플래그 추가
      let isFirst = true;
      for (const result of results) {
        if (result.record.sourceId === sid) {
          if (!isFirst) {
            result.flags.push({
              code: 'DUPLICATE_SOURCE_ID',
              severity: 'ERROR',
              field: 'sourceId',
              message: `sourceId "${sid}"가 중복됩니다. 첫 번째 항목만 시드 데이터에 포함됩니다.`,
            });
            result.status = 'INVALID';
          }
          isFirst = false;
        }
      }
    }
  }

  // 4. 결과 분류
  const validResults = results.filter(r => r.status !== 'INVALID');
  const invalidResults = results.filter(r => r.status === 'INVALID');
  const withWarnings = results.filter(r => r.status === 'VALID_WITH_WARNINGS');
  const perfectResults = results.filter(r => r.status === 'VALID');

  console.log(`\n📊 검증 결과:`);
  console.log(`   ✅ 완전 유효:         ${perfectResults.length}개`);
  console.log(`   ⚠️  경고 있음:         ${withWarnings.length}개`);
  console.log(`   ❌ 유효하지 않음:      ${invalidResults.length}개`);
  console.log(`   📦 시드 데이터 포함:  ${validResults.length}개\n`);

  if (validResults.length < 50) {
    console.warn(`⚠️  경고: 유효한 행사 수(${validResults.length})가 50개 미만입니다!`);
    console.warn(`   npm run events:collect 로 추가 데이터를 수집하세요.\n`);
  }

  // 5. 유형별 통계
  const typeStats = validResults.reduce(
    (acc, r) => {
      const t = r.record.eventType;
      acc[t] = (acc[t] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  console.log('📈 유형별 통계 (유효한 행사):');
  console.log(`   - 축제 (FESTIVAL):        ${typeStats.FESTIVAL ?? 0}개`);
  console.log(`   - 플리마켓 (FLEA_MARKET): ${typeStats.FLEA_MARKET ?? 0}개`);
  console.log(`   - 야시장 (NIGHT_MARKET):  ${typeStats.NIGHT_MARKET ?? 0}개\n`);

  // 6. 에러 상세 출력
  if (invalidResults.length > 0) {
    console.log('❌ 유효하지 않은 레코드:');
    for (const result of invalidResults) {
      const errors = result.flags.filter(f => f.severity === 'ERROR');
      console.log(`   [${result.originalSourceId}] ${result.record.name}`);
      for (const flag of errors) {
        console.log(`     - [${flag.code}] ${flag.message}`);
      }
    }
    console.log('');
  }

  // 7. 경고 요약 출력
  if (withWarnings.length > 0) {
    const warningCodes: Record<string, number> = {};
    for (const result of withWarnings) {
      for (const flag of result.flags.filter(f => f.severity === 'WARNING')) {
        warningCodes[flag.code] = (warningCodes[flag.code] ?? 0) + 1;
      }
    }

    console.log('⚠️  경고 요약 (유형별 빈도):');
    for (const [code, count] of Object.entries(warningCodes).sort(([, a], [, b]) => b - a)) {
      const pct = Math.round((count / withWarnings.length) * 100);
      console.log(`   ${code}: ${count}건 (경고 레코드의 ${pct}%)`);
    }
    console.log('');
  }

  // 8. 시드 데이터 저장 (유효한 레코드만)
  const seedData = validResults.map(r => r.record);
  const seedDataPath = path.join(prismaDir, 'seed-data.json');
  console.log('💾 파일 저장 중...');
  writeJson(seedDataPath, seedData, `${seedData.length}개 행사`);

  // 9. 플래그된 레코드 저장 (에러 + 경고 모두)
  const flaggedData = {
    meta: {
      generatedAt: new Date().toISOString(),
      totalFlagged: results.filter(r => r.flags.length > 0).length,
      invalidCount: invalidResults.length,
      warningCount: withWarnings.length,
    },
    invalidRecords: invalidResults.map(r => ({
      sourceId: r.record.sourceId,
      name: r.record.name,
      status: r.status,
      errorFlags: r.flags.filter(f => f.severity === 'ERROR'),
    })),
    warningRecords: withWarnings.map(r => ({
      sourceId: r.record.sourceId,
      name: r.record.name,
      status: r.status,
      warningFlags: r.flags.filter(f => f.severity === 'WARNING'),
    })),
  };

  const flaggedPath = path.join(dataDir, 'flagged-events.json');
  writeJson(flaggedPath, flaggedData, `${invalidResults.length}개 에러 + ${withWarnings.length}개 경고`);

  // 10. 검증 보고서 저장
  const report = generateReport(results);
  const reportPath = path.join(dataDir, 'validation-report.json');
  writeJson(reportPath, report, '검증 보고서');

  // 11. 최종 요약
  console.log('\n─────────────────────────────────────────');
  console.log('✅ 변환 및 검증 완료!\n');
  console.log('📁 생성된 파일:');
  console.log(`   prisma/seed-data.json      → DB 시드 데이터 (${seedData.length}개)`);
  console.log(`   data/flagged-events.json   → 플래그된 레코드 분석`);
  console.log(`   data/validation-report.json → 전체 검증 보고서`);
  console.log('\n💡 다음 단계:');
  console.log('   npm run db:seed  → 시드 데이터를 데이터베이스에 저장');
  console.log('─────────────────────────────────────────\n');
}

main().catch((err) => {
  console.error('변환/검증 오류:', err);
  process.exit(1);
});
