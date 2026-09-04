import { nanoid } from 'nanoid';
import type { Activity } from '@/lib/types';
import {
  getWorkbook, saveWorkbook, getSheet, readSheetRows,
  appendRow, acquireWriteLock, createBackup, invalidateCache,
} from './workbook';

// ─── Read Operations ────────────────────────────────────

export async function getActivities(cardId: string): Promise<Activity[]> {
  const workbook = await getWorkbook();
  const sheet = getSheet(workbook, 'ActivityLog');
  return readSheetRows(sheet)
    .map(normalizeActivity)
    .filter((a) => a.CardID === cardId)
    .sort((a, b) => new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime());
}

export async function getRecentActivities(limit: number = 20): Promise<Activity[]> {
  const workbook = await getWorkbook();
  const sheet = getSheet(workbook, 'ActivityLog');
  return readSheetRows(sheet)
    .map(normalizeActivity)
    .sort((a, b) => new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime())
    .slice(0, limit);
}

// ─── Write Operations ───────────────────────────────────

export async function logActivity(data: {
  cardId: string;
  userId: string;
  action: string;
  oldValue?: string;
  newValue?: string;
}): Promise<Activity> {
  const release = await acquireWriteLock();
  try {
    createBackup();
    const workbook = await getWorkbook();
    invalidateCache();

    const sheet = getSheet(workbook, 'ActivityLog');

    const activity: Activity = {
      ActivityID: `ACT-${nanoid(8)}`,
      CardID: data.cardId,
      UserID: data.userId,
      Action: data.action,
      OldValue: data.oldValue || '',
      NewValue: data.newValue || '',
      Timestamp: new Date().toISOString(),
    };

    appendRow(sheet, activity as unknown as Record<string, unknown>);
    await saveWorkbook(workbook);

    return activity;
  } finally {
    release();
  }
}

// ─── Helpers ────────────────────────────────────────────

function normalizeActivity(row: Record<string, unknown>): Activity {
  return {
    ActivityID: String(row.ActivityID || ''),
    CardID: String(row.CardID || ''),
    UserID: String(row.UserID || ''),
    Action: String(row.Action || ''),
    OldValue: String(row.OldValue || ''),
    NewValue: String(row.NewValue || ''),
    Timestamp: String(row.Timestamp || ''),
  };
}
