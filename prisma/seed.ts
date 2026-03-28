/**
 * FestiMap 데이터베이스 시드 스크립트
 *
 * 사용법:
 *   npm run db:seed
 *   # 또는
 *   npx prisma db seed
 *
 * 데이터 소스:
 *   prisma/seed-data.json — 정규화된 서울/수도권 행사 데이터 (53개+)
 *
 * 데이터 업데이트:
 *   - 큐레이션 편집: prisma/seed-data.json 직접 수정
 *   - 공공 API 연동: npm run events:fetch (한국관광공사 + 서울 열린데이터광장)
 *   - 전체 재생성:  npm run events:normalize (seed-data.json 재생성 후 db:seed)
 *
 * 스키마 필드 매핑 (seed-data.json → Prisma Event 모델):
 *   sourceId   → sourceId   (고유 식별자, 중복 제거 기준 / upsert key)
 *   name       → name       (행사명)
 *   description→ description(설명)
 *   eventType  → eventType  (FESTIVAL | FLEA_MARKET | NIGHT_MARKET)
 *   startDate  → startDate  (시작일, "YYYY-MM-DD" → DateTime)
 *   endDate    → endDate    (종료일, "YYYY-MM-DD" → DateTime)
 *   venue      → venue      (장소명)
 *   address    → address    (주소)
 *   latitude   → latitude   (위도, Float)
 *   longitude  → longitude  (경도, Float)
 *   district   → district   (자치구, nullable)
 *   city       → city       (시/도)
 *   imageUrl   → imageUrl   (이미지 URL, nullable)
 *   sourceUrl  → sourceUrl  (출처 URL, nullable)
 *   isFree     → isFree     (무료 여부)
 *   price      → price      (가격 정보, nullable)
 *   organizer  → organizer  (주최 기관, nullable)
 */

import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ────────────────────────────────────────────────────────────────
// 타입 정의
// ────────────────────────────────────────────────────────────────

interface SeedEventRecord {
  sourceId: string;
  name: string;
  description: string | null;
  eventType: string;
  startDate: string;  // "YYYY-MM-DD"
  endDate: string;    // "YYYY-MM-DD"
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
  /** Contact phone number or email for the event (nullable) */
  contactInfo?: string | null;
  /** Official event website URL (nullable) */
  website?: string | null;
}

// ────────────────────────────────────────────────────────────────
// 날짜 변환: "YYYY-MM-DD" → Date (UTC 자정)
// ────────────────────────────────────────────────────────────────

function parseDate(dateStr: string): Date {
  // "YYYY-MM-DD" 형식을 UTC 자정 Date 객체로 변환
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

// ────────────────────────────────────────────────────────────────
// 시드 데이터 로드
// ────────────────────────────────────────────────────────────────

function loadSeedData(): SeedEventRecord[] {
  const seedFilePath = path.resolve(__dirname, 'seed-data.json');

  if (!fs.existsSync(seedFilePath)) {
    throw new Error(
      `seed-data.json 파일을 찾을 수 없습니다: ${seedFilePath}\n` +
      `다음 명령으로 생성하세요: npm run events:normalize`,
    );
  }

  const content = fs.readFileSync(seedFilePath, 'utf-8');
  const records = JSON.parse(content) as SeedEventRecord[];

  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('seed-data.json이 비어 있거나 올바르지 않은 형식입니다.');
  }

  return records;
}

// ────────────────────────────────────────────────────────────────
// 메인 시딩 함수
// ────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 FestiMap 데이터베이스 시딩 시작...');
  console.log('   데이터 소스: prisma/seed-data.json\n');

  // 1. seed-data.json 로드
  const seedRecords = loadSeedData();
  console.log(`📂 로드된 행사: ${seedRecords.length}개`);

  if (seedRecords.length < 50) {
    console.warn(`⚠️  경고: 행사 수(${seedRecords.length})가 50개 미만입니다.`);
    console.warn(`   npm run events:normalize 를 실행하여 데이터를 보강하세요.`);
  }

  // 2. 날짜 문자열 → Date 변환 후 DB 삽입
  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const record of seedRecords) {
    try {
      // "YYYY-MM-DD" 문자열을 UTC Date 객체로 변환
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
        // Supplementary contact & web details
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
      console.error(`  ❌ 오류 (${record.sourceId}): ${err}`);
      errors++;
    }
  }

  // 3. 결과 출력
  console.log(`\n✅ 시딩 완료:`);
  console.log(`   - 새로 생성: ${created}개`);
  console.log(`   - 업데이트:  ${updated}개`);
  if (errors > 0) {
    console.log(`   - 오류:     ${errors}개`);
  }
  console.log(`   - 총 처리:   ${seedRecords.length}개`);

  // 4. 유형별 통계
  const byType = seedRecords.reduce(
    (acc, e) => {
      acc[e.eventType] = (acc[e.eventType] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  console.log(`\n📊 유형별:`);
  console.log(`   - 축제 (FESTIVAL):        ${byType['FESTIVAL'] || 0}개`);
  console.log(`   - 플리마켓 (FLEA_MARKET): ${byType['FLEA_MARKET'] || 0}개`);
  console.log(`   - 야시장 (NIGHT_MARKET):  ${byType['NIGHT_MARKET'] || 0}개`);

  console.log(`\n💡 공공 API 데이터 포함 방법:`);
  console.log(`   npm run events:fetch  (DB 직접 업데이트)`);
  console.log(`   npm run events:normalize (seed-data.json 재생성 후 db:seed)`);
}

main()
  .catch((e) => {
    console.error('시딩 오류:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
