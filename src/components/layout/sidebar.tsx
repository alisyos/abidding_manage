'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  FileText,
  Sliders,
  TrendingUp,
  Settings,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

type SubItem = { href: string; label: string };
type MenuItem = {
  href?: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: SubItem[];
};

const MENU: MenuItem[] = [
  { href: '/', label: '대시보드', icon: LayoutDashboard },
  {
    href: '/companies',
    label: '거래처 관리',
    icon: Building2,
    children: [{ href: '/companies/import', label: '엑셀 가져오기' }],
  },
  {
    href: '/quotes',
    label: '견적서',
    icon: FileText,
    children: [
      { href: '/quotes/bulk-create', label: '일괄 생성' },
      { href: '/quotes/bulk-send', label: '일괄 발송' },
    ],
  },
  { href: '/adjustments', label: '조정 관리', icon: Sliders },
  { href: '/sales', label: '매출 관리', icon: TrendingUp },
  {
    label: '설정',
    icon: Settings,
    children: [
      { href: '/settings/products', label: '단가표' },
      { href: '/settings/sender', label: '발신자 정보' },
      { href: '/settings/email-templates', label: '메일 템플릿' },
    ],
  },
];

interface SidebarProps {
  userEmail?: string;
}

export function Sidebar({ userEmail }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-20 flex h-full w-[230px] flex-col border-r border-gray-200 bg-white shadow-sm">
      {/* 로고 */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-100">
        <Link href="/" className="text-xl font-bold text-gray-900">
          지피티코리아
        </Link>
        <p className="mt-0.5 text-[11px] text-gray-400">에이비딩 관리</p>
      </div>

      {/* 메뉴 */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {MENU.map((item) => (
          <MenuRow key={item.label} item={item} pathname={pathname} />
        ))}
      </nav>

      {/* 사용자 + 로그아웃 */}
      <div className="border-t border-gray-100 px-3 py-3">
        {userEmail && (
          <div className="px-3 pb-2 text-[11px] text-gray-500 truncate" title={userEmail}>
            {userEmail}
          </div>
        )}
        <form action="/logout" method="post">
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
          >
            <LogOut className="h-4 w-4" />
            로그아웃
          </button>
        </form>
      </div>
    </aside>
  );
}

function MenuRow({ item, pathname }: { item: MenuItem; pathname: string }) {
  const Icon = item.icon;
  const isActiveSelf = item.href === pathname;
  const isActiveChild = item.children?.some((c) => pathname.startsWith(c.href));
  const hasChildren = !!item.children?.length;
  const [open, setOpen] = useState<boolean>(!!isActiveChild || !!isActiveSelf);

  // 헤더 행 (링크 OR 토글 버튼)
  const baseRow =
    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors';
  const rowState = isActiveSelf
    ? 'bg-gray-900 text-white'
    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900';

  return (
    <div>
      {item.href ? (
        <Link href={item.href} className={cn(baseRow, rowState)}>
          <Icon className="h-4 w-4 shrink-0" />
          <span className="flex-1">{item.label}</span>
          {hasChildren && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setOpen((v) => !v);
              }}
              className="rounded p-0.5 hover:bg-black/10"
              aria-label="하위 메뉴 토글"
            >
              <ChevronDown
                className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')}
              />
            </button>
          )}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            baseRow,
            'w-full text-left',
            isActiveChild
              ? 'bg-gray-100 text-gray-900'
              : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900',
          )}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="flex-1">{item.label}</span>
          <ChevronDown
            className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')}
          />
        </button>
      )}

      {hasChildren && open && (
        <div className="mt-1 ml-7 space-y-0.5">
          {item.children!.map((c) => {
            const active = pathname === c.href;
            return (
              <Link
                key={c.href}
                href={c.href}
                className={cn(
                  'block rounded-md px-3 py-1.5 text-xs transition-colors',
                  active
                    ? 'bg-gray-100 text-gray-900 font-semibold'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900',
                )}
              >
                {c.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
