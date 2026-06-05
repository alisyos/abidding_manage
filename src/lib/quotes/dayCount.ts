import type { Tier } from '@/lib/supabase/types';

/**
 * 조정(사용량 변동)의 일할 계산.
 *
 * 공식: Σ delta_tier × unit_price_tier × max(0, (잔여일 / 전체일))
 *   - 전체일 = serviceEnd - serviceStart + 1
 *   - 잔여일 = serviceEnd - adjustmentDate + 1  (음수는 0으로 clamp)
 *
 * 결과 금액은 음수일 수도 있고 (수량 감소), 양수일 수도 있음 (수량 증가).
 * 반올림: 원 단위 정수.
 */
export interface ProRatedDeltaInput {
  deltas: Record<Tier, number>;
  unitPrices: Record<Tier, number>;
  serviceStart: string; // 'YYYY-MM-DD'
  serviceEnd: string;
  adjustmentDate: string;
}

export interface ProRatedDeltaResult {
  preAdjustAmount: number;
  remainingDays: number;
  totalDays: number;
  ratio: number;
  /** 등급별 (delta × unit_price × ratio) 결과. UI 미리보기용 */
  lineDeltas: Record<Tier, number>;
}

export function calcProRatedDelta(input: ProRatedDeltaInput): ProRatedDeltaResult {
  const totalDays = daysBetween(input.serviceStart, input.serviceEnd) + 1;
  const remainingDaysRaw = daysBetween(input.adjustmentDate, input.serviceEnd) + 1;
  const remainingDays = Math.max(0, remainingDaysRaw);
  const ratio = totalDays > 0 ? remainingDays / totalDays : 0;

  const tiers: Tier[] = ['unique', 'premium', 'basic', 'lite'];
  const lineDeltas = {} as Record<Tier, number>;
  let total = 0;
  for (const tier of tiers) {
    const qty = input.deltas[tier] ?? 0;
    const price = input.unitPrices[tier] ?? 0;
    const line = qty * price * ratio;
    lineDeltas[tier] = Math.round(line);
    total += lineDeltas[tier];
  }

  return {
    preAdjustAmount: total,
    remainingDays,
    totalDays,
    ratio,
    lineDeltas,
  };
}

/**
 * 두 'YYYY-MM-DD' 날짜 사이의 일수 (b - a). UTC 기반으로 계산하여
 * timezone/DST 영향 제거.
 */
function daysBetween(aIso: string, bIso: string): number {
  const a = parseDateUtc(aIso);
  const b = parseDateUtc(bIso);
  if (!a || !b) return 0;
  return Math.round((b - a) / 86400000);
}

function parseDateUtc(iso: string): number | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
