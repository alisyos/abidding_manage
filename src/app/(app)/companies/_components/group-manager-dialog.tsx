'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import { Pencil, Trash2, Plus, Check, X } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createGroup, renameGroup, deleteGroup } from '../group-actions';

export interface GroupOption {
  id: string;
  name: string;
  member_count: number;
}

export function GroupManagerDialog({ groups }: { groups: GroupOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      const res = await createGroup(name);
      if (res.ok) {
        toast.success(`'${name}' 그룹 생성`);
        setNewName('');
        router.refresh();
      } else {
        toast.error(res.error ?? '생성 실패');
      }
    });
  }

  function handleRename(id: string) {
    const name = editName.trim();
    if (!name) return;
    startTransition(async () => {
      const res = await renameGroup(id, name);
      if (res.ok) {
        toast.success('그룹명 수정');
        setEditingId(null);
        router.refresh();
      } else {
        toast.error(res.error ?? '수정 실패');
      }
    });
  }

  function handleDelete(id: string, name: string, count: number) {
    if (
      !confirm(
        `'${name}' 그룹을 삭제하시겠습니까?${count > 0 ? `\n소속 거래처 ${count}곳의 그룹 연결이 함께 해제됩니다(거래처 자체는 보존).` : ''}`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteGroup(id);
      if (res.ok) {
        toast.success(`'${name}' 그룹 삭제`);
        router.refresh();
      } else {
        toast.error(res.error ?? '삭제 실패');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">그룹 관리</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>거래처 그룹 관리</DialogTitle>
          <DialogDescription>
            거래처를 묶어 그룹을 만듭니다. 그룹에 거래처를 담는 작업은 거래처 목록에서 행을 선택해
            ‘그룹에 담기’로 처리합니다.
          </DialogDescription>
        </DialogHeader>

        {/* 신규 생성 */}
        <div className="flex items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCreate();
              }
            }}
            placeholder="새 그룹명 (예: 월말 발송 업체)"
          />
          <Button onClick={handleCreate} disabled={isPending || !newName.trim()}>
            <Plus className="h-4 w-4 mr-1" /> 추가
          </Button>
        </div>

        {/* 그룹 목록 */}
        <div className="max-h-[320px] overflow-y-auto rounded-md border border-gray-200 divide-y divide-gray-100">
          {groups.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">아직 그룹이 없습니다.</p>
          ) : (
            groups.map((g) => (
              <div key={g.id} className="flex items-center gap-2 px-3 py-2">
                {editingId === g.id ? (
                  <>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleRename(g.id);
                        } else if (e.key === 'Escape') {
                          setEditingId(null);
                        }
                      }}
                      autoFocus
                      className="h-8"
                    />
                    <button
                      type="button"
                      onClick={() => handleRename(g.id)}
                      disabled={isPending}
                      className="text-gray-400 hover:text-green-600"
                      title="저장"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-gray-400 hover:text-gray-900"
                      title="취소"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm font-medium text-gray-900">{g.name}</span>
                    <span className="text-xs text-gray-500 tabular-nums">{g.member_count}곳</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(g.id);
                        setEditName(g.name);
                      }}
                      className="text-gray-400 hover:text-gray-900"
                      title="이름 수정"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(g.id, g.name, g.member_count)}
                      disabled={isPending}
                      className="text-gray-400 hover:text-red-600"
                      title="삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
