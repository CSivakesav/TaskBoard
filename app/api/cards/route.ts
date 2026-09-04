import { NextResponse } from 'next/server';
import { requireAuth, requireAdmin, isAdmin } from '@/lib/auth-helpers';
import { getCards, createCard, searchCards, filterCards } from '@/lib/excel/cards';
import { logActivity } from '@/lib/excel/activity';
import type { CardStatus, Priority } from '@/lib/types';
import { z } from 'zod';

const createCardSchema = z.object({
  boardId: z.string().min(1),
  listId: z.string().min(1),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().default(''),
  assignedTo: z.string().optional().default(''),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional().default('MEDIUM'),
  dueDate: z.string().optional().default(''),
});

export async function GET(request: Request) {
  try {
    await requireAuth();
    const { searchParams } = new URL(request.url);
    const boardId = searchParams.get('boardId');
    const query = searchParams.get('q');
    const status = searchParams.get('status') as CardStatus | null;
    const priority = searchParams.get('priority') as Priority | null;
    const assignedTo = searchParams.get('assignedTo');
    const overdue = searchParams.get('overdue') === 'true';

    if (query) {
      const cards = await searchCards(query, boardId || undefined);
      return NextResponse.json(cards);
    }

    if (status || priority || assignedTo || overdue) {
      const cards = await filterCards({
        boardId: boardId || undefined,
        status: status || undefined,
        priority: priority || undefined,
        assignedTo: assignedTo || undefined,
        overdue,
      });
      return NextResponse.json(cards);
    }

    if (!boardId) {
      return NextResponse.json({ error: 'boardId is required' }, { status: 400 });
    }

    const cards = await getCards(boardId);
    return NextResponse.json(cards);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch cards';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    if (!isAdmin(user)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = createCardSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const card = await createCard({
      ...parsed.data,
      createdBy: user.id,
    });

    await logActivity({
      cardId: card.CardID,
      userId: user.id,
      action: 'Created card',
      newValue: card.Title,
    });

    return NextResponse.json(card, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create card';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
