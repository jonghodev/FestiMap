#!/usr/bin/env tsx
/**
 * FestiMap 프로덕션 데이터베이스 시딩 스크립트
 *
 * 이 스크립트는 검증된 이벤트 JSON 데이터를 프로덕션 PostgreSQL 데이터베이스에
 * 멱등성(idempotency) 기반으로 업서트(upsert)하는 전용 시딩 도구입니다.
 *
 * ─────────────────────────────────────────────────────────────────────
 * 사용법:
 *   # 일반 시딩 (멱등성 기반 upsert)
 *   DATABASE_URL="postgresql://..." npx tsx scripts/seed-production.ts
 *   npm run db:prod:seed
 *
 *   # 미리보기 (실제 DB 변경 없음)
 *   npm run db:prod:seed:dry-run
 *
 *   # 초기화 후 재시딩
 *   npm run db:prod:seed:reset
 *
 *   # 배치 크기 지정
 *   npx tsx scripts/seed-production.ts --batch-size=20
 * ─────────────────────────────────────────────────────────────────────
 *
 * 멱등성 보장:
 *   - sourceId를 중복 방지 키(upsert key)로 사용
 *   - 기존 레코드와 필드 단위 비교 → 변경 없으면 SKIPPED
 *   - 변경이 감지된 경우만 UPDATE 실행
 *   - 신규 레코드는 INSERT
 *
 * 처리 결과:
 *   - INSERTED: 새로 생성된 레코드 수
 *   - UPDATED:  변경 사항이 있어 업데이트된 레코드 수
 *   - SKIPPED:  변경 없이 건너뛴 레코드 수 (멱등성 보장)
 *   - ERRORS:   처리 중 오류가 발생한 레코드 수
 *
 * 보고서:
 *   실행 결과가 data/seed-report-production.json 에 저장됩니다.
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

// ────────────────────────────────────────────────────────────────
// 환경 변수 로드 (프로덕션 PostgreSQL DATABASE_URL 포함)
// 우선순위: .env.production.local → .env.local → .env
// ────────────────────────────────────────────────────────────────

function loadEnvFiles(): void {
  const root = process.cwd();
  const envFiles = [
    '.env.production.local',
    '.env.local',
    '.env',
  ];

  for (const fileName of envFiles) {
    const envFile = path.join(root, fileName);
    if (!fs.existsSync(envFile)) continue;
    const content = fs.readFileSync(envFile, 'utf-8');
    let loaded = false;
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const raw = trimmed.slice(eqIdx + 1).trim();
      // 따옴표 제거
      const val = raw.replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
        loaded = true;
      }
    }
    if (loaded) {
      console.log(`📄 환경 변수 로드: ${fileName}`);
    }
  }
}

// 환경 변수 로드 (실행 시작 시)
loadEnvFiles();

// ────────────────────────────────────────────────────────────────
// CLI 플래그 파싱
// ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const RESET_MODE = args.includes('--reset');
const DRY_RUN = args.includes('--dry-run');

/** 배치 처리 크기 (PostgreSQL 성능 최적화) */
const BATCH_SIZE = (() => {
  const batchArg = args.find(a => a.startsWith('--batch-size='));
  if (batchArg) {
    const n = parseInt(batchArg.split('=')[1], 10);
    return isNaN(n) || n < 1 ? 10 : n;
  }
  return 10; // 기본값: 10개씩 처리
})();

// ────────────────────────────────────────────────────────────────
// 타입 정의
// ────────────────────────────────────────────────────────────────

