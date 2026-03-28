#!/usr/bin/env tsx
/**
 * FestiMap 통합 시딩 스크립트 — 변환 레이어 호출 버전
 *
 * 파이프라인:
 *   data/raw/curated-events.json (원시 큐레이션 데이터)
 *     └─ normalizeEvents() [scripts/normalize-seed-events.ts 변환 레이어]
 *         └─ Prisma upsert → PostgreSQL / SQLite DB
 *
 * 사용법:
 *   npm run db:seed:pipeline
 *   # 또는
 *   npx tsx scripts/seed-with-transform.ts
 *
 * 특징:
 *   - seed-data.json 파일 없이도 직접 실행 가능
 *   - 변환 레이어(normalizeEvents)를 통해 좌표·날짜·필드 유효성 검증
 *   - sourceId 기준 upsert (중복 방지)
 *   - 50개 이상 서울/수도권 이벤트 검증 포함
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { normalizeEvents, type SeedEventRecord } from './normalize-seed-events';
import type { PublicEventRaw } from '../src/lib/api/public-events';

const prisma = new PrismaClient();

// ────────────────────────────────────────────────────────────────
// 원시 이벤트 파일 인터페이스 (curated-events.json 구조)
// ────────────────────────────────────────────────────────────────

interface CuratedEventFile {
  meta: {
    source: string;
    description: string;
    count: number;
    generatedAt: string;
  };
  events: RawEventFromFile[];
}

interface RawEventFromFile {
  sourceId: string;
  name: string;
  description: string | null;
  eventType: 'FESTIVAL' | 'FLEA_MARKET' | 'NIGHT_MARKET';
  startDate: string;   // "YYYY-MM-DD" 문자열
  endDate: string;     // "YYYY-MM-DD" 문자열
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
  contactInfo?: string | null;
  website?: string | null;
  fetchedAt?: string;
  dataSource?: string;
}

// ────────────────────────────────────────────────────────────────
// 원시 이벤트 로드 및 PublicEventRaw 형식으로 변환
// ────────────────────────────────────────────────────────────────

/**
 * data/raw/curated-events.json에서 이벤트를 로드하고
 * normalizeEvents()가 처리할 수 있는 PublicEventRaw 형식으로 변환합니다.
 *
 * 주요 변환:
 *   - 날짜 문자열 ("YYYY-MM-DD") → Date 객체
 *   - 추가 파일 전용 필드 (fetchedAt, dataSource) 제거
 */
function loadRawEvents(): PublicEventRaw[] {
  const curatedPath = path.resolve(
    __dirname,
    '../data/raw/curated-events.json',
  );

  if (!fs.existsSync(curatedPath)) {
    throw new Error(
      `큐레이션 이벤트 파일을 찾을 수 없습니다: ${curatedPath}\n` +
      `npm run events:collect 를 실행하여 데이터를 생성하세요.`,
    );
  }

  const content = fs.readFileSync(curatedPath, 'utf-8');
  const parsed: CuratedEventFile = JSON.parse(content);

  if (!Array.isArray(parsed.events) || parsed.events.length === 0) {
    throw new Error('curated-events.json에 이벤트 데이터가 없습니다.');
  }

  console.log(`📂 원시 데이터 로드: ${parsed.events.length}개 이벤트 (${parsed.meta.source})`);
  console.log(`   생성일시: ${new Date(parsed.meta.generatedAt).toLocaleString('ko-KR')}`);

  // 날짜 문자열 → Date 객체 변환 (PublicEventRaw 형식에 맞게)
  return parsed.events.map((e): PublicEventRaw => ({
    sourceId: e.sourceId,
    name: e.name,
    description: e.description,
    eventType: e.eventType,
    startDate: new Date(`${e.startDate}T00:00:00.000Z`),
    endDate: new Date(`${e.endDate}T00:00:00.000Z`),
    venue: e.venue,
    address: e.address,
    latitude: e.latitude,
    longitude: e.longitude,
    district: e.district,
    city: e.city,
    imageUrl: e.imageUrl,
    sourceUrl: e.sourceUrl,
    isFree: e.isFree,
    price: e.price,
    organizer: e.organizer,
    contactInfo: e.contactInfo ?? null,
    website: e.website ?? null,
  }));
}

// ────────────────────────────────────────────────────────────────
// DB upsert: SeedEventRecord → Prisma Event
// ────────────────────────────────────────────────────────────────

/**
 * "YYYY-MM-DD" 날짜 문자열을 UTC 자정 Date 객체로 변환합니다.
 */
function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * 정규화된 이벤트 레코드 배열을 DB에 upsert합니다.
 * sourceId를 기준으로 중복을 제거합니다.
 */
