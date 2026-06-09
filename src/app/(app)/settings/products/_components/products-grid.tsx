'use client';

import { useState, useTransition } from 'react';
import { toast } from 'react-toastify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MEDIA_LABEL, TIER_LABEL, type Media, type Tier, type Product } from '@/lib/supabase/types';
import { updateProduct } from '../actions';

const MEDIA_ORDER: Media[] = ['K', 'S', 'M'];
const TIER_ORDER: Tier[] = ['unique', 'premium', 'basic', 'lite'];

interface ProductsGridProps {
  initialRows: Product[];
}

interface DraftPatch {
  unit_price: number;
  list_price: number;
  monitoring_period: string;
}

export function ProductsGrid({ initialRows }: ProductsGridProps) {
  // (media,tier) → row 매핑
  const byKey = new Map<string, Product>();
  for (const r of initialRows) byKey.set(`${r.media}__${r.tier}`, r);

  const [drafts, setDrafts] = useState<Record<string, DraftPatch>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function setDraft(id: string, patch: Partial<DraftPatch>, base: Product) {
    setDrafts((prev) => ({
      ...prev,
      [id]: {
        unit_price: patch.unit_price ?? prev[id]?.unit_price ?? base.unit_price,
        list_price: patch.list_price ?? prev[id]?.list_price ?? base.list_price,
        monitoring_period:
          patch.monitoring_period ?? prev[id]?.monitoring_period ?? (base.monitoring_period ?? ''),
      },
    }));
  }

  function isDirty(id: string, base: Product) {
    const d = drafts[id];
    if (!d) return false;
    return (
      Number(d.unit_price) !== Number(base.unit_price) ||
      Number(d.list_price) !== Number(base.list_price) ||
      (d.monitoring_period ?? '') !== (base.monitoring_period ?? '')
    );
  }

  function handleSave(row: Product) {
    const d = drafts[row.id];
    if (!d) return;
    setSavingId(row.id);
    startTransition(async () => {
      const res = await updateProduct(row.id, {
        unit_price: Number(d.unit_price),
        list_price: Number(d.list_price),
        monitoring_period: d.monitoring_period?.trim() ? d.monitoring_period.trim() : null,
      });
      setSavingId(null);
      if (res.ok) {
        toast.success(`${MEDIA_LABEL[row.media]} / ${TIER_LABEL[row.tier]} 단가 저장됨`);
        // 저장 후 draft 제거 → 새로고침된 SSR 값 반영
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[row.id];
          return next;
        });
      } else {
        toast.error(`저장 실패: ${res.error}`);
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        ※ 공시 단가는 견적 산정의 기준이며, 할인가 합계가 100,000원 이상이면 할인가가 자동 적용됩니다.
      </p>
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">매체</TableHead>
              <TableHead className="w-[100px]">등급</TableHead>
              <TableHead>공시 단가 (원)</TableHead>
              <TableHead>할인가 (원)</TableHead>
              <TableHead>모니터링 주기</TableHead>
              <TableHead className="w-[100px] text-right">저장</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {MEDIA_ORDER.map((media) =>
              TIER_ORDER.map((tier, tierIdx) => {
                const row = byKey.get(`${media}__${tier}`);
                if (!row) return null;
                const d = drafts[row.id];
                const dirty = isDirty(row.id, row);
                return (
                  <TableRow key={row.id}>
                    {tierIdx === 0 ? (
                      <TableCell rowSpan={4} className="align-top font-semibold bg-gray-50">
                        {MEDIA_LABEL[media]}
                      </TableCell>
                    ) : null}
                    <TableCell>{TIER_LABEL[tier]}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step={100}
                        value={d?.list_price ?? row.list_price}
                        onChange={(e) =>
                          setDraft(row.id, { list_price: Number(e.target.value) }, row)
                        }
                        className="w-32"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step={100}
                        value={d?.unit_price ?? row.unit_price}
                        onChange={(e) =>
                          setDraft(row.id, { unit_price: Number(e.target.value) }, row)
                        }
                        className="w-32"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={d?.monitoring_period ?? row.monitoring_period ?? ''}
                        onChange={(e) =>
                          setDraft(row.id, { monitoring_period: e.target.value }, row)
                        }
                        placeholder="예: 3~5 분"
                        className="w-40"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        onClick={() => handleSave(row)}
                        disabled={!dirty || (isPending && savingId === row.id)}
                      >
                        {savingId === row.id ? '저장중' : '저장'}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              }),
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