/** 시드 데이터 레코드 (seed-data.json 스키마) */
interface SeedEventRecord {
  sourceId: string;
  name: string;
  description: string | null;
  eventType: string;
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

/** 검증 보고서 요약 */
interface ValidationReport {
  generatedAt: string;
  summary: {
    total: number;
    valid: number;
    validWithWarnings: number;
    invalid: number;
    seededCount: number;
  };
  typeBreakdown: Record<string, number>;
  warningBreakdown: Record<string, number>;
  errorBreakdown: Record<string, number>;
}

/** 레코드 처리 결과 */
type ProcessResult = 'INSERTED' | 'UPDATED' | 'SKIPPED' | 'ERROR';

/** 레코드별 처리 상세 정보 */
interface RecordDetail {
  sourceId: string;
  name: string;
  result: ProcessResult;
  /** 변경된 필드 목록 (UPDATED인 경우) */
  changedFields?: string[];
  /** 오류 메시지 (ERROR인 경우) */
  error?: string;
}

/** 프로덕션 시딩 실행 보고서 */
interface ProductionSeedReport {
  generatedAt: string;
  environment: 'production';
  databaseUrl: string; // 비밀번호 마스킹된 URL
  sourceFile: string;
  validationReportFile: string;
  validationSummary?: ValidationReport['summary'];
  mode: 'normal' | 'reset' | 'dry-run';
  batchSize: number;
  summary: {
    total: number;
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  typeBreakdown: {
    FESTIVAL: number;
    FLEA_MARKET: number;
    NIGHT_MARKET: number;
  };
  districtBreakdown: Record<string, number>;
  cityBreakdown: Record<string, number>;
  pricingBreakdown: {
    free: number;
    paid: number;
  };
  details: RecordDetail[];
  durationMs: number;
}

// ────────────────────────────────────────────────────────────────
// 유틸리티 함수
// ────────────────────────────────────────────────────────────────

/** "YYYY-MM-DD" 문자열 → UTC 자정 Date 객체 */
function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** DATABASE_URL에서 비밀번호를 마스킹 (PostgreSQL URL만 처리) */
function maskDatabaseUrl(url: string): string {
  // SQLite file URL은 마스킹 불필요
  if (url.startsWith('file:')) return url;
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '****';
    }
    return parsed.toString();
  } catch {
    // URL 파싱 실패 시 패스워드 부분만 마스킹
    return url.replace(/(:\/\/[^:]+:)([^@]+)(@)/, '$1****$3');
  }
}

/** 날짜 비교 헬퍼 */
function datesEqual(dbDate: Date, seedDateStr: string): boolean {
  return dbDate.getTime() === parseDate(seedDateStr).getTime();
}

/**
 * 기존 DB 레코드와 시드 데이터를 비교하여 변경된 필드 목록 반환.
 * 빈 배열 반환 시 변경 없음 (SKIPPED).
 */
function detectChanges(
  existing: Record<string, unknown>,
  seed: SeedEventRecord,
): string[] {
  const changed: string[] = [];

  // 문자열/nullable 필드 비교
  const stringFields: Array<keyof SeedEventRecord> = [
    'name', 'description', 'eventType', 'venue', 'address',
    'district', 'city', 'imageUrl', 'sourceUrl',
    'price', 'organizer', 'contactInfo', 'website',
  ];
  for (const field of stringFields) {
    const dbVal = existing[field] ?? null;
    const seedVal = (seed[field] as string | null | undefined) ?? null;
    if (dbVal !== seedVal) {
      changed.push(field);
    }
  }

  // 날짜 비교
  if (!datesEqual(existing['startDate'] as Date, seed.startDate)) {
    changed.push('startDate');
  }
  if (!datesEqual(existing['endDate'] as Date, seed.endDate)) {
    changed.push('endDate');
  }

  // 좌표 비교 (부동소수점 허용 오차 적용)
  const GEO_TOLERANCE = 1e-7;
  if (Math.abs((existing['latitude'] as number) - seed.latitude) > GEO_TOLERANCE) {
    changed.push('latitude');
  }
  if (Math.abs((existing['longitude'] as number) - seed.longitude) > GEO_TOLERANCE) {
    changed.push('longitude');
  }

  // 불리언 비교
  if ((existing['isFree'] as boolean) !== seed.isFree) {
    changed.push('isFree');
  }

  return changed;
}

/**
 * 시드 레코드 유효성 검사.
 * 오류 메시지 배열 반환 (빈 배열 = 유효).
 */
function validateRecord(record: SeedEventRecord): string[] {
  const errors: string[] = [];

  if (!record.sourceId?.trim()) errors.push('sourceId 누락');
  if (!record.name?.trim()) errors.push('name 누락');
  if (!record.eventType) errors.push('eventType 누락');
  if (!['FESTIVAL', 'FLEA_MARKET', 'NIGHT_MARKET'].includes(record.eventType)) {
    errors.push(`유효하지 않은 eventType: ${record.eventType}`);
  }
  if (!record.startDate || !/^\d{4}-\d{2}-\d{2}$/.test(record.startDate)) {
    errors.push(`유효하지 않은 startDate: ${record.startDate}`);
  }
  if (!record.endDate || !/^\d{4}-\d{2}-\d{2}$/.test(record.endDate)) {
    errors.push(`유효하지 않은 endDate: ${record.endDate}`);
  }
  if (typeof record.latitude !== 'number' || record.latitude < 33 || record.latitude > 43) {
    errors.push(`위도 범위 초과: ${record.latitude} (허용: 33~43)`);
  }
  if (typeof record.longitude !== 'number' || record.longitude < 124 || record.longitude > 132) {
    errors.push(`경도 범위 초과: ${record.longitude} (허용: 124~132)`);
  }
  if (!record.venue?.trim()) errors.push('venue 누락');
  if (!record.address?.trim()) errors.push('address 누락');

  return errors;
}

