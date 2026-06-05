'use client';

import { useFormContext, useFieldArray } from 'react-hook-form';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { ContactFields } from './contact-fields';
import type { CompanyInput } from '@/lib/validation/company';

interface Props {
  subIndex: number;
  onRemove: () => void;
}

export function SubCompanyFields({ subIndex, onRemove }: Props) {
  const form = useFormContext<CompanyInput>();
  const path = `sub_companies.${subIndex}` as const;
  const errors = form.formState.errors?.sub_companies?.[subIndex];

  const contactArr = useFieldArray({
    control: form.control,
    name: `${path}.contacts`,
  });

  function addContact(role: 'primary' | 'cc') {
    contactArr.append({
      role,
      display_name: '',
      email: '',
      phone: '',
      formatted_address: '',
      sort_order: contactArr.fields.length,
    });
  }

  return (
    <Card className="border-gray-200">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            세부거래처 #{subIndex + 1}
          </h3>
          <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
            <Trash2 className="h-4 w-4 mr-1" /> 삭제
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">세부거래처명 *</Label>
            <Input {...form.register(`${path}.name`)} placeholder="예: NHNAD" />
            {errors?.name && (
              <p className="mt-0.5 text-[11px] text-red-500">{errors.name.message}</p>
            )}
          </div>
          <div>
            <Label className="text-xs">database</Label>
            <Input {...form.register(`${path}.database_code`)} placeholder="예: nhnad" />
          </div>
          <div>
            <Label className="text-xs">agencyId</Label>
            <Input {...form.register(`${path}.agency_id`)} placeholder="예: nhnad" />
          </div>
          <div>
            <Label className="text-xs">메모</Label>
            <Input {...form.register(`${path}.memo`)} />
          </div>
        </div>

        <div className="pt-3 border-t border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs font-semibold text-gray-700">연락처</Label>
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="outline" onClick={() => addContact('primary')}>
                <Plus className="h-3 w-3 mr-1" /> 받는사람
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => addContact('cc')}>
                <Plus className="h-3 w-3 mr-1" /> 참조
              </Button>
            </div>
          </div>

          {contactArr.fields.length === 0 ? (
            <p className="text-xs text-gray-400 py-3 text-center">연락처가 없습니다.</p>
          ) : (
            <div>
              <div className="grid grid-cols-12 gap-2 text-[11px] text-gray-500 font-medium pb-1">
                <div className="col-span-2">역할</div>
                <div className="col-span-2">담당자명</div>
                <div className="col-span-3">이메일</div>
                <div className="col-span-2">연락처</div>
                <div className="col-span-2">표시양식</div>
                <div className="col-span-1" />
              </div>
              {contactArr.fields.map((field, j) => (
                <ContactFields
                  key={field.id}
                  subIndex={subIndex}
                  contactIndex={j}
                  onRemove={() => contactArr.remove(j)}
                />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
