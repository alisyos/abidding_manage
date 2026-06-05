// ════════════════════════════════════════════════════════════════════
// 6월 견적 일회성 backfill 스크립트
//   - Existing form.xlsm 의 raw 시트(A-J열)에서 지정 월(기본 2026-06) 행만 추출
//   - 거래처+세부거래처별로 그룹핑 → quotes + quote_items 등록
//   - 중복(동일 company_id, sub_company_id, service_start)은 기존 quote 삭제 후 재생성 (CASCADE)
//   - status='sent', sent_at=now, sender_snapshot=현재 sender_profile
//
// 실행:
//   node --env-file=.env.local scripts/import-june-quotes.mjs --dry
//   node --env-file=.env.local scripts/import-june-quotes.mjs --apply
//
// 옵션:
//   --dry            (기본) 실제 INSERT 없이 미리보기
//   --apply          실제 적용
//   --month=2026-06  (기본) 대상 월
//   --file=Existing\ form.xlsm  (기본) 파일 경로
// ════════════════════════════════════════════════════════════════════

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import path from 'node:path';
import fs from 'node:fs';

// ───────────────────────────────────────────────────────────────
// CLI 인자 파싱
// ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opts = {
  apply: args.includes('--apply'),
  month: '2026-06',
  file: 'Existing form.xlsm',
};
for (const a of args) {
  if (a.startsWith('--month=')) opts.month = a.slice(8);
  else if (a.startsWith('--file=')) opts.file = a.slice(7);
}
const dryRun = !opts.apply;

if (!/^\d{4}-\d{2}$/.test(opts.month)) {
  console.error(`✗ --month 형식 오류: '${opts.month}' (YYYY-MM 필요)`);
  process.exit(1);
}
const [year, mon] = opts.month.split('-').map(Number);
const monthStart = `${year}-${String(mon).padStart(2, '0')}-01`;
const monthEndDate = new Date(year, mon, 0).getDate(); // 해당 월 말일
const monthEnd = `${year}-${String(mon).padStart(2, '0')}-${String(monthEndDate).padStart(2, '0')}`;

console.log(`\n📅 대상 월: ${opts.month}  (${monthStart} ~ ${monthEnd})`);
console.log(`📂 파일: ${opts.file}`);
console.log(`🔧 모드: ${dryRun ? 'DRY-RUN (변경 없음)' : 'APPLY (실제 적용)'}\n`);

// ───────────────────────────────────────────────────────────────
// 환경 변수 검증 — Supabase service-role
// ───────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('✗ .env.local 의 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요');
  console.error('  실행: node --env-file=.env.local scripts/import-june-quotes.mjs ...');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ───────────────────────────────────────────────────────────────
