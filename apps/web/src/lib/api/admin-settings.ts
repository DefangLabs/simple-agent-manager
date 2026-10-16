import { request } from './client';

export type SettingValue = boolean | number | string | string[] | null;
export interface AdminSetting {
  name: string;
  type: 'boolean' | 'integer' | 'string' | 'string-list' | 'enum';
  defaultValue: SettingValue;
  value: SettingValue;
  category: 'OAuth' | 'Connector' | 'Operations' | 'Trials';
  description: string;
  secret: boolean;
  risky: boolean;
  range?: { min: number; max: number };
  choices?: string[];
  configured: boolean;
  source: 'database' | 'environment' | 'kv' | 'default';
  updatedAt: string | null;
  updatedBy: string | null;
}
export interface AdminSettingsView {
  revision: number;
  settings: AdminSetting[];
  history: {
    name: string;
    action: 'set' | 'reset';
    actorUserId: string;
    createdAt: string;
    revision: number;
  }[];
}
export function fetchAdminSettings() {
  return request<AdminSettingsView>('/api/admin/settings');
}
export function patchAdminSettings(
  expectedRevision: number,
  changes: { name: string; value: SettingValue }[]
) {
  return request<AdminSettingsView>('/api/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify({ expectedRevision, changes }),
  });
}
