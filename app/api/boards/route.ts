import { NextResponse } from 'next/server';
import { requireAuth, requireAdmin } from '@/lib/auth-helpers';
import { getActiveBoards, createBoard } from '@/lib/excel/boards';
import { z } from 'zod';

const createBoardSchema = z.object({
  boardName: z.string().min(1, 'Board name is required'),
  description: z.string().optional().default(''),
});

export async function GET() {
  try {
    await requireAuth();
    const boards = await getActiveBoards();
    return NextResponse.json(boards);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch boards';
    const status = message.includes('Authentication') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdmin();
    const body = await request.json();
    const parsed = createBoardSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const board = await createBoard({
      boardName: parsed.data.boardName,
      description: parsed.data.description,
      createdBy: user.id,
    });

    return NextResponse.json(board, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create board';
    const status = message.includes('Admin') ? 403 : message.includes('Authentication') ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
