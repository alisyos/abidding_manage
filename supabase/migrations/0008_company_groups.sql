-- ════════════════════════════════════════════════════════════════════
-- 0008 거래처 그룹 (수동 멤버십)
--   - company_groups: 그룹 마스터 (이름 unique)
--   - company_group_members: 거래처-그룹 N:M junction
-- 일괄 견적 생성 시 그룹으로 후보 견적을 좁히는 데 사용.
-- ════════════════════════════════════════════════════════════════════

create table if not exists company_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists company_group_members (
  group_id   uuid not null references company_groups(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, company_id)
);

create index if not exists idx_cgm_company on company_group_members (company_id);
create index if not exists idx_cgm_group   on company_group_members (group_id);

-- RLS: 기존 테이블과 동일하게 인증 사용자 전체 허용 (Phase 1 정책)
alter table company_groups        enable row level security;
alter table company_group_members enable row level security;

do $$
declare
  tbl text;
  tables text[] := array['company_groups', 'company_group_members'];
begin
  foreach tbl in array tables loop
    execute format('drop policy if exists "auth_all" on %I;', tbl);
    execute format(
      'create policy "auth_all" on %I for all to authenticated using (true) with check (true);', tbl
    );
  end loop;
end $$;
