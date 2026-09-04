import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { moveCard } from '@/lib/excel/cards';
import { logActivity } from '@/lib/excel/activity';
import { z } from 'zod';

const moveCardSchema = z.object({
  cardId: z.string().min(1),
  sourceListId: z.string().min(1),
  destinationListId: z.string().min(1),
  newPosition: z.number().min(0),
});

export async function PUT(request: Request) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const parsed = moveCardSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    await moveCard(
      parsed.data.cardId,
      parsed.data.destinationListId,
      parsed.data.newPosition
    );

    if (parsed.data.sourceListId !== parsed.data.destinationListId) {
      await logActivity({
        cardId: parsed.data.cardId,
        userId: user.id,
        action: 'Moved card',
        oldValue: parsed.data.sourceListId,
        newValue: parsed.data.destinationListId,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to move card';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
