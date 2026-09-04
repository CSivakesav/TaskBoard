import { nanoid } from 'nanoid';
import type { Card, CardStatus, Priority, UpdateCardPayload } from '@/lib/types';
import {
  getWorkbook, saveWorkbook, getSheet, readSheetRows,
  appendRow, findRowIndex, updateRow, deleteRow,
  acquireWriteLock, createBackup, invalidateCache,
} from './workbook';

// ─── Read Operations ────────────────────────────────────

export async function getAllCards(): Promise<Card[]> {
  const workbook = await getWorkbook();
  const sheet = getSheet(workbook, 'Cards');
  return readSheetRows(sheet).map(normalizeCard);
}

export async function getCards(boardId: string): Promise<Card[]> {
  const all = await getAllCards();
  return all.filter((c) => c.BoardID === boardId);
}

export async function getCardsByList(listId: string): Promise<Card[]> {
  const all = await getAllCards();
  return all
    .filter((c) => c.ListID === listId)
    .sort((a, b) => a.Position - b.Position);
}

export async function getCardById(cardId: string): Promise<Card | null> {
  const all = await getAllCards();
  return all.find((c) => c.CardID === cardId) || null;
}

export async function searchCards(query: string, boardId?: string): Promise<Card[]> {
  let cards = await getAllCards();
  if (boardId) {
    cards = cards.filter((c) => c.BoardID === boardId);
  }
  const lowerQuery = query.toLowerCase();
  return cards.filter(
    (c) =>
      c.Title.toLowerCase().includes(lowerQuery) ||
      c.Description.toLowerCase().includes(lowerQuery)
  );
}

export async function filterCards(filters: {
  boardId?: string;
  listId?: string;
  status?: CardStatus;
  priority?: Priority;
  assignedTo?: string;
  overdue?: boolean;
}): Promise<Card[]> {
  let cards = await getAllCards();

  if (filters.boardId) cards = cards.filter((c) => c.BoardID === filters.boardId);
  if (filters.listId) cards = cards.filter((c) => c.ListID === filters.listId);
  if (filters.status) cards = cards.filter((c) => c.Status === filters.status);
  if (filters.priority) cards = cards.filter((c) => c.Priority === filters.priority);
  if (filters.assignedTo) cards = cards.filter((c) => c.AssignedTo === filters.assignedTo);
  if (filters.overdue) {
    const now = new Date();
    cards = cards.filter((c) => {
      if (!c.DueDate) return false;
      return new Date(c.DueDate) < now && c.Status !== 'COMPLETED';
    });
  }

  return cards;
}

// ─── Write Operations ───────────────────────────────────

export async function createCard(data: {
  boardId: string;
  listId: string;
  title: string;
  description?: string;
  assignedTo?: string;
  priority?: Priority;
  dueDate?: string;
  createdBy: string;
}): Promise<Card> {
  const release = await acquireWriteLock();
  try {
    createBackup();
    const workbook = await getWorkbook();
    invalidateCache();

    const sheet = getSheet(workbook, 'Cards');

    // Find the highest position in the target list
    const cardsInList = readSheetRows(sheet)
      .map(normalizeCard)
      .filter((c) => c.ListID === data.listId);
    const maxPos = cardsInList.reduce((max, c) => Math.max(max, c.Position), 0);

    const now = new Date().toISOString();
    const card: Card = {
      CardID: `CARD-${nanoid(8)}`,
      BoardID: data.boardId,
      ListID: data.listId,
      Title: data.title,
      Description: data.description || '',
      AssignedTo: data.assignedTo || '',
      Priority: data.priority || 'MEDIUM',
      DueDate: data.dueDate || '',
      Position: maxPos + 1,
      CreatedBy: data.createdBy,
      CreatedAt: now,
      UpdatedAt: now,
      Status: 'TODO',
    };

    appendRow(sheet, card as unknown as Record<string, unknown>);
    await saveWorkbook(workbook);

    return card;
  } finally {
    release();
  }
}

