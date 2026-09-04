import { nanoid } from 'nanoid';
import type { DailyUpdate } from '@/lib/types';
import {
  getWorkbook, saveWorkbook, getSheet, readSheetRows,
  appendRow, findRowIndex, updateRow,
  acquireWriteLock, createBackup, invalidateCache,
} from './workbook';

// ─── Read Operations ────────────────────────────────────

export async function getDailyUpdates(cardId: string): Promise<DailyUpdate[]> {
  const workbook = await getWorkbook();
  const sheet = getSheet(workbook, 'DailyUpdates');
  return readSheetRows(sheet)
    .map(normalizeUpdate)
    .filter((u) => u.CardID === cardId)
    .sort((a, b) => new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime());
}

export async function getAllDailyUpdates(): Promise<DailyUpdate[]> {
  const workbook = await getWorkbook();
  const sheet = getSheet(workbook, 'DailyUpdates');
  return readSheetRows(sheet)
    .map(normalizeUpdate)
    .sort((a, b) => new Date(b.CreatedAt).getTime() - new Date(a.CreatedAt).getTime());
}

export async function getRecentUpdates(limit: number = 10): Promise<DailyUpdate[]> {
  const all = await getAllDailyUpdates();
  return all.slice(0, limit);
}

export async function getTodaysUpdatesCount(): Promise<number> {
  const all = await getAllDailyUpdates();
  const today = new Date().toISOString().slice(0, 10);
  return all.filter((u) => u.Date === today || u.CreatedAt.startsWith(today)).length;
}

// ─── Write Operations ───────────────────────────────────

export async function createDailyUpdate(data: {
  cardId: string;
  userId: string;
  updateText: string;
  status?: string;
  progress?: number;
}): Promise<DailyUpdate> {
  const release = await acquireWriteLock();
  try {
    createBackup();
    const workbook = await getWorkbook();
    invalidateCache();

    const sheet = getSheet(workbook, 'DailyUpdates');
    const now = new Date().toISOString();

    const update: DailyUpdate = {
      UpdateID: `UPD-${nanoid(8)}`,
      CardID: data.cardId,
      UserID: data.userId,
      Date: now.slice(0, 10),
      UpdateText: data.updateText,
      Status: data.status || '',
      Progress: data.progress ?? 0,
      CreatedAt: now,
      UpdatedAt: now,
    };

    appendRow(sheet, update as unknown as Record<string, unknown>);

    // Also update the card's UpdatedAt
    const cardsSheet = getSheet(workbook, 'Cards');
    const cardRowIndex = findRowIndex(cardsSheet, 'CardID', data.cardId);
    if (cardRowIndex !== -1) {
      updateRow(cardsSheet, cardRowIndex, { UpdatedAt: now });
    }

    await saveWorkbook(workbook);
    return update;
  } finally {
    release();
  }
}

export async function updateDailyUpdate(
  updateId: string,
  userId: string,
  updates: { updateText?: string; status?: string; progress?: number }
): Promise<void> {
  const release = await acquireWriteLock();
  try {
    createBackup();
    const workbook = await getWorkbook();
    invalidateCache();

    const sheet = getSheet(workbook, 'DailyUpdates');
    const rowIndex = findRowIndex(sheet, 'UpdateID', updateId);
    if (rowIndex === -1) throw new Error('Update not found.');

    // Verify ownership
    const allUpdates = readSheetRows(sheet).map(normalizeUpdate);
    const existingUpdate = allUpdates.find((u) => u.UpdateID === updateId);
    if (!existingUpdate || existingUpdate.UserID !== userId) {
      throw new Error('You can only edit your own daily updates.');
    }

    const updateData: Record<string, unknown> = {
      UpdatedAt: new Date().toISOString(),
    };
    if (updates.updateText !== undefined) updateData.UpdateText = updates.updateText;
    if (updates.status !== undefined) updateData.Status = updates.status;
    if (updates.progress !== undefined) updateData.Progress = updates.progress;

    updateRow(sheet, rowIndex, updateData);
    await saveWorkbook(workbook);
  } finally {
    release();
  }
}

// ─── Helpers ────────────────────────────────────────────

function normalizeUpdate(row: Record<string, unknown>): DailyUpdate {
  return {
    UpdateID: String(row.UpdateID || ''),
    CardID: String(row.CardID || ''),
    UserID: String(row.UserID || ''),
    Date: String(row.Date || ''),
    UpdateText: String(row.UpdateText || ''),
    Status: String(row.Status || ''),
    Progress: Number(row.Progress) || 0,
    CreatedAt: String(row.CreatedAt || ''),
    UpdatedAt: String(row.UpdatedAt || ''),
  };
}
