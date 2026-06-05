'use client';

import { useFormContext, useWatch } from 'react-hook-form';
import { Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { generateFormattedAddress } from '@/lib/format/contact';
import type { CompanyInput } from '@/lib/validation/company';

interface Props {
  subIndex: number;
  contactIndex: number;
  onRemove: () => void;
}

export function ContactFields({ subIndex, contactIndex, onRemove }: Props) {
  const form = useFormContext<CompanyInput>();
  const path = `sub_companies.${subIndex}.contacts.${contactIndex}` as const;
  const errors =
    form.formState.errors?.sub_companies?.[subIndex]?.contacts?.[contactIndex];

  // 자동 생성용 watch
  const companyName = useWatch({ control: form.control, name: 'name' });
  const displayName = useWatch({ control: form.control, name: `${path}.display_name` });
  const email = useWatch({ control: form.control, name: `${path}.email` });

  function autoFill() {
    const v = generateFormattedAddress({
      companyName,
      displayName: displayName ?? '',
      email: email ?? '',
    });
    form.setValue(`${path}.formatted_address`, v, { shouldDirty: true });
  }

  return (
    <div className="grid grid-cols-12 gap-2 items-start py-2 border-t border-gray-100 first:border-t-0">
      <div className="col-span-2">
        <Select
          value={form.watch(`${path}.role`)}
          onValueChange={(v) =>
            form.setValue(`${path}.role`, v as 'primary' | 'cc', { shouldDirty: true })
          }
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="primary">받는사람</SelectItem>
            <SelectItem value="cc">참조(CC)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="col-span-2">
        <Input
          placeholder="담당자명"
          {...form.register(`${path}.display_name`)}
        />
      </div>

      <div className="col-span-3">
        <Input type="email" placeholder="email@domain.com" {...form.register(`${path}.email`)} />
        {errors?.email && <p className="mt-0.5 text-[11px] text-red-500">{errors.email.message}</p>}
      </div>

      <div className="col-span-2">
        <Input placeholder="010-0000-0000" {...form.register(`${path}.phone`)} />
      </div>

      <div className="col-span-2">
        <div className="flex gap-1">
          <Input
            placeholder="'[회사]담당' <email>"
            {...form.register(`${path}.formatted_address`)}
            className="text-xs"
          />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={autoFill}
            title="자동생성"
          >
            <Sparkles className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="col-span-1 flex justify-end">
        <Button type="button" size="icon" variant="ghost" onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-gray-400" />
        </Button>
      </div>
    </div>
  );
}
