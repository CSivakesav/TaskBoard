import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import { put, list } from '@vercel/blob';

// ─── Configuration ──────────────────────────────────────

const isBlobEnabled = (): boolean => !!process.env.BLOB_READ_WRITE_TOKEN;

// On Vercel, the root filesystem is read-only. Use /tmp if local filesystem is used
const DATA_DIR = process.env.VERCEL === '1'
  ? path.join('/tmp', 'data')
  : path.join(process.cwd(), 'data');

const WORKBOOK_PATH = path.join(DATA_DIR, 'task-management.xlsx');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const BLOB_FILENAME = 'task-management.xlsx';

// ─── Write Mutex (simple async lock) ────────────────────

let writeLock: Promise<void> = Promise.resolve();

export function acquireWriteLock(): Promise<() => void> {
  let release: () => void;
  const newLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previousLock = writeLock;
  writeLock = newLock;
  return previousLock.then(() => release!);
}

// ─── In-memory cache ────────────────────────────────────

let cachedWorkbook: ExcelJS.Workbook | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5000; // 5 seconds

export function invalidateCache(): void {
  cachedWorkbook = null;
  cacheTimestamp = 0;
}

// ─── Sheet Definitions ──────────────────────────────────

const SHEET_DEFINITIONS: Record<string, string[]> = {
  Users: ['UserID', 'Name', 'Email', 'PasswordHash', 'Role', 'Active', 'CreatedAt'],
  Boards: ['BoardID', 'BoardName', 'Description', 'CreatedBy', 'CreatedAt', 'UpdatedAt', 'Archived'],
  Lists: ['ListID', 'BoardID', 'ListName', 'Position', 'CreatedAt'],
  Cards: [
    'CardID', 'BoardID', 'ListID', 'Title', 'Description', 'AssignedTo',
    'Priority', 'DueDate', 'Position', 'CreatedBy', 'CreatedAt', 'UpdatedAt', 'Status',
  ],
  DailyUpdates: [
    'UpdateID', 'CardID', 'UserID', 'Date', 'UpdateText', 'Status',
    'Progress', 'CreatedAt', 'UpdatedAt',
  ],
  ActivityLog: [
    'ActivityID', 'CardID', 'UserID', 'Action', 'OldValue', 'NewValue', 'Timestamp',
  ],
};

// ─── File Helpers ───────────────────────────────────────

export function getWorkbookPath(): string {
  return WORKBOOK_PATH;
}

export function workbookExists(): boolean {
  if (isBlobEnabled()) return true; // Checked asynchronously via getWorkbook
  return fs.existsSync(WORKBOOK_PATH);
}

function ensureDirectories(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // If on Vercel (/tmp/data) and /tmp workbook does not exist yet, copy bundled workbook
  const bundledPath = path.join(process.cwd(), 'data', 'task-management.xlsx');
  if (DATA_DIR !== path.join(process.cwd(), 'data') && !fs.existsSync(WORKBOOK_PATH) && fs.existsSync(bundledPath)) {
    try {
      fs.copyFileSync(bundledPath, WORKBOOK_PATH);
    } catch {
      // ignore
    }
  }
}

// ─── Backup ─────────────────────────────────────────────

export function createBackup(): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  if (isBlobEnabled()) {
    if (cachedWorkbook) {
      cachedWorkbook.xlsx.writeBuffer().then((buffer) => {
        put(`backups/task-management_${timestamp}.xlsx`, Buffer.from(buffer), {
          access: 'public',
          addRandomSuffix: false,
        }).catch(() => {});
      }).catch(() => {});
    }
    return;
  }

  if (!fs.existsSync(WORKBOOK_PATH)) return;
  ensureDirectories();

  const backupPath = path.join(BACKUP_DIR, `task-management_${timestamp}.xlsx`);

  try {
    fs.copyFileSync(WORKBOOK_PATH, backupPath);
  } catch (err) {
    console.error('Backup failed:', err);
  }

  // Keep only the last 20 backups
  try {
    const backups = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('task-management_') && f.endsWith('.xlsx'))
      .sort()
      .reverse();

    for (let i = 20; i < backups.length; i++) {
      fs.unlinkSync(path.join(BACKUP_DIR, backups[i]));
    }
  } catch {
    // Ignore cleanup errors
  }
}

