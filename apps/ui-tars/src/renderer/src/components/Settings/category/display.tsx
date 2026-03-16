/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useState } from 'react';
import * as z from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useSetting } from '@renderer/hooks/useSetting';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
} from '@renderer/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';

const formSchema = z.object({
  targetDisplayId: z.number().nullable().default(null),
});

interface DisplayInfo {
  id: number;
  label: string;
  physicalSize: { width: number; height: number };
  isPrimary: boolean;
}

export function DisplaySettings({ className }: { className?: string }) {
  const { settings, updateSetting } = useSetting();
  const [displays, setDisplays] = useState<DisplayInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDisplays = async () => {
      try {
        const allDisplays = await window.electron.screen.getAllDisplays();
        setDisplays(allDisplays);
      } catch (e) {
        console.error('Failed to fetch displays:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchDisplays();
  }, []);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      targetDisplayId: null,
    },
  });

  useEffect(() => {
    if (Object.keys(settings).length && displays.length > 0) {
      form.reset({
        targetDisplayId: settings.targetDisplayId ?? null,
      });
    }
  }, [settings, form, displays]);

  const selectedDisplayId = form.watch('targetDisplayId');

  useEffect(() => {
    if (selectedDisplayId !== undefined && selectedDisplayId !== settings.targetDisplayId) {
      updateSetting({
        ...settings,
        targetDisplayId: selectedDisplayId ?? undefined,
      });
    }
  }, [selectedDisplayId, settings, updateSetting]);

  return (
    <Form {...form}>
      <form className={`space-y-6 ${className || ''}`}>
        <div>
          <h3 className="text-lg font-semibold mb-1">Display Settings</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Choose which display to use for automation. Useful for running on a virtual display.
          </p>
        </div>

        <FormField
          control={form.control}
          name="targetDisplayId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Target Display</FormLabel>
              <Select
                disabled={loading}
                onValueChange={(value) => {
                  const numValue = value === 'auto' ? null : Number(value);
                  field.onChange(numValue);
                }}
                value={field.value === null ? 'auto' : String(field.value)}
              >
                <SelectTrigger className="w-full bg-white">
                  <SelectValue placeholder="Select display" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">
                    Auto (Primary Display)
                  </SelectItem>
                  {displays.map((display) => (
                    <SelectItem key={display.id} value={String(display.id)}>
                      {display.label} ({display.physicalSize.width}x{display.physicalSize.height})
                      {display.isPrimary ? ' - Primary' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