// sheet-utils 인라인 (src/lib/import/sheet-utils.ts 참고)
// ───────────────────────────────────────────────────────────────
function sheetToAOA(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
}
function findHeaderRow(aoa, requiredKeywords) {
  for (let r = 0; r < Math.min(aoa.length, 10); r++) {
    const row = (aoa[r] ?? []).map((c) => (c == null ? '' : String(c).trim()));
    if (requiredKeywords.every((kw) => row.some((cell) => cell === kw))) return r;
  }
  return -1;
}
function mapIndices(headerRow, labels) {
  const map = {};
  for (const label of labels) {
    map[label] = headerRow.findIndex((c) => c != null && String(c).trim() === label);
  }
  return map;
}
function cellStr(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}
function cellInt(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
// Excel serial (1900 시스템) → 'YYYY-MM-DD'.
// Unix epoch (1970-01-01) = Excel serial 25569.
// Excel의 1900 leap year 버그(serial 60 = 가상의 1900-02-29)는 1970 이후 데이터에는 영향 없음.
function excelSerialToISO(serial) {
  const ms = (serial - 25569) * 86400 * 1000;
  const d = new Date(ms);
  // UTC 자정 기준이므로 toISOString의 날짜 부분이 Excel 의도값과 동일
  return d.toISOString().slice(0, 10);
}
function excelDateToISO(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return excelSerialToISO(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string') {
    const m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  return null;
}
function normalizeMedia(v) {
  const s = cellStr(v);
  if (!s) return null;
  const u = s.toUpperCase();
  return u === 'K' || u === 'S' || u === 'M' ? u : null;
}
function normalizeTier(v) {
  const s = cellStr(v);
  if (!s) return null;
  if (s === '유니크' || s.toLowerCase() === 'unique') return 'unique';
  if (s === '프리미엄' || s.toLowerCase() === 'premium') return 'premium';
  if (s === '베이직' || s.toLowerCase() === 'basic') return 'basic';
  if (s === '라이트' || s.toLowerCase() === 'lite') return 'lite';
  return null;
}

// ───────────────────────────────────────────────────────────────
// 금액 계산 — 임계값 기반 할인 (src/lib/quotes/calculator.ts 참고)
// ───────────────────────────────────────────────────────────────
const DISCOUNT_THRESHOLD = 100000;
function computeQuote(items, addonFee, fixedAdjust, variableAdjust) {
  const listSum = items.reduce((a, i) => a + (i.quantity || 0) * (i.list_price || 0), 0);
  const discountApplied = listSum >= DISCOUNT_THRESHOLD;
  const lineTotals = items.map((i) =>
    (i.quantity || 0) * (discountApplied ? (i.unit_price || 0) : (i.list_price || 0)),
  );
  const itemsSum = lineTotals.reduce((a, b) => a + b, 0);
  const baseAmount = itemsSum + (addonFee || 0);
  const adjusted = baseAmount + (fixedAdjust || 0) + (variableAdjust || 0);
  const vatAmount = Math.round(adjusted * 0.1);
  const totalAmount = adjusted + vatAmount;
  return { baseAmount, adjusted, vatAmount, totalAmount, lineTotals, listSum, discountApplied };
}
function round2(n) {
  return Math.round(n * 100) / 100;
}

// ───────────────────────────────────────────────────────────────
// 1) xlsx 파싱 → raw 시트의 (거래처, 세부거래처, 매체, 등급, 수량, 사용시작, 사용종료) 행
// ───────────────────────────────────────────────────────────────
const xlsmPath = path.resolve(process.cwd(), opts.file);
let workbook;
try {
  const buf = fs.readFileSync(xlsmPath);
  // cellDates=false (기본) — serial number로 받아 직접 변환.
  // cellDates=true 는 xlsx 라이브러리가 timezone-naive 날짜를 잘못 UTC 변환해
  // off-by-one 발생함.
  workbook = XLSX.read(buf, { type: 'buffer' });
} catch (e) {
  console.error(`✗ 파일 읽기 실패: ${xlsmPath}\n  ${e.message}`);
  process.exit(1);
}
const sheet = workbook.Sheets['raw'];
if (!sheet) {
  console.error(`✗ 'raw' 시트 없음`);
  process.exit(1);
}

const aoa = sheetToAOA(sheet);
const headerIdx = findHeaderRow(aoa, ['거래처', '세부거래처', '타입(K/S/M)']);
if (headerIdx === -1) {
  console.error(`✗ raw 시트 헤더(거래처/세부거래처/타입(K/S/M)) 미발견`);
  process.exit(1);
}
const idx = mapIndices(aoa[headerIdx], [
  '거래처', '세부거래처', '타입(K/S/M)', '상품(유니크/프리미엄/베이직/라이트)',
  '개수', '사용시작(YYYY-MM-DD)', '사용종료(YYYY-MM-DD)',
]);

const allRows = [];
for (let r = headerIdx + 1; r < aoa.length; r++) {
  const row = aoa[r] ?? [];
  const companyName = cellStr(row[idx['거래처']]);
  const subName = cellStr(row[idx['세부거래처']]);
  if (!companyName || !subName) continue;

  const media = normalizeMedia(row[idx['타입(K/S/M)']]);
  const tier = normalizeTier(row[idx['상품(유니크/프리미엄/베이직/라이트)']]);
  const quantity = cellInt(row[idx['개수']]);
  if (!media || !tier || quantity == null || quantity <= 0) continue;

  const usageStart = excelDateToISO(row[idx['사용시작(YYYY-MM-DD)']]);
  const usageEnd = excelDateToISO(row[idx['사용종료(YYYY-MM-DD)']]);
  if (!usageStart || !usageEnd) continue;

  allRows.push({ companyName, subName, media, tier, quantity, usageStart, usageEnd });
}
console.log(`📥 raw 시트 전체 유효 행: ${allRows.length}건`);

// 6월 필터 (usage_start 가 대상 월 범위)
const monthRows = allRows.filter((r) => r.usageStart >= monthStart && r.usageStart <= monthEnd);
console.log(`📅 ${opts.month} 범위 행: ${monthRows.length}건\n`);

// ───────────────────────────────────────────────────────────────
// 초안 시트의 추가 할인 정보 파싱 (B열=세부거래처 / AQ열=항목 / AR열=금액)
// ───────────────────────────────────────────────────────────────
const draftSheet = workbook.Sheets['초안'];
/** [{ subName, note, amount }] — amount는 양수(음수→양수 변환). 사용 후 mark됨. */
const draftExtras = [];
if (draftSheet) {
  const draftAOA = sheetToAOA(draftSheet);
  for (const row of draftAOA) {
    if (!row) continue;
    const subName = cellStr(row[1]);    // B열 = 세부거래처
    const note = cellStr(row[42]);      // AQ열 = 항목
    const amount = Number(row[43]);     // AR열 = 금액 (음수)
    if (!subName || !note) continue;
    if (!Number.isFinite(amount) || amount === 0) {
      // 금액 0 (정성적 메모만) — 메모는 보존하되 할인액 0
      draftExtras.push({ subName, note, amount: 0, used: false });
      continue;
    }
    if (amount > 0) continue; // 잘못된 데이터
    draftExtras.push({ subName, note, amount: Math.abs(amount), used: false });
  }
}
console.log(`💸 초안 시트 추가할인 후보: ${draftExtras.length}건\n`);

if (monthRows.length === 0) {
  console.log('대상 월에 데이터가 없습니다. 종료.');
  process.exit(0);
}

// ───────────────────────────────────────────────────────────────
// 2) 그룹핑 — (companyName, subName) 단위로 (media, tier, quantity) 누적
// ───────────────────────────────────────────────────────────────
/** key = 'companyName||subName' */
const groups = new Map();
for (const r of monthRows) {
  const key = `${r.companyName}||${r.subName}`;
  if (!groups.has(key)) {
    groups.set(key, {
      companyName: r.companyName,
      subName: r.subName,
      items: [], // (media, tier, quantity)
      serviceStart: r.usageStart,
      serviceEnd: r.usageEnd,
    });
  }
  const g = groups.get(key);
  // 동일 (media, tier) 누적
  const existing = g.items.find((x) => x.media === r.media && x.tier === r.tier);
  if (existing) existing.quantity += r.quantity;
  else g.items.push({ media: r.media, tier: r.tier, quantity: r.quantity });
  // 기간 확장
  if (r.usageStart < g.serviceStart) g.serviceStart = r.usageStart;
  if (r.usageEnd > g.serviceEnd) g.serviceEnd = r.usageEnd;
}
console.log(`🔗 거래처 그룹(견적 단위): ${groups.size}개\n`);

// ───────────────────────────────────────────────────────────────
// 3) 마스터 조회 (companies, sub_companies, products, sender_profile)
// ───────────────────────────────────────────────────────────────
const [{ data: companiesData, error: cErr }, { data: subsData, error: sErr },
  { data: productsData, error: pErr }, { data: senderData }] = await Promise.all([
  supabase.from('companies').select('id, name'),
  supabase.from('sub_companies').select('id, company_id, name'),
  supabase.from('products').select('media, tier, unit_price, list_price'),
  supabase.from('sender_profile').select('*').eq('id', 1).single(),
]);
if (cErr) throw new Error(`companies 조회 실패: ${cErr.message}`);
if (sErr) throw new Error(`sub_companies 조회 실패: ${sErr.message}`);
if (pErr) throw new Error(`products 조회 실패: ${pErr.message}`);

const companyByName = new Map(companiesData.map((c) => [c.name, c]));
const subByKey = new Map(); // 'company_id||sub_name' → sub_company
for (const s of subsData) subByKey.set(`${s.company_id}||${s.name}`, s);
// 'K__unique' → { unit_price, list_price }
const priceMap = new Map();
for (const p of productsData) {
  priceMap.set(`${p.media}__${p.tier}`, {
    unit_price: Number(p.unit_price),
    list_price: Number(p.list_price ?? 0),
  });
}
const sender = senderData ?? {};

console.log(`📚 마스터: companies=${companiesData.length}, sub_companies=${subsData.length}, products=${productsData.length}\n`);

// ───────────────────────────────────────────────────────────────
// 4) 그룹별 처리 (dry-run 또는 apply)
// ───────────────────────────────────────────────────────────────
// 같은 월 시퀀스 누적 (apply 모드)
const monthYM = opts.month.replace('-', ''); // '202606'
const prefix = `Q-${monthYM}-`;

// 시작 시퀀스: 현재 DB에 있는 같은 prefix 최대 + 1
const { count: existingCount } = await supabase
  .from('quotes')
  .select('id', { count: 'exact', head: true })
  .ilike('quote_no', `${prefix}%`);
let seq = (existingCount ?? 0) + 1;

const result = {
  willCreate: [],
  willOverwrite: [],
  skipNoCompany: [],
  skipNoSub: [],
  errors: [],
};

for (const [, g] of groups) {
  const company = companyByName.get(g.companyName);
  if (!company) {
    result.skipNoCompany.push(`${g.companyName} / ${g.subName}`);
    continue;
  }
  const sub = subByKey.get(`${company.id}||${g.subName}`);
  if (!sub) {
    result.skipNoSub.push(`${g.companyName} / ${g.subName} (company OK, sub 미발견)`);
    continue;
  }

  // 단가 적용 — 공시가/할인가 둘 다
  const itemsWithPrice = g.items.map((i) => {
    const p = priceMap.get(`${i.media}__${i.tier}`) ?? { unit_price: 0, list_price: 0 };
    return {
      media: i.media,
      tier: i.tier,
      quantity: i.quantity,
      unit_price: p.unit_price,
      list_price: p.list_price,
    };
  });

  // 추가 할인 매핑 — 초안 시트에서 sub_name 일치 + 사용 안 된 첫 항목
  // (같은 sub_name이 여러 번 등장하면 used flag 로 1:1 greedy 매칭)
  const extraMatch = draftExtras.find((d) => d.subName === g.subName && !d.used);
  let extraAmount = 0;
  let extraNote = null;
  if (extraMatch) {
    extraMatch.used = true;
    extraAmount = extraMatch.amount;
    extraNote = extraMatch.note;
  }

  const calc = computeQuote(
    itemsWithPrice.map((i) => ({
      quantity: i.quantity,
      unit_price: i.unit_price,
      list_price: i.list_price,
    })),
    0, 0, 0,
    0,            // extra_discount_rate = 0 (금액만 사용)
    extraAmount,
  );

  // 중복 검사
  const { data: existing } = await supabase
    .from('quotes')
    .select('id, quote_no')
    .eq('company_id', company.id)
    .eq('sub_company_id', sub.id)
    .eq('service_start', g.serviceStart)
    .limit(1);
  const hasDup = (existing ?? []).length > 0;

  const payload = {
    g, company, sub, itemsWithPrice, calc, hasDup,
    extraAmount, extraNote,
    existingQuoteNo: hasDup ? existing[0].quote_no : null,
    existingId: hasDup ? existing[0].id : null,
  };

  if (hasDup) result.willOverwrite.push(payload);
  else result.willCreate.push(payload);
}

// ───────────────────────────────────────────────────────────────
// 5) 출력
// ───────────────────────────────────────────────────────────────
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  요약`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  ✅ 생성 예정      : ${result.willCreate.length}건`);
console.log(`  ♻️  덮어쓰기 예정  : ${result.willOverwrite.length}건`);
console.log(`  ⚠️  거래처 미존재  : ${result.skipNoCompany.length}건`);
console.log(`  ⚠️  세부거래처 미존재: ${result.skipNoSub.length}건`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (result.skipNoCompany.length > 0) {
  console.log('⚠️ 거래처 미존재 (사전에 /companies/import 필요):');
  for (const s of result.skipNoCompany.slice(0, 20)) console.log(`   - ${s}`);
  if (result.skipNoCompany.length > 20) console.log(`   ... 외 ${result.skipNoCompany.length - 20}건`);
  console.log();
}
if (result.skipNoSub.length > 0) {
  console.log('⚠️ 세부거래처 미존재:');
  for (const s of result.skipNoSub.slice(0, 20)) console.log(`   - ${s}`);
  if (result.skipNoSub.length > 20) console.log(`   ... 외 ${result.skipNoSub.length - 20}건`);
  console.log();
}

if (dryRun) {
  // 추가 할인 매핑 결과 요약
  const extraApplied = [...result.willCreate, ...result.willOverwrite].filter((p) => p.extraAmount > 0);
  const extraUnmatched = draftExtras.filter((d) => !d.used && d.amount > 0);
  console.log(`💸 추가 할인 매칭: ${extraApplied.length}건 적용 / ${extraUnmatched.length}건 매칭 실패`);
  if (extraUnmatched.length > 0) {
    console.log('   매칭 실패 (sub_name이 6월 견적 그룹과 불일치):');
    for (const u of extraUnmatched.slice(0, 10)) {
      console.log(`   - ${u.subName} / ${u.note} / -${u.amount.toLocaleString()}`);
    }
  }
  console.log();

  console.log('💡 미리보기 샘플 (최대 5건):');
  for (const p of [...result.willCreate, ...result.willOverwrite].slice(0, 5)) {
    const tag = p.hasDup ? `♻️ [${p.existingQuoteNo}]` : '✅ [신규]';
    const policy = p.calc.discountApplied
      ? `할인가 적용 (공시 ${p.calc.listSum.toLocaleString()})`
      : `공시가 적용 (공시 ${p.calc.listSum.toLocaleString()} < 100,000)`;
    const extra =
      p.extraAmount > 0 ? ` 💸 -${p.extraAmount.toLocaleString()} (${p.extraNote})` : '';
    console.log(`  ${tag} ${p.g.companyName} / ${p.g.subName}${extra}`);
    console.log(`     기간 ${p.g.serviceStart} ~ ${p.g.serviceEnd}, ${policy}`);
    console.log(`     품목 ${p.itemsWithPrice.length}종, base=${round2(p.calc.baseAmount).toLocaleString()}, total=${round2(p.calc.totalAmount).toLocaleString()}`);
  }
  console.log();
  console.log('실제 적용하려면: --apply 옵션 추가\n');
  process.exit(0);
}

// ───────────────────────────────────────────────────────────────
// 6) APPLY — 실제 INSERT
// ───────────────────────────────────────────────────────────────
console.log('🚀 적용 시작...\n');
const nowIso = new Date().toISOString();
let created = 0, overwritten = 0;

for (const p of [...result.willOverwrite, ...result.willCreate]) {
  try {
    // 덮어쓰기: 기존 quote 삭제 → CASCADE로 quote_items/adjustments/emails/sales_records 함께 제거
    if (p.hasDup) {
      const { error: delErr } = await supabase.from('quotes').delete().eq('id', p.existingId);
      if (delErr) throw new Error(`기존 견적 삭제 실패: ${delErr.message}`);
    }

    const quoteNo = `${prefix}${String(seq).padStart(3, '0')}`;
    seq++;

    const { data: insRow, error: insErr } = await supabase
      .from('quotes')
      .insert({
        quote_no: quoteNo,
        company_id: p.company.id,
        sub_company_id: p.sub.id,
        status: 'sent',
        service_start: p.g.serviceStart,
        service_end: p.g.serviceEnd,
        addon_fee: 0,
        variable_adjust: 0,
        fixed_adjust: 0,
        extra_discount_rate: 0,
        extra_discount_amount: p.extraAmount,
        extra_discount_note: p.extraNote,
        base_amount: round2(p.calc.baseAmount),
        vat_amount: p.calc.vatAmount,
        total_amount: round2(p.calc.totalAmount),
        sender_snapshot: sender,
        bank_account: sender.bank_account ?? null,
        sent_at: nowIso,
      })
      .select('id')
      .single();
    if (insErr || !insRow) throw new Error(`견적 생성 실패: ${insErr?.message ?? 'unknown'}`);

    // 적용된 단가(할인 적용 시 할인가, 미적용 시 공시가)로 line_total 저장
    const itemRows = p.itemsWithPrice.map((i, ix) => ({
      quote_id: insRow.id,
      media: i.media,
      tier: i.tier,
      quantity: i.quantity,
      unit_price: p.calc.discountApplied ? i.unit_price : i.list_price,
      line_total: p.calc.lineTotals[ix] ?? 0,
    }));
    if (itemRows.length > 0) {
      const { error: itErr } = await supabase.from('quote_items').insert(itemRows);
      if (itErr) throw new Error(`품목 INSERT 실패: ${itErr.message}`);
    }

    if (p.hasDup) overwritten++;
    else created++;

    const tag = p.hasDup ? '♻️' : '✅';
    const extraTag = p.extraAmount > 0 ? ` 💸-${p.extraAmount.toLocaleString()}` : '';
    console.log(`  ${tag} ${quoteNo}  ${p.g.companyName} / ${p.g.subName}  total=${round2(p.calc.totalAmount).toLocaleString()}${extraTag}`);
  } catch (e) {
    result.errors.push({ key: `${p.g.companyName} / ${p.g.subName}`, error: e.message });
    console.error(`  ✗ ${p.g.companyName} / ${p.g.subName}: ${e.message}`);
  }
}

console.log();
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  완료`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  ✅ 신규 생성      : ${created}건`);
console.log(`  ♻️  덮어쓰기      : ${overwritten}건`);
console.log(`  ✗  실패          : ${result.errors.length}건`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

if (result.errors.length > 0) {
  console.log('실패 목록:');
  for (const e of result.errors) console.log(`  - ${e.key}: ${e.error}`);
  process.exit(1);
}
process.exit(0);