// ────────────────────────────────────────────────────────────────
// 파일 로드 헬퍼
// ────────────────────────────────────────────────────────────────

function loadSeedData(filePath: string): SeedEventRecord[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `시드 데이터 파일을 찾을 수 없습니다: ${filePath}\n` +
      `다음 명령으로 생성하세요: npm run events:validate`,
    );
  }

  let records: unknown;
  try {
    records = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    throw new Error(`JSON 파싱 오류: ${filePath}`);
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error(
      `시드 데이터가 비어 있거나 올바르지 않은 형식입니다: ${filePath}`,
    );
  }

  return records as SeedEventRecord[];
}

function loadValidationReport(filePath: string): ValidationReport | null {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  검증 보고서를 찾을 수 없습니다: ${filePath}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as ValidationReport;
  } catch {
    console.warn(`⚠️  검증 보고서 파싱 실패: ${filePath}`);
    return null;
  }
}

// ────────────────────────────────────────────────────────────────
// 배치 처리 헬퍼
// ────────────────────────────────────────────────────────────────

/** 배열을 N개씩 나누어 반환 */
function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ────────────────────────────────────────────────────────────────
// 진행률 표시
// ────────────────────────────────────────────────────────────────

function printProgress(current: number, total: number): void {
  const pct = Math.round((current / total) * 100);
  const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
  process.stdout.write(`\r  [${bar}] ${pct}% (${current}/${total}개)`);
}

