import { NextResponse } from 'next/server';
import { requireAuth, requireAdmin } from '@/lib/auth-helpers';
import { getBoardById, updateBoard, deleteBoard } from '@/lib/excel/boards';
import { z } from 'zod';

const updateBoardSchema = z.object({
  boardName: z.string().min(1).optional(),
  description: z.string().optional(),
  archived: z.boolean().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    await requireAuth();
    const { boardId } = await params;
    const board = await getBoardById(boardId);

    if (!board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 });
    }

    return NextResponse.json(board);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch board';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    await requireAdmin();
    const { boardId } = await params;
    const body = await request.json();
    const parsed = updateBoardSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.boardName !== undefined) updates.BoardName = parsed.data.boardName;
    if (parsed.data.description !== undefined) updates.Description = parsed.data.description;
    if (parsed.data.archived !== undefined) updates.Archived = parsed.data.archived;

    await updateBoard(boardId, updates as Parameters<typeof updateBoard>[1]);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update board';
    const status = message.includes('Admin') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    await requireAdmin();
    const { boardId } = await params;
    await deleteBoard(boardId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete board';
    const status = message.includes('Admin') ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