// ─── Read Workbook ──────────────────────────────────────

export async function getWorkbook(): Promise<ExcelJS.Workbook> {
  const now = Date.now();
  if (cachedWorkbook && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedWorkbook;
  }

  const workbook = new ExcelJS.Workbook();

  if (isBlobEnabled()) {
    try {
      const { blobs } = await list({ prefix: BLOB_FILENAME });
      const targetBlob = blobs.find((b) => b.pathname === BLOB_FILENAME);
      if (targetBlob) {
        const response = await fetch(targetBlob.url, { cache: 'no-store' });
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          await workbook.xlsx.load(arrayBuffer as unknown as ExcelJS.Buffer);
          cachedWorkbook = workbook;
          cacheTimestamp = now;
          return workbook;
        }
      }
    } catch (err) {
      console.warn('Failed to load from Vercel Blob, falling back to local file:', err);
    }
  }

  ensureDirectories();

  if (!fs.existsSync(WORKBOOK_PATH)) {
    throw new Error('Workbook not found. Please run setup first.');
  }

  await workbook.xlsx.readFile(WORKBOOK_PATH);

  cachedWorkbook = workbook;
  cacheTimestamp = now;

  return workbook;
}

// ─── Save Workbook (Atomic Write) ───────────────────────

export async function saveWorkbook(workbook: ExcelJS.Workbook): Promise<void> {
  if (isBlobEnabled()) {
    try {
      const buffer = await workbook.xlsx.writeBuffer();
      await put(BLOB_FILENAME, buffer as unknown as ArrayBuffer, {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      cachedWorkbook = workbook;
      cacheTimestamp = Date.now();
      return;
    } catch (err) {
      console.warn('Failed to save to Vercel Blob, falling back to local file:', err);
    }
  }

  ensureDirectories();

  // Atomic write: write to temp file first, then rename
  const tmpPath = WORKBOOK_PATH + '.tmp';

  try {
    await workbook.xlsx.writeFile(tmpPath);

    // Replace original with temp
    if (fs.existsSync(WORKBOOK_PATH)) {
      fs.unlinkSync(WORKBOOK_PATH);
    }
    fs.renameSync(tmpPath, WORKBOOK_PATH);

    // Invalidate cache so next read gets fresh data
    invalidateCache();
  } catch (err) {
    // Clean up temp file on failure
    if (fs.existsSync(tmpPath)) {
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    }
    throw err;
  }
}

// ─── Initialize Workbook ────────────────────────────────

export async function initializeWorkbook(): Promise<void> {
  if (isBlobEnabled()) {
    try {
      const { blobs } = await list({ prefix: BLOB_FILENAME });
      if (blobs.some((b) => b.pathname === BLOB_FILENAME)) {
        return; // Already exists in blob
      }
    } catch { /* proceed */ }
  } else {
    ensureDirectories();
    if (fs.existsSync(WORKBOOK_PATH)) {
      return; // Already exists
    }
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TaskBoard';
  workbook.created = new Date();

  for (const [sheetName, columns] of Object.entries(SHEET_DEFINITIONS)) {
    const sheet = workbook.addWorksheet(sheetName);
    sheet.columns = columns.map((col) => ({
      header: col,
      key: col,
      width: col.length < 12 ? 15 : col.length + 5,
    }));

    // Style the header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 24;
  }

  // Seed default admin accounts
  const usersSheet = workbook.getWorksheet('Users');
  if (usersSheet) {
    const bcrypt = (await import('bcryptjs')).default;
    const { nanoid } = await import('nanoid');
    const hash = await bcrypt.hash('admin@hod', 12);
    const now = new Date().toISOString();

    usersSheet.addRow([
      `USER-${nanoid(8)}`,
      'HOD CSC',
      'hod.csc@eec.srmrmp.edu.in',
      hash,
      'ADMIN',
      true,
      now,
    ]);

    usersSheet.addRow([
      `USER-${nanoid(8)}`,
      'Admin ACS',
      'adminacs@gmail.com',
      hash,
      'ADMIN',
      true,
      now,
    ]);
  }

  await saveWorkbook(workbook);
}

// ─── Generic Sheet Helpers ──────────────────────────────

export function getSheet(workbook: ExcelJS.Workbook, sheetName: string): ExcelJS.Worksheet {
  const sheet = workbook.getWorksheet(sheetName);
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found in workbook.`);
  }
  return sheet;
}

/**
 * Read all rows from a sheet as objects.
 * Row 1 is treated as headers.
 */
export function readSheetRows(sheet: ExcelJS.Worksheet): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  const headers: string[] = [];

  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value || '');
  });

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header

    const obj: Record<string, unknown> = {};
    headers.forEach((header, colNumber) => {
      if (!header) return;
      const cell = row.getCell(colNumber);
      let value = cell.value;

      // Handle ExcelJS rich text / formula values
      if (value && typeof value === 'object' && 'result' in value) {
        value = value.result;
      }
      if (value && typeof value === 'object' && 'richText' in value) {
        value = (value as ExcelJS.CellRichTextValue).richText
          .map((rt) => rt.text)
          .join('');
      }

      obj[header] = value ?? '';
    });

    rows.push(obj);
  });

  return rows;
}

/**
 * Append a row to a sheet.
 */
export function appendRow(sheet: ExcelJS.Worksheet, data: Record<string, unknown>): void {
  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value || '');
  });

  const rowValues: (unknown)[] = [];
  headers.forEach((header, colNumber) => {
    if (!header) return;
    let value = data[header] ?? '';
    // Prevent Excel formula injection
    if (typeof value === 'string' && /^[=+\-@]/.test(value)) {
      value = "'" + value;
    }
    rowValues[colNumber] = value;
  });

  sheet.addRow(rowValues);
}

/**
 * Find the row number of a record by matching a key column to a value.
 * Returns the 1-indexed row number, or -1 if not found.
 */
export function findRowIndex(
  sheet: ExcelJS.Worksheet,
  keyColumn: string,
  value: string
): number {
  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value || '');
  });

  const keyColIndex = headers.indexOf(keyColumn);
  if (keyColIndex === -1) return -1;

  let foundRow = -1;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    if (foundRow !== -1) return;

    const cellValue = String(row.getCell(keyColIndex).value || '');
    if (cellValue === value) {
      foundRow = rowNumber;
    }
  });

  return foundRow;
}

/**
 * Update a specific row's columns.
 */
export function updateRow(
  sheet: ExcelJS.Worksheet,
  rowNumber: number,
  updates: Record<string, unknown>
): void {
  const headers: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.value || '');
  });

  const row = sheet.getRow(rowNumber);
  for (const [key, value] of Object.entries(updates)) {
    const colIndex = headers.indexOf(key);
    if (colIndex !== -1) {
      let safeValue = value;
      if (typeof safeValue === 'string' && /^[=+\-@]/.test(safeValue)) {
        safeValue = "'" + safeValue;
      }
      row.getCell(colIndex).value = safeValue as ExcelJS.CellValue;
    }
  }
  row.commit();
}

/**
 * Delete a row by row number.
 */
export function deleteRow(sheet: ExcelJS.Worksheet, rowNumber: number): void {
  // ExcelJS doesn't have a direct deleteRow, so we splice
  sheet.spliceRows(rowNumber, 1);
}

// ─── Check if workbook has any users (for setup detection) ───

export async function hasUsers(): Promise<boolean> {
  try {
    const workbook = await getWorkbook();
    const sheet = getSheet(workbook, 'Users');
    return sheet.rowCount > 1; // More than just the header row
  } catch {
    return false;
  }
}
