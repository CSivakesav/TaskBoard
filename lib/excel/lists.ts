import { nanoid } from 'nanoid';
import type { List } from '@/lib/types';
import {
  getWorkbook, saveWorkbook, getSheet, readSheetRows,
  appendRow, findRowIndex, updateRow, deleteRow,
  acquireWriteLock, createBackup, invalidateCache,
} from './workbook';

// ─── Read Operations ────────────────────────────────────

export async function getLists(boardId: string): Promise<List[]> {
  const workbook = await getWorkbook();
  const sheet = getSheet(workbook, 'Lists');
  return readSheetRows(sheet)
    .map(normalizeList)
    .filter((l) => l.BoardID === boardId)
    .sort((a, b) => a.Position - b.Position);
}

export async function getListById(listId: string): Promise<List | null> {
  const workbook = await getWorkbook();
  const sheet = getSheet(workbook, 'Lists');
  const lists = readSheetRows(sheet).map(normalizeList);
  return lists.find((l) => l.ListID === listId) || null;
}

export async function getAllLists(): Promise<List[]> {
  const workbook = await getWorkbook();
  const sheet = getSheet(workbook, 'Lists');
  return readSheetRows(sheet).map(normalizeList);
}

// ─── Write Operations ───────────────────────────────────

export async function createList(data: {
  boardId: string;
  listName: string;
}): Promise<List> {
  const release = await acquireWriteLock();
  try {
    createBackup();
    const workbook = await getWorkbook();
    invalidateCache();

    const sheet = getSheet(workbook, 'Lists');

    // Find the highest position for this board
    const existingLists = readSheetRows(sheet)
      .map(normalizeList)
      .filter((l) => l.BoardID === data.boardId);
    const maxPos = existingLists.reduce((max, l) => Math.max(max, l.Position), 0);

    const list: List = {
      ListID: `LIST-${nanoid(8)}`,
      BoardID: data.boardId,
      ListName: data.listName,
      Position: maxPos + 1,
      CreatedAt: new Date().toISOString(),
    };

    appendRow(sheet, list as unknown as Record<string, unknown>);
    await saveWorkbook(workbook);

    return list;
  } finally {
    release();
  }
}

export async function updateList(
  listId: string,
  updates: Partial<Pick<List, 'ListName' | 'Position'>>
): Promise<void> {
  const release = await acquireWriteLock();
  try {
    createBackup();
    const workbook = await getWorkbook();
    invalidateCache();

    const sheet = getSheet(workbook, 'Lists');
    const rowIndex = findRowIndex(sheet, 'ListID', listId);
    if (rowIndex === -1) throw new Error('List not found.');

    updateRow(sheet, rowIndex, updates as Record<string, unknown>);
    await saveWorkbook(workbook);
  } finally {
    release();
  }
}

export async function reorderLists(
  boardId: string,
  orderedListIds: string[]
): Promise<void> {
  const release = await acquireWriteLock();
  try {
    createBackup();
    const workbook = await getWorkbook();
    invalidateCache();

    const sheet = getSheet(workbook, 'Lists');

    orderedListIds.forEach((listId, index) => {
      const rowIndex = findRowIndex(sheet, 'ListID', listId);
      if (rowIndex !== -1) {
        updateRow(sheet, rowIndex, { Position: index + 1 });
      }
    });

    await saveWorkbook(workbook);
  } finally {
    release();
  }
}

export async function deleteList(listId: string): Promise<void> {
  const release = await acquireWriteLock();
  try {
    createBackup();
    const workbook = await getWorkbook();
    invalidateCache();

    const sheet = getSheet(workbook, 'Lists');
    const rowIndex = findRowIndex(sheet, 'ListID', listId);
    if (rowIndex === -1) throw new Error('List not found.');

    deleteRow(sheet, rowIndex);
    await saveWorkbook(workbook);
  } finally {
    release();
  }
}

// ─── Helpers ────────────────────────────────────────────

function normalizeList(row: Record<string, unknown>): List {
  return {
    ListID: String(row.ListID || ''),
    BoardID: String(row.BoardID || ''),
    ListName: String(row.ListName || ''),
    Position: Number(row.Position) || 0,
    CreatedAt: String(row.CreatedAt || ''),
  };
}
