import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { createClient } from '@/lib/supabase/server';
import { CompanyForm } from '../../_components/company-form';
import type { CompanyInput } from '@/lib/validation/company';

export const metadata = { title: '거래처 편집 · 에이비딩 관리' };

interface PageProps {
  params: { id: string };
}

export default async function EditCompanyPage({ params }: PageProps) {
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

  const defaults: CompanyInput = {
    no: data.no,
    name: data.name,
    account_type: data.account_type,
    user_database: data.user_database ?? '',
    user_agency_id: data.user_agency_id ?? '',
    url: data.url ?? '',
    memo: data.memo ?? '',
    is_active: data.is_active,
    sub_companies: (data.sub_companies ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((s) => ({
        id: s.id,
        name: s.name,
        database_code: s.database_code ?? '',
        agency_id: s.agency_id ?? '',
        memo: s.memo ?? '',
        contacts: (s.company_contacts ?? [])
          .slice()
          .sort((a, b) => {
            // primary 먼저, 그 후 sort_order
            if (a.role !== b.role) return a.role === 'primary' ? -1 : 1;
            return a.sort_order - b.sort_order;
          })
          .map((c) => ({
            id: c.id,
            role: c.role,
            display_name: c.display_name ?? '',
            email: c.email,
            phone: c.phone ?? '',
            formatted_address: c.formatted_address ?? '',
            sort_order: c.sort_order,
          })),
      })),
  };

  return (
    <div>
      <PageHeader title={`거래처 편집: ${data.name}`} description="변경 후 저장하세요." />
      <div className="p-8 max-w-5xl">
        <CompanyForm mode="edit" companyId={params.id} defaultValues={defaults} />
      </div>
    </div>
  );
}
