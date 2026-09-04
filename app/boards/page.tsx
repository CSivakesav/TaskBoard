'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import styles from './boards.module.css';
import {
  Plus, ArrowLeft, LayoutDashboard, Kanban, Archive, Trash2,
  Loader2, X
} from 'lucide-react';
import type { Board } from '@/lib/types';

export default function BoardsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newBoardName, setNewBoardName] = useState('');
  const [newBoardDesc, setNewBoardDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const user = session?.user as { role: string } | undefined;
  const isAdmin = user?.role === 'ADMIN';

  const fetchBoards = useCallback(async () => {
    try {
      const res = await fetch('/api/boards');
      if (res.ok) setBoards(await res.json());
    } catch (err) {
      console.error('Failed to fetch boards:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBoards(); }, [fetchBoards]);

  async function handleCreateBoard(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch('/api/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardName: newBoardName, description: newBoardDesc }),
      });
      if (res.ok) {
        setShowCreate(false);
        setNewBoardName('');
        setNewBoardDesc('');
        fetchBoards();
      }
    } catch (err) {
      console.error('Failed to create board:', err);
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteBoard(boardId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this board?')) return;
    try {
      await fetch(`/api/boards/${boardId}`, { method: 'DELETE' });
      fetchBoards();
    } catch (err) {
      console.error('Failed to delete board:', err);
    }
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-content"><div className="spinner spinner-lg" /><p>Loading boards...</p></div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <nav className={styles.navbar}>
        <div className={styles.navLeft}>
          <button className={styles.backBtn} onClick={() => router.push('/')}>
            <ArrowLeft size={18} />
          </button>
          <div className={styles.logo}>
            <LayoutDashboard size={22} />
            <span>TaskBoard</span>
          </div>
        </div>
      </nav>

      <main className={styles.main}>
        <div className={styles.header}>
          <div>
            <h1><Kanban size={24} /> All Boards</h1>
            <p>{boards.length} board{boards.length !== 1 ? 's' : ''}</p>
          </div>
          {isAdmin && (
            <button className={styles.createBtn} onClick={() => setShowCreate(true)}>
              <Plus size={18} /> Create Board
            </button>
          )}
        </div>

        <div className={styles.boardsGrid}>
          {boards.map((board, i) => (
            <div
              key={board.BoardID}
              className={styles.boardCard}
              onClick={() => router.push(`/boards/${board.BoardID}`)}
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className={styles.boardGradient} />
              <div className={styles.boardContent}>
                <h3>{board.BoardName}</h3>
                <p>{board.Description || 'No description'}</p>
                <div className={styles.boardMeta}>
                  <span>Created {new Date(board.CreatedAt).toLocaleDateString()}</span>
                  {isAdmin && (
                    <div className={styles.boardActions}>
                      <button
                        className={styles.deleteBtn}
                        onClick={(e) => handleDeleteBoard(board.BoardID, e)}
                        title="Delete board"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {boards.length === 0 && (
            <div className={styles.emptyState}>
              <Archive size={48} />
              <h2>No boards yet</h2>
              <p>{isAdmin ? 'Create your first board to get started' : 'Ask an admin to create a board'}</p>
            </div>
          )}
        </div>
      </main>

      {/* Create Board Modal */}
      {showCreate && (
        <div className={styles.modalOverlay} onClick={() => setShowCreate(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Create New Board</h2>
              <button className={styles.modalClose} onClick={() => setShowCreate(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateBoard} className={styles.modalForm}>
              <div className={styles.formGroup}>
                <label htmlFor="boardName">Board Name</label>
                <input
                  id="boardName" type="text" value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                  placeholder="e.g., Product Development" required
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="boardDesc">Description</label>
                <textarea
                  id="boardDesc" value={newBoardDesc}
                  onChange={(e) => setNewBoardDesc(e.target.value)}
                  placeholder="Describe what this board is for..."
                  rows={3}
                />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowCreate(false)}>
                  Cancel
                </button>
                <button type="submit" className={styles.submitBtn} disabled={creating}>
                  {creating ? <Loader2 size={16} className={styles.spinIcon} /> : <Plus size={16} />}
                  {creating ? 'Creating...' : 'Create Board'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