// ────────────────────────────────────────────────────────────────
// 메인 시딩 함수
// ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startTime = Date.now();

  // ── 환경 확인 ─────────────────────────────────────────────────
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL 환경 변수가 설정되지 않았습니다.');
    console.error('   .env.local 또는 .env.production.local 파일에 DATABASE_URL을 설정하세요.');
    console.error('   예시: DATABASE_URL="postgresql://user:password@host:5432/festimap?schema=festimap"');
    process.exit(1);
  }

  const isPostgres = dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://');
  const maskedUrl = maskDatabaseUrl(dbUrl);

  // ── 파일 경로 설정 ────────────────────────────────────────────
  const root = process.cwd();
  const seedFilePath = path.resolve(root, 'prisma', 'seed-data.json');
  const validationReportPath = path.resolve(root, 'data', 'validation-report.json');
  const seedReportPath = path.resolve(root, 'data', 'seed-report-production.json');

  // ── 헤더 출력 ─────────────────────────────────────────────────
  console.log('');
  console.log('🌱 FestiMap 프로덕션 데이터베이스 시딩');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  DB 유형:     ${isPostgres ? 'PostgreSQL (프로덕션)' : 'SQLite (개발)'}`);
  console.log(`  DB URL:      ${maskedUrl}`);
  console.log(`  시드 파일:   ${seedFilePath}`);
  console.log(`  검증 보고서: ${validationReportPath}`);
  console.log(`  배치 크기:   ${BATCH_SIZE}개`);

  if (RESET_MODE) {
    console.log('  모드:        ⚠️  RESET (기존 시드 데이터 삭제 후 재시딩)');
  } else if (DRY_RUN) {
    console.log('  모드:        🔍 DRY-RUN (실제 DB 변경 없음)');
  } else {
    console.log('  모드:        ✅ 일반 (멱등성 기반 upsert)');
  }
  console.log('');

  // ── 1. 데이터 파일 로드 ───────────────────────────────────────
  const seedRecords = loadSeedData(seedFilePath);
  const validationReport = loadValidationReport(validationReportPath);

  console.log(`📦 로드된 이벤트: ${seedRecords.length}개`);

  if (validationReport) {
    const { summary } = validationReport;
    const reportDate = validationReport.generatedAt.slice(0, 10);
    console.log(`✅ 검증 보고서 (${reportDate}):`);
    console.log(`   유효: ${summary.valid}개 | 경고 포함: ${summary.validWithWarnings}개 | 무효: ${summary.invalid}개`);
  }

  if (seedRecords.length < 50) {
    console.warn(`\n⚠️  경고: 이벤트 수(${seedRecords.length})가 50개 미만입니다.`);
    console.warn(`   npm run events:validate 를 실행하여 데이터를 보강하세요.\n`);
  }

  // ── 2. 파일 내 중복 제거 및 유효성 검사 ──────────────────────
  console.log('\n🔍 데이터 유효성 검사 중...');
  const seenSourceIds = new Set<string>();
  const validRecords: SeedEventRecord[] = [];
  let invalidCount = 0;
  let duplicateCount = 0;

  for (const record of seedRecords) {
    const errs = validateRecord(record);
    if (errs.length > 0) {
      console.warn(`  ⚠️  유효성 오류 (${record.sourceId ?? '?'} - ${record.name ?? '?'}): ${errs.join(', ')}`);
      invalidCount++;
      continue;
    }
    if (seenSourceIds.has(record.sourceId)) {
      console.warn(`  ⚠️  중복 sourceId 건너뜀: ${record.sourceId}`);
      duplicateCount++;
      continue;
    }
    seenSourceIds.add(record.sourceId);
    validRecords.push(record);
  }

  if (invalidCount > 0 || duplicateCount > 0) {
    console.log(`  → 유효하지 않음: ${invalidCount}개, 중복: ${duplicateCount}개 제거`);
  }
  console.log(`  → 처리 대상: ${validRecords.length}개`);

  // ── 3. Prisma 클라이언트 초기화 ──────────────────────────────
  const prisma = new PrismaClient({
    log: process.env.DEBUG === 'true' ? ['query', 'error', 'warn'] : ['error'],
  });

  // 연결 테스트
  try {
    await prisma.$connect();
    console.log('\n✅ 데이터베이스 연결 성공');
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ 데이터베이스 연결 실패: ${errMsg}`);
    console.error(`   DATABASE_URL 및 네트워크 설정을 확인하세요.`);
    process.exit(1);
  }

  // ── 4. RESET 모드: 기존 시드 데이터 삭제 ────────────────────
  if (RESET_MODE && !DRY_RUN) {
    console.log('\n🗑️  기존 시드 이벤트 초기화 중...');
    const seedSourceIds = validRecords.map(r => r.sourceId);
    try {
      const deleteResult = await prisma.event.deleteMany({
        where: { sourceId: { in: seedSourceIds } },
      });
      console.log(`  → ${deleteResult.count}개 이벤트 삭제 완료`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`  ❌ 삭제 오류: ${errMsg}`);
      await prisma.$disconnect();
      process.exit(1);
    }
  }

  // ── 5. 배치 처리: INSERT / UPDATE / SKIP ─────────────────────
  console.log(`\n🔄 배치 시딩 시작 (배치 크기: ${BATCH_SIZE}개)...`);
  console.log('──────────────────────────────────────────────────────');

  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const details: RecordDetail[] = [];

  const batches = chunk(validRecords, BATCH_SIZE);
  let processedSoFar = 0;

  for (const batch of batches) {
    // 배치 내 sourceId로 기존 레코드 일괄 조회 (N+1 쿼리 방지)
    const batchSourceIds = batch.map(r => r.sourceId);
    let existingMap = new Map<string, Record<string, unknown>>();

    try {
      const existingRecords = await prisma.event.findMany({
        where: { sourceId: { in: batchSourceIds } },
        select: {
          id: true,
          sourceId: true,
          name: true,
          description: true,
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
          sourceUrl: true,
          isFree: true,
          price: true,
          organizer: true,
          contactInfo: true,
          website: true,
        },
      });
      existingMap = new Map(
        existingRecords.map(r => [r.sourceId as string, r as Record<string, unknown>]),
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      // 배치 전체를 오류로 처리
      for (const record of batch) {
        errorCount++;
        details.push({ sourceId: record.sourceId, name: record.name, result: 'ERROR', error: `조회 오류: ${errMsg}` });
      }
      processedSoFar += batch.length;
      printProgress(processedSoFar, validRecords.length);
      continue;
    }

    // 배치 내 각 레코드 처리
    for (const record of batch) {
      const eventData = {
        name: record.name,
        description: record.description ?? null,
        eventType: record.eventType,
        startDate: parseDate(record.startDate),
        endDate: parseDate(record.endDate),
        venue: record.venue,
        address: record.address,
        latitude: record.latitude,
        longitude: record.longitude,
        district: record.district ?? null,
        city: record.city,
        imageUrl: record.imageUrl ?? null,
        sourceUrl: record.sourceUrl ?? null,
        isFree: record.isFree,
        price: record.price ?? null,
        organizer: record.organizer ?? null,
        contactInfo: record.contactInfo ?? null,
        website: record.website ?? null,
      };

      const existing = existingMap.get(record.sourceId);

      if (DRY_RUN) {
        // Dry-run: 실제 DB 변경 없이 시뮬레이션
        if (!existing) {
          insertedCount++;
          details.push({ sourceId: record.sourceId, name: record.name, result: 'INSERTED' });
        } else {
          const changedFields = detectChanges(existing, record);
          if (changedFields.length === 0) {
            skippedCount++;
            details.push({ sourceId: record.sourceId, name: record.name, result: 'SKIPPED' });
          } else {
            updatedCount++;
            details.push({ sourceId: record.sourceId, name: record.name, result: 'UPDATED', changedFields });
          }
        }
        processedSoFar++;
        printProgress(processedSoFar, validRecords.length);
        continue;
      }

      try {
        if (!existing) {
          // 신규 레코드: upsert로 race condition 방지
          await prisma.event.upsert({
            where: { sourceId: record.sourceId },
            create: { ...eventData, sourceId: record.sourceId },
            update: eventData,
          });
          insertedCount++;
          details.push({ sourceId: record.sourceId, name: record.name, result: 'INSERTED' });
        } else {
          // 기존 레코드: 변경 감지 후 update 또는 skip
          const changedFields = detectChanges(existing, record);

          if (changedFields.length === 0) {
            // 변경 없음: SKIP (멱등성 보장)
            skippedCount++;
            details.push({ sourceId: record.sourceId, name: record.name, result: 'SKIPPED' });
          } else {
            // 변경 있음: 업데이트
            await prisma.event.upsert({
              where: { sourceId: record.sourceId },
              create: { ...eventData, sourceId: record.sourceId },
              update: eventData,
            });
            updatedCount++;
            details.push({
              sourceId: record.sourceId,
              name: record.name,
              result: 'UPDATED',
              changedFields,
            });
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        errorCount++;
        details.push({
          sourceId: record.sourceId,
          name: record.name,
          result: 'ERROR',
          error: errMsg,
        });
      }

      processedSoFar++;
      printProgress(processedSoFar, validRecords.length);
    }
  }

  // 진행률 줄바꿈
  process.stdout.write('\n');

  // ── 6. 통계 집계 ──────────────────────────────────────────────
  const typeBreakdown = validRecords.reduce(
    (acc, e) => {
      if (e.eventType === 'FESTIVAL') acc.FESTIVAL++;
      else if (e.eventType === 'FLEA_MARKET') acc.FLEA_MARKET++;
      else if (e.eventType === 'NIGHT_MARKET') acc.NIGHT_MARKET++;
      return acc;
    },
    { FESTIVAL: 0, FLEA_MARKET: 0, NIGHT_MARKET: 0 },
  );

  const districtBreakdown: Record<string, number> = {};
  const cityBreakdown: Record<string, number> = {};
  for (const e of validRecords) {
    const distKey = e.district ?? '기타';
    districtBreakdown[distKey] = (districtBreakdown[distKey] || 0) + 1;
    const cityKey = e.city ?? '기타';
    cityBreakdown[cityKey] = (cityBreakdown[cityKey] || 0) + 1;
  }

  const pricingBreakdown = validRecords.reduce(
    (acc, e) => { if (e.isFree) acc.free++; else acc.paid++; return acc; },
    { free: 0, paid: 0 },
  );

  const durationMs = Date.now() - startTime;

  // ── 7. 콘솔 결과 출력 ─────────────────────────────────────────
  const resultLine = (label: string, count: number, icon: string) =>
    `  ${icon} ${label.padEnd(10)} ${count.toString().padStart(4)}개`;

  console.log('\n══════════════════════════════════════════════════════');
  console.log('📊 프로덕션 시딩 완료 요약');
  console.log('══════════════════════════════════════════════════════');
  console.log(resultLine('총 처리', validRecords.length, '📦'));
  console.log(resultLine('삽입', insertedCount, '✚'));
  console.log(resultLine('업데이트', updatedCount, '✎'));
  console.log(resultLine('건너뜀', skippedCount, '⏭'));
  if (errorCount > 0) {
    console.log(resultLine('오류', errorCount, '✗'));
  }
  console.log('');
  console.log('📋 유형별:');
  console.log(`   축제 (FESTIVAL):        ${typeBreakdown.FESTIVAL}개`);
  console.log(`   플리마켓 (FLEA_MARKET): ${typeBreakdown.FLEA_MARKET}개`);
  console.log(`   야시장 (NIGHT_MARKET):  ${typeBreakdown.NIGHT_MARKET}개`);
  console.log('');
  console.log('🏙️  도시별:');
  for (const [city, count] of Object.entries(cityBreakdown).sort(([, a], [, b]) => b - a)) {
    console.log(`   ${city}: ${count}개`);
  }
  console.log('');
  console.log('💰 가격별:');
  console.log(`   무료: ${pricingBreakdown.free}개`);
  console.log(`   유료: ${pricingBreakdown.paid}개`);
  console.log(`\n⏱  소요 시간: ${durationMs}ms`);

  if (DRY_RUN) {
    console.log('\n🔍 DRY-RUN 완료: 실제 DB에는 아무 변경도 없었습니다.');
    console.log('   실제 적용: npm run db:prod:seed');
  }

  // 삽입/업데이트된 레코드 목록 출력 (최대 20개)
  const changedDetails = details.filter(d => d.result === 'INSERTED' || d.result === 'UPDATED');
  if (changedDetails.length > 0) {
    console.log(`\n📝 변경된 레코드 (${Math.min(changedDetails.length, 20)}/${changedDetails.length}개):`);
    for (const d of changedDetails.slice(0, 20)) {
      if (d.result === 'INSERTED') {
        console.log(`  ✚ [INSERT] ${d.name} (${d.sourceId})`);
      } else if (d.result === 'UPDATED' && d.changedFields) {
        console.log(`  ✎ [UPDATE] ${d.name} (${d.sourceId}) → 변경: ${d.changedFields.join(', ')}`);
      }
    }
    if (changedDetails.length > 20) {
      console.log(`  ... 외 ${changedDetails.length - 20}개`);
    }
  }

  // ── 8. 보고서 파일 저장 ────────────────────────────────────────
  const mode: ProductionSeedReport['mode'] =
    DRY_RUN ? 'dry-run' : RESET_MODE ? 'reset' : 'normal';

  const report: ProductionSeedReport = {
    generatedAt: new Date().toISOString(),
    environment: 'production',
    databaseUrl: maskedUrl,
    sourceFile: seedFilePath,
    validationReportFile: validationReportPath,
    validationSummary: validationReport?.summary,
    mode,
    batchSize: BATCH_SIZE,
    summary: {
      total: validRecords.length,
      inserted: insertedCount,
      updated: updatedCount,
      skipped: skippedCount,
      errors: errorCount,
    },
    typeBreakdown,
    districtBreakdown,
    cityBreakdown,
    pricingBreakdown,
    details,
    durationMs,
  };

  // data/ 디렉터리 생성 (없으면)
  const dataDir = path.resolve(root, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(seedReportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\n💾 시딩 보고서 저장됨: ${seedReportPath}`);

  // ── 9. 최소 이벤트 수 검증 ────────────────────────────────────
  if (!DRY_RUN) {
    try {
      const totalEventsInDb = await prisma.event.count();
      if (totalEventsInDb < 50) {
        console.warn(`\n⚠️  경고: DB 이벤트 총 수(${totalEventsInDb})가 50개 미만입니다.`);
      } else {
        console.log(`\n✅ 최소 이벤트 수 충족: DB에 총 ${totalEventsInDb}개 이벤트 존재 (기준: 50개)`);
      }
    } catch {
      // count 실패는 치명적이지 않으므로 경고만
      console.warn('\n⚠️  DB 이벤트 수 확인 실패');
    }
  }

  if (errorCount > 0) {
    console.error(`\n❌ ${errorCount}개의 오류가 발생했습니다.`);
    console.error(`   상세 내용: ${seedReportPath}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  await prisma.$disconnect();
}

// ────────────────────────────────────────────────────────────────
// 실행
// ────────────────────────────────────────────────────────────────

main().catch(async (e) => {
  console.error('\n❌ 시딩 중 예상치 못한 오류 발생:');
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