async function upsertEvents(records: SeedEventRecord[]): Promise<{
  created: number;
  updated: number;
  errors: number;
}> {
  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const record of records) {
    try {
      const eventData = {
        name: record.name,
        description: record.description,
        eventType: record.eventType,
        startDate: parseDate(record.startDate),
        endDate: parseDate(record.endDate),
        venue: record.venue,
        address: record.address,
        latitude: record.latitude,
        longitude: record.longitude,
        district: record.district,
        city: record.city,
        imageUrl: record.imageUrl,
        sourceUrl: record.sourceUrl ?? null,
        isFree: record.isFree,
        price: record.price,
        organizer: record.organizer,
        contactInfo: record.contactInfo ?? null,
        website: record.website ?? null,
      };

      const existing = await prisma.event.findUnique({
        where: { sourceId: record.sourceId },
      });

      if (existing) {
        await prisma.event.update({
          where: { sourceId: record.sourceId },
          data: eventData,
        });
        updated++;
      } else {
        await prisma.event.create({
          data: { ...eventData, sourceId: record.sourceId },
        });
        created++;
      }
    } catch (err) {
      console.error(`  ❌ upsert 오류 (${record.sourceId}): ${err}`);
      errors++;
    }
  }

  return { created, updated, errors };
}

// ────────────────────────────────────────────────────────────────
// 메인: 변환 레이어 호출 → DB 삽입
// ────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 FestiMap 통합 시딩 시작 (변환 레이어 포함)\n');
  console.log('파이프라인:');
  console.log('  data/raw/curated-events.json');
  console.log('  → normalizeEvents() [변환 레이어]');
  console.log('  → Prisma upsert → DB\n');

  // ── 1단계: 원시 데이터 로드 ──────────────────────────────────
  const rawEvents = loadRawEvents();

  // ── 2단계: 변환 레이어 호출 (normalize-seed-events.ts) ───────
  console.log('\n🔄 변환 레이어 실행 중 (normalizeEvents)...');
  const normalizedEvents = normalizeEvents(rawEvents);

  if (normalizedEvents.length === 0) {
    throw new Error('변환 레이어에서 유효한 이벤트가 없습니다. 데이터를 확인하세요.');
  }

  const skipped = rawEvents.length - normalizedEvents.length;
  console.log(`✅ 변환 완료: ${normalizedEvents.length}개 정규화됨 (${skipped}개 스킵됨)\n`);

  // ── 3단계: 유효성 검증: 50개 이상 수도권 이벤트 ─────────────
  if (normalizedEvents.length < 50) {
    console.warn(`⚠️  경고: 정규화된 이벤트 수(${normalizedEvents.length})가 최소 기준(50개)에 미달합니다.`);
    console.warn(`   데이터를 보강하려면 npm run events:collect 를 실행하세요.\n`);
  }

  // ── 4단계: DB upsert ─────────────────────────────────────────
  console.log('💾 데이터베이스에 저장 중...');
  const stats = await upsertEvents(normalizedEvents);

  // ── 5단계: 결과 출력 ─────────────────────────────────────────
  console.log(`\n✅ 시딩 완료:`);
  console.log(`   - 새로 생성: ${stats.created}개`);
  console.log(`   - 업데이트:  ${stats.updated}개`);
  if (stats.errors > 0) {
    console.error(`   - 오류:      ${stats.errors}개`);
  }
  console.log(`   - 총 처리:   ${normalizedEvents.length}개`);

  // ── 유형별 통계 ───────────────────────────────────────────────
  const byType = normalizedEvents.reduce(
    (acc, e) => {
      acc[e.eventType] = (acc[e.eventType] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  console.log(`\n📊 유형별 통계:`);
  console.log(`   - 축제 (FESTIVAL):        ${byType['FESTIVAL'] || 0}개`);
  console.log(`   - 플리마켓 (FLEA_MARKET): ${byType['FLEA_MARKET'] || 0}개`);
  console.log(`   - 야시장 (NIGHT_MARKET):  ${byType['NIGHT_MARKET'] || 0}개`);

  // ── 도시별 통계 ───────────────────────────────────────────────
  const byCity = normalizedEvents.reduce(
    (acc, e) => {
      const city = e.city || '알 수 없음';
      acc[city] = (acc[city] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  console.log(`\n🗺️  도시별 통계:`);
  for (const [city, count] of Object.entries(byCity).sort((a, b) => b[1] - a[1])) {
    console.log(`   - ${city}: ${count}개`);
  }

  // ── 최소 기준 충족 여부 ───────────────────────────────────────
  const totalInDb = await prisma.event.count();
  console.log(`\n📈 DB 총 이벤트 수: ${totalInDb}개`);

  if (totalInDb >= 50) {
    console.log(`✅ 최소 기준 충족: 50개 이상 수도권 이벤트 DB 적재 완료`);
  } else {
    console.error(`❌ 최소 기준 미충족: DB에 ${totalInDb}개만 존재 (최소 50개 필요)`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error('\n❌ 시딩 실패:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
