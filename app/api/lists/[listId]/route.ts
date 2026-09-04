import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-helpers';
import { updateList, deleteList } from '@/lib/excel/lists';
import { z } from 'zod';

const updateListSchema = z.object({
  listName: z.string().min(1).optional(),
  position: z.number().optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    await requireAdmin();
    const { listId } = await params;
    const body = await request.json();
    const parsed = updateListSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.listName !== undefined) updates.ListName = parsed.data.listName;
    if (parsed.data.position !== undefined) updates.Position = parsed.data.position;

    await updateList(listId, updates as Parameters<typeof updateList>[1]);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update list';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    await requireAdmin();
    const { listId } = await params;
    await deleteList(listId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete list';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
