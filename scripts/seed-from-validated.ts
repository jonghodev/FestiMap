#!/usr/bin/env tsx
/**
 * FestiMap 검증 데이터 기반 데이터베이스 시딩 스크립트
 *
 * 사용법:
 *   npm run db:seed:validated
 *   # 또는
 *   npx tsx scripts/seed-from-validated.ts
 *   npx tsx scripts/seed-from-validated.ts --reset   # 기존 데이터 초기화 후 재시딩
 *   npx tsx scripts/seed-from-validated.ts --dry-run # 실제 변경 없이 결과 미리보기
 *
 * 기능:
 *   1. prisma/seed-data.json (검증된 이벤트 데이터) 로드
 *   2. data/validation-report.json (검증 보고서) 참조
 *   3. 중복 방지를 위한 멱등성(idempotency) 검사:
 *      - sourceId 기준으로 기존 레코드 확인 (Prisma upsert 활용)
 *      - 데이터 변경 여부를 필드 단위로 비교
 *      - 변경 없으면 SKIPPED, 변경 있으면 UPDATED, 신규면 INSERTED
 *   4. 처리 결과를 콘솔 출력 및 data/seed-report.json 저장
 *
 * 처리 결과 요약:
 *   - INSERTED: 새로 생성된 레코드 수
 *   - UPDATED:  변경 사항이 있어 업데이트된 레코드 수
 *   - SKIPPED:  변경 없이 건너뛴 레코드 수 (멱등성 보장)
 *   - ERRORS:   처리 중 오류가 발생한 레코드 수
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.DEBUG === 'true' ? ['query', 'error'] : ['error'],
});

// ────────────────────────────────────────────────────────────────
// CLI 플래그 파싱
// ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const RESET_MODE = args.includes('--reset');
const DRY_RUN = args.includes('--dry-run');

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

/** 검증 보고서 요약 (validation-report.json) */
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

/** 시딩 실행 보고서 */
interface SeedReport {
  /** 보고서 생성 시각 (ISO 8601) */
  generatedAt: string;
  /** 데이터 소스 파일 경로 */
  sourceFile: string;
  /** 검증 보고서 참조 경로 */
  validationReportFile: string;
  /** 검증 보고서 요약 (있는 경우) */
  validationSummary?: ValidationReport['summary'];
  /** 실행 모드 */
  mode: 'normal' | 'reset' | 'dry-run';
  /** 처리 결과 요약 */
  summary: {
    total: number;
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
  };
  /** 유형별 통계 */
  typeBreakdown: {
    FESTIVAL: number;
    FLEA_MARKET: number;
    NIGHT_MARKET: number;
  };
  /** 지역별 통계 */
  districtBreakdown: Record<string, number>;
  /** 무료/유료 통계 */
  pricingBreakdown: {
    free: number;
    paid: number;
  };
  /** 레코드별 상세 처리 결과 */
  details: RecordDetail[];
  /** 실행 소요 시간 (ms) */
  durationMs: number;
}

// ────────────────────────────────────────────────────────────────
// 날짜 변환: "YYYY-MM-DD" → Date (UTC 자정)
// ────────────────────────────────────────────────────────────────

function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
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

  const content = fs.readFileSync(filePath, 'utf-8');
  let records: unknown;
  try {
    records = JSON.parse(content);
  } catch {
    throw new Error(`JSON 파싱 오류: ${filePath}`);
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error(`시드 데이터가 비어 있거나 올바르지 않은 형식입니다: ${filePath}`);
  }

  return records as SeedEventRecord[];
}

