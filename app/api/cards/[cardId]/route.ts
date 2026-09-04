import { NextResponse } from 'next/server';
import { requireAuth, isAdmin } from '@/lib/auth-helpers';
import { getCardById, updateCard, deleteCard } from '@/lib/excel/cards';
import { logActivity } from '@/lib/excel/activity';
import { z } from 'zod';

const updateCardSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  assignedTo: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  dueDate: z.string().optional(),
  status: z.enum(['TODO', 'IN PROGRESS', 'REVIEW', 'COMPLETED']).optional(),
  listId: z.string().optional(),
  position: z.number().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cardId: string }> }
) {
  try {
    await requireAuth();
    const { cardId } = await params;
    const card = await getCardById(cardId);

    if (!card) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 });
    }

    return NextResponse.json(card);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch card';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ cardId: string }> }
) {
  try {
    const user = await requireAuth();
    const { cardId } = await params;
    const body = await request.json();
    const parsed = updateCardSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    // Members can only update certain fields
    if (!isAdmin(user)) {
      const adminOnlyFields = ['title', 'assignedTo', 'dueDate'];
      const attemptedAdminFields = adminOnlyFields.filter(
        (f) => parsed.data[f as keyof typeof parsed.data] !== undefined
      );

      if (attemptedAdminFields.length > 0) {
        return NextResponse.json(
          { error: 'Members cannot modify: ' + attemptedAdminFields.join(', ') },
          { status: 403 }
        );
      }
    }

    // Get old card for activity logging
    const oldCard = await getCardById(cardId);
    if (!oldCard) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 });
    }

    await updateCard(cardId, parsed.data);

    // Log significant changes
    if (parsed.data.status && parsed.data.status !== oldCard.Status) {
      await logActivity({
        cardId,
        userId: user.id,
        action: 'Changed status',
        oldValue: oldCard.Status,
        newValue: parsed.data.status,
      });
    }
    if (parsed.data.priority && parsed.data.priority !== oldCard.Priority) {
      await logActivity({
        cardId,
        userId: user.id,
        action: 'Changed priority',
        oldValue: oldCard.Priority,
        newValue: parsed.data.priority,
      });
    }
    if (parsed.data.assignedTo !== undefined && parsed.data.assignedTo !== oldCard.AssignedTo) {
      await logActivity({
        cardId,
        userId: user.id,
        action: 'Changed assignment',
        oldValue: oldCard.AssignedTo,
        newValue: parsed.data.assignedTo,
      });
    }
    if (parsed.data.listId && parsed.data.listId !== oldCard.ListID) {
      await logActivity({
        cardId,
        userId: user.id,
        action: 'Moved card',
        oldValue: oldCard.ListID,
        newValue: parsed.data.listId,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update card';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ cardId: string }> }
) {
  try {
    const user = await requireAuth();
    if (!isAdmin(user)) {
      return NextResponse.json({ error: 'Only admins can delete cards' }, { status: 403 });
    }

    const { cardId } = await params;
    const card = await getCardById(cardId);
    if (!card) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 });
    }

    await deleteCard(cardId);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete card';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
