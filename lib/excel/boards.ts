import { nanoid } from 'nanoid';
import type { Board } from '@/lib/types';
import {
  getWorkbook, saveWorkbook, getSheet, readSheetRows,
  appendRow, findRowIndex, updateRow, deleteRow,
  acquireWriteLock, createBackup, invalidateCache,
} from './workbook';

// ─── Read Operations ────────────────────────────────────

export async function getBoards(): Promise<Board[]> {
  const workbook = await getWorkbook();
  const sheet = getSheet(workbook, 'Boards');
  return readSheetRows(sheet).map(normalizeBoard);
}

export async function getActiveBoards(): Promise<Board[]> {
  const boards = await getBoards();
  return boards.filter((b) => !b.Archived);
}

export async function getBoardById(boardId: string): Promise<Board | null> {
  const boards = await getBoards();
  return boards.find((b) => b.BoardID === boardId) || null;
}

// ─── Write Operations ───────────────────────────────────

export async function createBoard(data: {
  boardName: string;
  description: string;
  createdBy: string;
}): Promise<Board> {
  const release = await acquireWriteLock();
  try {
    createBackup();
    const workbook = await getWorkbook();
    invalidateCache();

    const sheet = getSheet(workbook, 'Boards');
    const now = new Date().toISOString();

    const board: Board = {
      BoardID: `BOARD-${nanoid(8)}`,
      BoardName: data.boardName,
      Description: data.description,
      CreatedBy: data.createdBy,
      CreatedAt: now,
      UpdatedAt: now,
      Archived: false,
    };

    appendRow(sheet, board as unknown as Record<string, unknown>);
    await saveWorkbook(workbook);

    return board;
  } finally {
    release();
  }
}

export async function updateBoard(
  boardId: string,
  updates: Partial<Pick<Board, 'BoardName' | 'Description' | 'Archived'>>
): Promise<void> {
  const release = await acquireWriteLock();
  try {
    createBackup();
    const workbook = await getWorkbook();
    invalidateCache();

    const sheet = getSheet(workbook, 'Boards');
    const rowIndex = findRowIndex(sheet, 'BoardID', boardId);
    if (rowIndex === -1) throw new Error('Board not found.');

    updateRow(sheet, rowIndex, {
      ...updates,
      UpdatedAt: new Date().toISOString(),
    } as Record<string, unknown>);
    await saveWorkbook(workbook);
  } finally {
    release();
  }
}

export async function deleteBoard(boardId: string): Promise<void> {
  const release = await acquireWriteLock();
  try {
    createBackup();
    const workbook = await getWorkbook();
    invalidateCache();

    const sheet = getSheet(workbook, 'Boards');
    const rowIndex = findRowIndex(sheet, 'BoardID', boardId);
    if (rowIndex === -1) throw new Error('Board not found.');

    deleteRow(sheet, rowIndex);
    await saveWorkbook(workbook);
  } finally {
    release();
  }
}

// ─── Helpers ────────────────────────────────────────────

function normalizeBoard(row: Record<string, unknown>): Board {
  return {
    BoardID: String(row.BoardID || ''),
    BoardName: String(row.BoardName || ''),
    Description: String(row.Description || ''),
    CreatedBy: String(row.CreatedBy || ''),
    CreatedAt: String(row.CreatedAt || ''),
    UpdatedAt: String(row.UpdatedAt || ''),
    Archived: row.Archived === true || row.Archived === 'true' || row.Archived === 1,
  };
}