function loadValidationReport(filePath: string): ValidationReport | null {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  검증 보고서를 찾을 수 없습니다: ${filePath}`);
    return null;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as ValidationReport;
}

// ────────────────────────────────────────────────────────────────
// 멱등성 비교: 기존 DB 레코드 vs 신규 시드 데이터
// ────────────────────────────────────────────────────────────────

/**
 * 날짜 비교 헬퍼: "YYYY-MM-DD" 문자열을 UTC Date로 변환 후 비교
 */
function datesEqual(dbDate: Date, seedDateStr: string): boolean {
  const seedDate = parseDate(seedDateStr);
  return dbDate.getTime() === seedDate.getTime();
}

/**
 * 기존 DB 레코드와 신규 시드 데이터를 비교하여 변경된 필드 목록을 반환.
 * 빈 배열이면 변경 없음 (SKIP 가능).
 */
function detectChanges(
  existing: Record<string, unknown>,
  seedRecord: SeedEventRecord,
): string[] {
  const changed: string[] = [];

  // 문자열 필드 비교 (null-safe)
  const stringFields: Array<keyof SeedEventRecord> = [
    'name', 'description', 'eventType', 'venue', 'address',
    'district', 'city', 'imageUrl', 'sourceUrl', 'price', 'organizer',
    'contactInfo', 'website',
  ];
  for (const field of stringFields) {
    const dbVal = existing[field] ?? null;
    const seedVal = (seedRecord[field] as string | null | undefined) ?? null;
    if (dbVal !== seedVal) {
      changed.push(field);
    }
  }

  // 날짜 필드 비교
  if (!datesEqual(existing['startDate'] as Date, seedRecord.startDate)) {
    changed.push('startDate');
  }
  if (!datesEqual(existing['endDate'] as Date, seedRecord.endDate)) {
    changed.push('endDate');
  }

  // 숫자 필드 비교 (부동소수점 정밀도 고려)
  const LAT_TOLERANCE = 1e-7;
  const LNG_TOLERANCE = 1e-7;
  if (Math.abs((existing['latitude'] as number) - seedRecord.latitude) > LAT_TOLERANCE) {
    changed.push('latitude');
  }
  if (Math.abs((existing['longitude'] as number) - seedRecord.longitude) > LNG_TOLERANCE) {
    changed.push('longitude');
  }

  // 불리언 필드 비교
  if ((existing['isFree'] as boolean) !== seedRecord.isFree) {
    changed.push('isFree');
  }

  return changed;
}

// ────────────────────────────────────────────────────────────────
// 유효성 검사
// ────────────────────────────────────────────────────────────────

/**
 * 시드 레코드 기본 유효성 검사.
 * 필수 필드 누락 또는 범위 초과 시 오류 목록 반환.
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
    errors.push(`위도 범위 초과: ${record.latitude}`);
  }
  if (typeof record.longitude !== 'number' || record.longitude < 124 || record.longitude > 132) {
    errors.push(`경도 범위 초과: ${record.longitude}`);
  }

  return errors;
}

// ────────────────────────────────────────────────────────────────
// 메인 시딩 함수
// ────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  const seedFilePath = path.resolve(process.cwd(), 'prisma', 'seed-data.json');
  const validationReportPath = path.resolve(process.cwd(), 'data', 'validation-report.json');
  const seedReportPath = path.resolve(process.cwd(), 'data', 'seed-report.json');

  console.log('🌱 FestiMap 검증 데이터 기반 시딩 시작');
  console.log('══════════════════════════════════════════════════');
  console.log(`📂 시드 파일: ${seedFilePath}`);
  console.log(`📋 검증 보고서: ${validationReportPath}`);
  if (RESET_MODE) {
    console.log('⚠️  모드: RESET (기존 이벤트 데이터 초기화 후 재시딩)');
  } else if (DRY_RUN) {
    console.log('🔍 모드: DRY-RUN (실제 DB 변경 없음, 미리보기만)');
  } else {
    console.log('✅ 모드: 일반 (멱등성 기반 upsert)');
  }
  console.log('');

  // ── 1. 파일 로드 ──────────────────────────────────────────────
  const seedRecords = loadSeedData(seedFilePath);
  const validationReport = loadValidationReport(validationReportPath);

  console.log(`📦 로드된 이벤트: ${seedRecords.length}개`);

  if (validationReport) {
    const { summary } = validationReport;
    console.log(`✅ 검증 요약 (${validationReport.generatedAt.slice(0, 10)}):`);
    console.log(`   - 유효: ${summary.valid}개`);
    console.log(`   - 경고 포함: ${summary.validWithWarnings}개`);
    console.log(`   - 유효하지 않음: ${summary.invalid}개`);
  }

  if (seedRecords.length < 50) {
    console.warn(`\n⚠️  경고: 이벤트 수(${seedRecords.length})가 50개 미만입니다.`);
    console.warn(`   npm run events:validate 를 실행하여 데이터를 보강하세요.`);
  }

  // ── 2. 중복 제거: sourceId 기준으로 배열 내 중복 확인 ─────────
  const seenSourceIds = new Set<string>();
  const deduplicatedRecords: SeedEventRecord[] = [];
  let internalDuplicates = 0;
  let validationErrors = 0;

  for (const record of seedRecords) {
    // 기본 유효성 검사
    const recordErrors = validateRecord(record);
    if (recordErrors.length > 0) {
      console.warn(`⚠️  유효성 오류 (${record.sourceId || '?'} - ${record.name || '?'}): ${recordErrors.join(', ')}`);
      validationErrors++;
      continue;
    }

    if (!record.sourceId) {
      console.warn(`⚠️  sourceId 없는 레코드 건너뜀: ${record.name}`);
      internalDuplicates++;
      continue;
    }
    if (seenSourceIds.has(record.sourceId)) {
      console.warn(`⚠️  중복 sourceId 건너뜀: ${record.sourceId}`);
      internalDuplicates++;
      continue;
    }
    seenSourceIds.add(record.sourceId);
    deduplicatedRecords.push(record);
  }

  if (internalDuplicates > 0 || validationErrors > 0) {
    console.warn(`   파일 내 중복/오류 ${internalDuplicates + validationErrors}개 제거됨\n`);
  }

  // ── 3. RESET 모드: 기존 시드 데이터 삭제 ─────────────────────
  if (RESET_MODE && !DRY_RUN) {
    console.log('\n🗑️  기존 시드 이벤트 초기화 중...');
    const seedSourceIds = deduplicatedRecords.map(r => r.sourceId);
    const deleteResult = await prisma.event.deleteMany({
      where: {
        sourceId: { in: seedSourceIds },
      },
    });
    console.log(`   ${deleteResult.count}개 이벤트 삭제 완료`);
  }

  // ── 4. DB 처리: 삽입/업데이트/건너뜀 ─────────────────────────
  console.log('\n🔄 데이터베이스 처리 중...');
  console.log('──────────────────────────────────────────────────');

  let insertedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  const details: RecordDetail[] = [];

  for (const record of deduplicatedRecords) {
    try {
      // 이벤트 데이터 구성
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

      if (DRY_RUN) {
        // Dry-run: 실제 DB 변경 없이 시뮬레이션
        const existing = await prisma.event.findUnique({
          where: { sourceId: record.sourceId },
          select: {
            id: true,
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

        if (!existing) {
          insertedCount++;
          details.push({ sourceId: record.sourceId, name: record.name, result: 'INSERTED' });
          console.log(`  [DRY] ✚ 삽입 예정: ${record.name}`);
        } else {
          const changedFields = detectChanges(existing as Record<string, unknown>, record);
          if (changedFields.length === 0) {
            skippedCount++;
            details.push({ sourceId: record.sourceId, name: record.name, result: 'SKIPPED' });
          } else {
            updatedCount++;
            details.push({ sourceId: record.sourceId, name: record.name, result: 'UPDATED', changedFields });
            console.log(`  [DRY] ✎ 업데이트 예정: ${record.name} (변경: ${changedFields.join(', ')})`);
          }
        }
        continue;
      }

      // 기존 레코드 확인 (멱등성 검사)
      const existing = await prisma.event.findUnique({
        where: { sourceId: record.sourceId },
        select: {
          id: true,
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

      if (!existing) {
        // 신규 레코드: Prisma upsert로 원자적 삽입 (race condition 방지)
        await prisma.event.upsert({
          where: { sourceId: record.sourceId },
          create: { ...eventData, sourceId: record.sourceId },
          update: eventData,
        });
        insertedCount++;
        details.push({
          sourceId: record.sourceId,
          name: record.name,
          result: 'INSERTED',
        });
        console.log(`  ✚ 삽입: ${record.name} (${record.sourceId})`);
      } else {
        // 기존 레코드: 변경 사항 확인 후 UPDATE 또는 SKIP
        const changedFields = detectChanges(
          existing as Record<string, unknown>,
          record,
        );

        if (changedFields.length === 0) {
          // 변경 없음: SKIP (멱등성 보장)
          skippedCount++;
          details.push({
            sourceId: record.sourceId,
            name: record.name,
            result: 'SKIPPED',
          });
        } else {
          // 변경 있음: Prisma upsert로 원자적 업데이트
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
          console.log(`  ✎ 업데이트: ${record.name} (변경: ${changedFields.join(', ')})`);
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗ 오류 (${record.sourceId}): ${errMsg}`);
      errorCount++;
      details.push({
        sourceId: record.sourceId,
        name: record.name,
        result: 'ERROR',
        error: errMsg,
      });
    }
  }

  // ── 5. 유형별 통계 ────────────────────────────────────────────
  const typeBreakdown = deduplicatedRecords.reduce(
    (acc, e) => {
      if (e.eventType === 'FESTIVAL') acc.FESTIVAL++;
      else if (e.eventType === 'FLEA_MARKET') acc.FLEA_MARKET++;
      else if (e.eventType === 'NIGHT_MARKET') acc.NIGHT_MARKET++;
      return acc;
    },
    { FESTIVAL: 0, FLEA_MARKET: 0, NIGHT_MARKET: 0 },
  );

  // 지역별 통계
  const districtBreakdown: Record<string, number> = {};
  for (const e of deduplicatedRecords) {
    const key = e.district ?? e.city ?? '기타';
    districtBreakdown[key] = (districtBreakdown[key] || 0) + 1;
  }

  // 무료/유료 통계
  const pricingBreakdown = deduplicatedRecords.reduce(
    (acc, e) => {
      if (e.isFree) acc.free++;
      else acc.paid++;
      return acc;
    },
    { free: 0, paid: 0 },
  );

  const durationMs = Date.now() - startTime;

  // ── 6. 결과 보고서 구성 ────────────────────────────────────────
  const mode: SeedReport['mode'] = DRY_RUN ? 'dry-run' : RESET_MODE ? 'reset' : 'normal';
  const seedReport: SeedReport = {
    generatedAt: new Date().toISOString(),
    sourceFile: seedFilePath,
    validationReportFile: validationReportPath,
    validationSummary: validationReport?.summary,
    mode,
    summary: {
      total: deduplicatedRecords.length,
      inserted: insertedCount,
      updated: updatedCount,
      skipped: skippedCount,
      errors: errorCount,
    },
    typeBreakdown,
    districtBreakdown,
    pricingBreakdown,
    details,
    durationMs,
  };

  // ── 7. 콘솔 출력 ──────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════');
  console.log('📊 시딩 완료 요약');
  console.log('══════════════════════════════════════════════════');
  console.log(`  총 처리:     ${deduplicatedRecords.length}개`);
  console.log(`  ✚ 삽입:      ${insertedCount}개`);
  console.log(`  ✎ 업데이트:  ${updatedCount}개`);
  console.log(`  ⏭ 건너뜀:    ${skippedCount}개 (변경 없음)`);
  if (errorCount > 0) {
    console.log(`  ✗ 오류:      ${errorCount}개`);
  }
  console.log('');
  console.log(`📋 유형별:`);
  console.log(`   축제 (FESTIVAL):         ${typeBreakdown.FESTIVAL}개`);
  console.log(`   플리마켓 (FLEA_MARKET):  ${typeBreakdown.FLEA_MARKET}개`);
  console.log(`   야시장 (NIGHT_MARKET):   ${typeBreakdown.NIGHT_MARKET}개`);
  console.log('');
  console.log(`💰 가격별:`);
  console.log(`   무료: ${pricingBreakdown.free}개`);
  console.log(`   유료: ${pricingBreakdown.paid}개`);
  console.log(`\n⏱  소요 시간: ${durationMs}ms`);

  if (DRY_RUN) {
    console.log('\n🔍 DRY-RUN 완료: 실제 DB 변경은 없었습니다.');
  }

  // ── 8. 시딩 보고서 파일 저장 ─────────────────────────────────
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(seedReportPath, JSON.stringify(seedReport, null, 2), 'utf-8');
  console.log(`\n💾 시딩 보고서 저장됨: ${seedReportPath}`);

  // ── 9. 최소 이벤트 수 경고 ─────────────────────────────────────
  const totalInDb = insertedCount + updatedCount + skippedCount;
  if (totalInDb < 50) {
    console.warn(`\n⚠️  경고: DB의 처리된 이벤트(${totalInDb})가 50개 미만입니다.`);
  } else {
    console.log(`\n✅ 최소 이벤트 수 충족: ${totalInDb}개 (기준: 50개)`);
  }

  if (errorCount > 0) {
    console.error(`\n❌ ${errorCount}개의 오류가 발생했습니다. 자세한 내용: ${seedReportPath}`);
    process.exit(1);
  }
}

// ────────────────────────────────────────────────────────────────
// 실행
// ────────────────────────────────────────────────────────────────

main()
  .catch((e) => {
    console.error('시딩 오류:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
