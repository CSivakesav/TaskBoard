import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import type { User, Role } from '@/lib/types';
import {
  getWorkbook, saveWorkbook, getSheet, readSheetRows,
  appendRow, findRowIndex, updateRow, deleteRow,
  acquireWriteLock, createBackup, invalidateCache,
} from './workbook';

const SALT_ROUNDS = 12;

// ─── Read Operations ────────────────────────────────────

export async function getUsers(): Promise<User[]> {
  const workbook = await getWorkbook();
  const sheet = getSheet(workbook, 'Users');
  return readSheetRows(sheet).map(normalizeUser);
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const users = await getUsers();
  return users.find((u) => u.Email.toLowerCase() === email.toLowerCase()) || null;
}

export async function getUserById(userId: string): Promise<User | null> {
  const users = await getUsers();
  return users.find((u) => u.UserID === userId) || null;
}

export async function getActiveUsers(): Promise<Omit<User, 'PasswordHash'>[]> {
  const users = await getUsers();
  return users
    .filter((u) => u.Active)
    .map(({ PasswordHash: _, ...rest }) => rest);
}

// ─── Authentication ─────────────────────────────────────

export async function authenticateUser(
  email: string,
  password: string
): Promise<Omit<User, 'PasswordHash'> | null> {
  const user = await getUserByEmail(email);
  if (!user || !user.Active) return null;

  const valid = await bcrypt.compare(password, user.PasswordHash);
  if (!valid) return null;

  const { PasswordHash: _, ...safeUser } = user;
  return safeUser;
}

// ─── Write Operations ───────────────────────────────────

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  role: Role;
}): Promise<Omit<User, 'PasswordHash'>> {
  const release = await acquireWriteLock();
  try {
    // Check for duplicate email
    const existing = await getUserByEmail(data.email);
    if (existing) {
      throw new Error('A user with this email already exists.');
    }

    createBackup();
    const workbook = await getWorkbook();
    invalidateCache();

    const sheet = getSheet(workbook, 'Users');
    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

    const user: User = {
      UserID: `USER-${nanoid(8)}`,
      Name: data.name,
      Email: data.email.toLowerCase(),
      PasswordHash: passwordHash,
      Role: data.role,
      Active: true,
      CreatedAt: new Date().toISOString(),
    };

    appendRow(sheet, user as unknown as Record<string, unknown>);
    await saveWorkbook(workbook);

    const { PasswordHash: _, ...safeUser } = user;
    return safeUser;
  } finally {
    release();
  }
}

export async function updateUser(
  userId: string,
  updates: Partial<Pick<User, 'Name' | 'Role' | 'Active'>>
): Promise<void> {
  const release = await acquireWriteLock();
  try {
    createBackup();
    const workbook = await getWorkbook();
    invalidateCache();

    const sheet = getSheet(workbook, 'Users');
    const rowIndex = findRowIndex(sheet, 'UserID', userId);
    if (rowIndex === -1) throw new Error('User not found.');

    updateRow(sheet, rowIndex, updates as Record<string, unknown>);
    await saveWorkbook(workbook);
  } finally {
    release();
  }
}

export async function deleteUser(userId: string): Promise<void> {
  const release = await acquireWriteLock();
  try {
    createBackup();
    const workbook = await getWorkbook();
    invalidateCache();

    const sheet = getSheet(workbook, 'Users');
    const rowIndex = findRowIndex(sheet, 'UserID', userId);
    if (rowIndex === -1) throw new Error('User not found.');

    deleteRow(sheet, rowIndex);
    await saveWorkbook(workbook);
  } finally {
    release();
  }
}

// ─── Helpers ────────────────────────────────────────────

function normalizeUser(row: Record<string, unknown>): User {
  return {
    UserID: String(row.UserID || ''),
    Name: String(row.Name || ''),
    Email: String(row.Email || ''),
    PasswordHash: String(row.PasswordHash || ''),
    Role: (String(row.Role || 'MEMBER') as Role),
    Active: row.Active === true || row.Active === 'true' || row.Active === 1,
    CreatedAt: String(row.CreatedAt || ''),
  };
}