export async function updateCard(
  cardId: string,
  updates: UpdateCardPayload
): Promise<void> {
  const release = await acquireWriteLock();
  try {
    createBackup();
    const workbook = await getWorkbook();
    invalidateCache();

    const sheet = getSheet(workbook, 'Cards');
    const rowIndex = findRowIndex(sheet, 'CardID', cardId);
    if (rowIndex === -1) throw new Error('Card not found.');

    const updateData: Record<string, unknown> = {
      ...updates,
      UpdatedAt: new Date().toISOString(),
    };

    // Map frontend field names to Excel column names
    if (updates.listId !== undefined) {
      updateData.ListID = updates.listId;
      delete updateData.listId;
    }
    if (updates.position !== undefined) {
      updateData.Position = updates.position;
      delete updateData.position;
    }
    if (updates.title !== undefined) {
      updateData.Title = updates.title;
      delete updateData.title;
    }
    if (updates.description !== undefined) {
      updateData.Description = updates.description;
      delete updateData.description;
    }
    if (updates.assignedTo !== undefined) {
      updateData.AssignedTo = updates.assignedTo;
      delete updateData.assignedTo;
    }
    if (updates.priority !== undefined) {
      updateData.Priority = updates.priority;
      delete updateData.priority;
    }
    if (updates.dueDate !== undefined) {
      updateData.DueDate = updates.dueDate;
      delete updateData.dueDate;
    }
    if (updates.status !== undefined) {
      updateData.Status = updates.status;
      delete updateData.status;
    }

    updateRow(sheet, rowIndex, updateData);
    await saveWorkbook(workbook);
  } finally {
    release();
  }
}

export async function moveCard(
  cardId: string,
  destinationListId: string,
  newPosition: number
): Promise<void> {
  const release = await acquireWriteLock();
  try {
    createBackup();
    const workbook = await getWorkbook();
    invalidateCache();

    const sheet = getSheet(workbook, 'Cards');
    const rowIndex = findRowIndex(sheet, 'CardID', cardId);
    if (rowIndex === -1) throw new Error('Card not found.');

    const allCards = readSheetRows(sheet).map(normalizeCard);
    const movingCard = allCards.find((c) => c.CardID === cardId);
    if (!movingCard) throw new Error('Card not found.');

    const sourceListId = movingCard.ListID;

    // Get other cards in destination list, sorted by position
    const destCards = allCards
      .filter((c) => c.ListID === destinationListId && c.CardID !== cardId)
      .sort((a, b) => a.Position - b.Position);

    // Insert movingCard into destCards at index (newPosition - 1)
    const targetIndex = Math.max(0, Math.min(newPosition - 1, destCards.length));
    destCards.splice(targetIndex, 0, {
      ...movingCard,
      ListID: destinationListId,
    });

    // Update positions and ListID for all cards in destination list
    destCards.forEach((card, idx) => {
      const cardRowIndex = findRowIndex(sheet, 'CardID', card.CardID);
      if (cardRowIndex !== -1) {
        updateRow(sheet, cardRowIndex, {
          ListID: destinationListId,
          Position: idx + 1,
          ...(card.CardID === cardId ? { UpdatedAt: new Date().toISOString() } : {}),
        });
      }
    });

    // If moved between lists, also re-index source list
    if (sourceListId !== destinationListId) {
      const srcCards = allCards
        .filter((c) => c.ListID === sourceListId && c.CardID !== cardId)
        .sort((a, b) => a.Position - b.Position);

      srcCards.forEach((card, idx) => {
        const cardRowIndex = findRowIndex(sheet, 'CardID', card.CardID);
        if (cardRowIndex !== -1) {
          updateRow(sheet, cardRowIndex, { Position: idx + 1 });
        }
      });
    }

    await saveWorkbook(workbook);
  } finally {
    release();
  }
}

export async function deleteCard(cardId: string): Promise<void> {
  const release = await acquireWriteLock();
  try {
    createBackup();
    const workbook = await getWorkbook();
    invalidateCache();

    const sheet = getSheet(workbook, 'Cards');
    const rowIndex = findRowIndex(sheet, 'CardID', cardId);
    if (rowIndex === -1) throw new Error('Card not found.');

    deleteRow(sheet, rowIndex);
    await saveWorkbook(workbook);
  } finally {
    release();
  }
}

// ─── Helpers ────────────────────────────────────────────

function normalizeCard(row: Record<string, unknown>): Card {
  return {
    CardID: String(row.CardID || ''),
    BoardID: String(row.BoardID || ''),
    ListID: String(row.ListID || ''),
    Title: String(row.Title || ''),
    Description: String(row.Description || ''),
    AssignedTo: String(row.AssignedTo || ''),
    Priority: (String(row.Priority || 'MEDIUM') as Priority),
    DueDate: String(row.DueDate || ''),
    Position: Number(row.Position) || 0,
    CreatedBy: String(row.CreatedBy || ''),
    CreatedAt: String(row.CreatedAt || ''),
    UpdatedAt: String(row.UpdatedAt || ''),
    Status: (String(row.Status || 'TODO') as CardStatus),
  };
}
