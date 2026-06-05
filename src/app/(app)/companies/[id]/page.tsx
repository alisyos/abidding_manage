import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Pencil, ExternalLink } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { createClient } from '@/lib/supabase/server';
import { ACCOUNT_TYPE_LABEL } from '@/lib/supabase/types';
import { StatusBadge } from '../_components/status-badge';

interface PageProps {
  params: { id: string };
}

export default async function CompanyDetailPage({ params }: PageProps) {
  const supabase = createClient();
  const { data: raw, error } = await supabase
    .from('companies')
    .select(
      `*, sub_companies(id, name, database_code, agency_id, memo,
        company_contacts(id, role, display_name, email, phone, formatted_address, sort_order))`,
    )
    .eq('id', params.id)
    .single();

  if (error || !raw) notFound();

  type SubContact = {
    id: string;
    role: 'primary' | 'cc';
    display_name: string | null;
    email: string;
    phone: string | null;
    formatted_address: string | null;
    sort_order: number;
  };
  type SubRow = {
    id: string;
    name: string;
    database_code: string | null;
    agency_id: string | null;
    memo: string | null;
    company_contacts: SubContact[] | null;
  };
  type CompanyRow = {
    id: string;
    no: number | null;
    name: string;
    account_type: 'advertiser' | 'agency';
    user_database: string | null;
    user_agency_id: string | null;
    url: string | null;
    memo: string | null;
    is_active: boolean;
    sub_companies: SubRow[] | null;
  };
  const data = raw as unknown as CompanyRow;

  const subs = (data.sub_companies ?? [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <PageHeader
        title={data.name}
        description={ACCOUNT_TYPE_LABEL[data.account_type as 'advertiser' | 'agency']}
        actions={
          <Button asChild>
            <Link href={`/companies/${data.id}/edit`}>
              <Pencil className="h-4 w-4 mr-1" /> 편집
            </Link>
          </Button>
        }
      />

      <div className="p-8 max-w-5xl space-y-6">
        {/* 기본 정보 */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">기본 정보</h2>
              <StatusBadge active={data.is_active} />
            </div>
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">
              <InfoRow label="No" value={data.no ?? '-'} />
              <InfoRow label="userDatabase" value={data.user_database || '-'} />
              <InfoRow label="userAgencyId" value={data.user_agency_id || '-'} />
              <InfoRow
                label="URL"
                value={
                  data.url ? (
                    <a
                      href={data.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                    >
                      열기 <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : (
                    '-'
                  )
                }
              />
              {data.memo && (
                <div className="col-span-full">
                  <dt className="text-xs text-gray-500">메모</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-gray-700">{data.memo}</dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        {/* 세부거래처 */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">
            세부거래처 ({subs.length}개)
          </h2>
          {subs.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-gray-400">
                등록된 세부거래처가 없습니다.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {subs.map((sub) => {
                const contacts = (sub.company_contacts ?? [])
                  .slice()
                  .sort((a, b) => {
                    if (a.role !== b.role) return a.role === 'primary' ? -1 : 1;
                    return a.sort_order - b.sort_order;
                  });
                return (
                  <Card key={sub.id}>
                    <CardContent className="p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-900">{sub.name}</h3>
                        <div className="text-xs text-gray-400 space-x-3">
                          {sub.database_code && <span>db: {sub.database_code}</span>}
                          {sub.agency_id && <span>agencyId: {sub.agency_id}</span>}
                        </div>
                      </div>
                      {sub.memo && (
                        <p className="text-xs text-gray-500 whitespace-pre-wrap">{sub.memo}</p>
                      )}

                      {contacts.length === 0 ? (
                        <p className="text-xs text-gray-400 py-3 text-center border-t border-gray-100">
                          연락처가 없습니다.
                        </p>
                      ) : (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-[80px]">역할</TableHead>
                              <TableHead className="w-[140px]">담당자</TableHead>
                              <TableHead>이메일</TableHead>
                              <TableHead className="w-[140px]">연락처</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {contacts.map((c) => (
                              <TableRow key={c.id}>
                                <TableCell>
                                  <span
                                    className={
                                      c.role === 'primary'
                                        ? 'inline-flex rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700'
                                        : 'inline-flex rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600'
                                    }
                                  >
                                    {c.role === 'primary' ? '받는사람' : '참조'}
                                  </span>
                                </TableCell>
                                <TableCell>{c.display_name ?? '-'}</TableCell>
                                <TableCell className="font-mono text-xs">{c.email}</TableCell>
                                <TableCell>{c.phone ?? '-'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-gray-900">{value}</dd>
    </div>
  );
}
