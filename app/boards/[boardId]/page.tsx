'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  DragDropContext, Droppable, Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import styles from './kanban.module.css';
import {
  ArrowLeft, Plus, LayoutDashboard, Search, Filter, X, Loader2,
  Calendar, Flag, User, MessageSquare, Clock, Trash2, Edit3,
  ChevronDown, AlertCircle, CheckCircle2, MoreHorizontal, GripVertical,
  Activity, Send
} from 'lucide-react';
import type { Board, List, Card, DailyUpdate, Activity as ActivityType } from '@/lib/types';

export default function KanbanBoardPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const boardId = params.boardId as string;

  const user = session?.user as { id: string; name: string; email: string; role: string } | undefined;
  const isAdmin = user?.role === 'ADMIN';

  const [board, setBoard] = useState<Board | null>(null);
  const [lists, setLists] = useState<List[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [isDraggingAny, setIsDraggingAny] = useState(false);

  // List creation
  const [showAddList, setShowAddList] = useState(false);
  const [newListName, setNewListName] = useState('');

  // Card creation
  const [addingCardToList, setAddingCardToList] = useState<string | null>(null);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [newCardAssignee, setNewCardAssignee] = useState('');

  // Card detail modal
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [cardUpdates, setCardUpdates] = useState<DailyUpdate[]>([]);
  const [cardActivities, setCardActivities] = useState<ActivityType[]>([]);
  const [newUpdate, setNewUpdate] = useState('');
  const [newProgress, setNewProgress] = useState(0);
  const [savingUpdate, setSavingUpdate] = useState(false);
  const [editingCard, setEditingCard] = useState(false);
  const [editForm, setEditForm] = useState<{
    title: string; description: string; priority: string;
    status: string; assignedTo: string; dueDate: string;
  }>({ title: '', description: '', priority: '', status: '', assignedTo: '', dueDate: '' });

  // Users for assignment
  const [users, setUsers] = useState<{ UserID: string; Name: string; Email: string }[]>([]);

  const fetchBoard = useCallback(async () => {
    try {
      const [boardRes, listsRes, cardsRes] = await Promise.all([
        fetch(`/api/boards/${boardId}`),
        fetch(`/api/lists?boardId=${boardId}`),
        fetch(`/api/cards?boardId=${boardId}`),
      ]);
      if (boardRes.ok) setBoard(await boardRes.json());
      if (listsRes.ok) setLists(await listsRes.json());
      if (cardsRes.ok) setCards(await cardsRes.json());

      // Try to fetch users (may fail for non-admin)
      try {
        const usersRes = await fetch('/api/users');
        if (usersRes.ok) setUsers(await usersRes.json());
      } catch { /* non-admin, ignore */ }
    } catch (err) {
      console.error('Failed to fetch board:', err);
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => { fetchBoard(); }, [fetchBoard]);

  // ─── Drag & Drop ──────────────────────────────────

  async function handleDragEnd(result: DropResult) {
    if (!result.destination) return;

    const { source, destination, draggableId } = result;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    const sourceListId = source.droppableId;
    const destListId = destination.droppableId;

    // Snapshot previous state for rollback
    const previousCards = [...cards];

    const movingCard = cards.find((c) => c.CardID === draggableId);
    if (!movingCard) return;

    // Determine new status if moved to another list
    let updatedStatus = movingCard.Status;
    const destList = lists.find((l) => l.ListID === destListId);
    if (destList && sourceListId !== destListId) {
      const listUpper = destList.ListName.toUpperCase();
      if (listUpper.includes('PROGRESS')) updatedStatus = 'IN PROGRESS';
      else if (listUpper.includes('REVIEW')) updatedStatus = 'REVIEW';
      else if (listUpper.includes('DONE') || listUpper.includes('COMPLET')) updatedStatus = 'COMPLETED';
      else if (listUpper.includes('TODO') || listUpper.includes('BACKLOG')) updatedStatus = 'TODO';
    }

    const updatedMovingCard: Card = {
      ...movingCard,
      ListID: destListId,
      Status: updatedStatus,
    };

    // Remaining cards without moving card
    const remainingCards = cards.filter((c) => c.CardID !== draggableId);

    // Cards in destination list
    const destCards = remainingCards
      .filter((c) => c.ListID === destListId)
      .sort((a, b) => a.Position - b.Position);

    const targetIdx = Math.max(0, Math.min(destination.index, destCards.length));
    destCards.splice(targetIdx, 0, updatedMovingCard);
    destCards.forEach((c, i) => { c.Position = i + 1; });

    // Cards in source list (if different)
    let srcCards: Card[] = [];
    if (sourceListId !== destListId) {
      srcCards = remainingCards
        .filter((c) => c.ListID === sourceListId)
        .sort((a, b) => a.Position - b.Position);
      srcCards.forEach((c, i) => { c.Position = i + 1; });
    }

    const unaffectedCards = remainingCards.filter(
      (c) => c.ListID !== sourceListId && c.ListID !== destListId
    );

    setCards([...unaffectedCards, ...srcCards, ...destCards]);

    try {
      const res = await fetch('/api/cards/move', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: draggableId,
          sourceListId,
          destinationListId: destListId,
          newPosition: targetIdx + 1,
        }),
      });

      if (!res.ok) throw new Error('Failed to move card');

      if (updatedStatus !== movingCard.Status) {
        await fetch(`/api/cards/${draggableId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: updatedStatus }),
        });
      }
    } catch {
      setCards(previousCards); // Rollback on failure
    }
  }

  // ─── List Creation ──────────────────────────────────

  async function handleAddList(e: React.FormEvent) {
    e.preventDefault();
    if (!newListName.trim()) return;

    try {
      await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardId, listName: newListName }),
      });
      setNewListName('');
      setShowAddList(false);
      fetchBoard();
    } catch (err) {
      console.error('Failed to create list:', err);
    }
  }

  async function handleDeleteList(listId: string) {
    if (!confirm('Delete this list and all its cards?')) return;
    try {
      await fetch(`/api/lists/${listId}`, { method: 'DELETE' });
      fetchBoard();
    } catch (err) {
      console.error('Failed to delete list:', err);
    }
  }

  // ─── Card Creation ──────────────────────────────────

  async function handleAddCard(listId: string) {
    if (!newCardTitle.trim()) return;

    try {
      await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boardId,
          listId,
          title: newCardTitle.trim(),
          assignedTo: newCardAssignee.trim(),
        }),
      });
      setNewCardTitle('');
      setNewCardAssignee('');
      setAddingCardToList(null);
      fetchBoard();
    } catch (err) {
      console.error('Failed to create card:', err);
    }
  }

  // ─── Card Detail ──────────────────────────────────

  async function openCardDetail(card: Card) {
    setSelectedCard(card);
    setEditForm({
      title: card.Title, description: card.Description,
      priority: card.Priority, status: card.Status,
      assignedTo: card.AssignedTo, dueDate: card.DueDate,
    });

    try {
      const [updatesRes, activityRes] = await Promise.all([
        fetch(`/api/daily-updates?cardId=${card.CardID}`),
        fetch(`/api/activity/${card.CardID}`),
      ]);
      if (updatesRes.ok) setCardUpdates(await updatesRes.json());
      if (activityRes.ok) setCardActivities(await activityRes.json());
    } catch { /* ignore */ }
  }

  function closeCardDetail() {
    setSelectedCard(null);
    setCardUpdates([]);
    setCardActivities([]);
    setEditingCard(false);
    setNewUpdate('');
  }

  async function handleSaveCard() {
    if (!selectedCard) return;
    try {
      const payload: Record<string, string> = {};
      if (editForm.title !== selectedCard.Title) payload.title = editForm.title;
      if (editForm.description !== selectedCard.Description) payload.description = editForm.description;
      if (editForm.priority !== selectedCard.Priority) payload.priority = editForm.priority;
      if (editForm.status !== selectedCard.Status) payload.status = editForm.status;
      if (editForm.assignedTo !== selectedCard.AssignedTo) payload.assignedTo = editForm.assignedTo;
      if (editForm.dueDate !== selectedCard.DueDate) payload.dueDate = editForm.dueDate;

      if (Object.keys(payload).length > 0) {
        await fetch(`/api/cards/${selectedCard.CardID}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      setEditingCard(false);
      fetchBoard();
      // Refresh card
      const cardRes = await fetch(`/api/cards/${selectedCard.CardID}`);
      if (cardRes.ok) setSelectedCard(await cardRes.json());
    } catch (err) {
      console.error('Failed to save card:', err);
    }
  }

  async function handleDeleteCard() {
    if (!selectedCard) return;
    if (!confirm('Are you sure you want to delete this card?')) return;
    try {
      await fetch(`/api/cards/${selectedCard.CardID}`, { method: 'DELETE' });
      closeCardDetail();
      fetchBoard();
    } catch (err) {
      console.error('Failed to delete card:', err);
    }
  }

  async function handleAddUpdate() {
    if (!selectedCard || !newUpdate.trim()) return;
    setSavingUpdate(true);
    try {
      await fetch('/api/daily-updates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardId: selectedCard.CardID,
          updateText: newUpdate,
          progress: newProgress,
        }),
      });
      setNewUpdate('');
      // Refresh updates
      const res = await fetch(`/api/daily-updates?cardId=${selectedCard.CardID}`);
      if (res.ok) setCardUpdates(await res.json());
    } catch (err) {
      console.error('Failed to add update:', err);
    } finally {
      setSavingUpdate(false);
    }
  }

  // ─── Filtering ──────────────────────────────────

  function getFilteredCards(listId: string): Card[] {
    let filtered = cards.filter((c) => c.ListID === listId);

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) => c.Title.toLowerCase().includes(q) || c.Description.toLowerCase().includes(q)
      );
    }
    if (filterPriority) {
      filtered = filtered.filter((c) => c.Priority === filterPriority);
    }
    if (filterAssignee) {
      filtered = filtered.filter((c) => c.AssignedTo === filterAssignee);
    }

    return filtered.sort((a, b) => a.Position - b.Position);
  }

  // ─── Priority / Status helpers ──────────────────

  function getPriorityClass(p: string) {
    return `priority-badge-${p.toLowerCase()}`;
  }

  function getStatusClass(s: string) {
    return `status-${s.toLowerCase().replace(' ', '-')}`;
  }

  // ─── Render ──────────────────────────────────

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-content"><div className="spinner spinner-lg" /><p>Loading board...</p></div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Navbar */}
      <nav className={styles.navbar}>
        <div className={styles.navLeft}>
          <button className={styles.backBtn} onClick={() => router.push('/boards')}>
            <ArrowLeft size={18} />
          </button>
          <div className={styles.logo}>
            <LayoutDashboard size={20} />
            <span>TaskBoard</span>
          </div>
          <div className={styles.divider} />
          <h1 className={styles.boardTitle}>{board?.BoardName || 'Board'}</h1>
        </div>
        <div className={styles.navRight}>
          <div className={styles.searchBox}>
            <Search size={16} />
            <input
              type="text"
              placeholder="Search cards..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')}><X size={14} /></button>
            )}
          </div>
          <button
            className={`${styles.filterBtn} ${showFilters ? styles.filterActive : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter size={16} /> Filters
          </button>
        </div>
      </nav>

      {/* Filters bar */}
      {showFilters && (
        <div className={styles.filtersBar}>
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
            <option value="">All Priorities</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
          <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)}>
            <option value="">All Members</option>
            {users.map((u) => (
              <option key={u.UserID} value={u.Email}>{u.Name}</option>
            ))}
          </select>
          {(filterPriority || filterAssignee) && (
            <button className={styles.clearFilters} onClick={() => { setFilterPriority(''); setFilterAssignee(''); }}>
              <X size={14} /> Clear
            </button>
          )}
        </div>
      )}

      {/* Kanban Board */}
      <div className={styles.boardContainer}>
        <DragDropContext
          onDragStart={() => setIsDraggingAny(true)}
          onDragEnd={(result) => {
            setIsDraggingAny(false);
            handleDragEnd(result);
          }}
        >
          <div className={styles.listsContainer}>
            {lists.map((list) => {
              const listCards = getFilteredCards(list.ListID);
              return (
                <div key={list.ListID} className={styles.list}>
                  <div className={styles.listHeader}>
                    <div className={styles.listHeaderLeft}>
                      <h2>{list.ListName}</h2>
                      <span className={styles.listCount}>
                        {listCards.length}
                      </span>
                    </div>
                    {isAdmin && (
                      <div className={styles.listActions}>
                        <button
                          className={styles.listActionBtn}
                          onClick={() => handleDeleteList(list.ListID)}
                          title="Delete list"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>

                  <Droppable droppableId={list.ListID}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`${styles.listCards} ${snapshot.isDraggingOver ? styles.draggingOver : ''}`}
                      >
                        {listCards.map((card, index) => (
                          <Draggable key={card.CardID} draggableId={card.CardID} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={`${styles.card} ${snapshot.isDragging ? styles.cardDragging : ''}`}
                                style={provided.draggableProps.style}
                                onClick={() => {
                                  if (!snapshot.isDragging && !isDraggingAny) {
                                    openCardDetail(card);
                                  }
                                }}
                              >
                                <div className={`${styles.cardInner} ${snapshot.isDragging ? styles.cardInnerDragging : ''}`}>
                                  <div className={styles.cardHeader}>
                                    {card.Priority && card.Priority !== 'MEDIUM' ? (
                                      <span className={`${styles.cardBadge} ${getPriorityClass(card.Priority)}`}>
                                        {card.Priority}
                                      </span>
                                    ) : <div />}
                                    <div className={styles.cardGrip} title="Drag card">
                                      <GripVertical size={14} />
                                    </div>
                                  </div>

                                  <h3 className={styles.cardTitle}>{card.Title}</h3>

                                  {card.Description && (
                                    <p className={styles.cardDesc}>
                                      {card.Description.length > 80
                                        ? card.Description.substring(0, 80) + '...'
                                        : card.Description}
                                    </p>
                                  )}

                                  <div className={styles.cardMeta}>
                                    {card.DueDate && (
                                      <span className={styles.cardDue}>
                                        <Calendar size={12} />
                                        {new Date(card.DueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                      </span>
                                    )}
                                    {card.AssignedTo && (
                                      <div className={styles.cardAssigneePill} title={`Assigned to ${card.AssignedTo}`}>
                                        <span className={styles.cardAssigneeAvatar}>
                                          {card.AssignedTo.charAt(0).toUpperCase()}
                                        </span>
                                        <span className={styles.cardAssigneeName}>{card.AssignedTo}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        {listCards.length === 0 && !snapshot.isDraggingOver && (
                          <div className={styles.emptyListPlaceholder}>
                            <span>No cards yet</span>
                          </div>
                        )}
                      </div>
                    )}
                  </Droppable>

                {/* Add Card */}
                {isAdmin && (
                  <div className={styles.addCardSection}>
                    {addingCardToList === list.ListID ? (
                      <div className={styles.addCardForm}>
                        <input
                          type="text"
                          placeholder="Card title..."
                          value={newCardTitle}
                          onChange={(e) => setNewCardTitle(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAddCard(list.ListID); }}
                          autoFocus
                        />
                        <div className={styles.addCardAssigneeRow}>
                          <User size={13} className={styles.addCardAssigneeIcon} />
                          <input
                            type="text"
                            placeholder="Assign to (name)..."
                            value={newCardAssignee}
                            onChange={(e) => setNewCardAssignee(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAddCard(list.ListID); }}
                            className={styles.addCardAssigneeInput}
                          />
                        </div>
                        <div className={styles.addCardActions}>
                          <button className={styles.addCardSubmit} onClick={() => handleAddCard(list.ListID)}>
                            Add Card
                          </button>
                          <button
                            className={styles.addCardCancel}
                            onClick={() => {
                              setAddingCardToList(null);
                              setNewCardTitle('');
                              setNewCardAssignee('');
                            }}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        className={styles.addCardBtn}
                        onClick={() => {
                          setAddingCardToList(list.ListID);
                          setNewCardTitle('');
                          setNewCardAssignee('');
                        }}
                      >
                        <Plus size={16} /> Add a card
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

            {/* Add List */}
            {isAdmin && (
              <div className={styles.addListColumn}>
                {showAddList ? (
                  <form onSubmit={handleAddList} className={styles.addListForm}>
                    <input
                      type="text"
                      placeholder="Enter list name..."
                      value={newListName}
                      onChange={(e) => setNewListName(e.target.value)}
                      autoFocus
                    />
                    <div className={styles.addListActions}>
                      <button type="submit" className={styles.addListSubmit}>Add List</button>
                      <button type="button" className={styles.addListCancel} onClick={() => { setShowAddList(false); setNewListName(''); }}>
                        <X size={16} />
                      </button>
                    </div>
                  </form>
                ) : (
                  <button className={styles.addListBtn} onClick={() => setShowAddList(true)}>
                    <Plus size={18} /> Add another list
                  </button>
                )}
              </div>
            )}
          </div>
        </DragDropContext>
      </div>

      {/* Card Detail Modal */}
      {selectedCard && (
        <div className={styles.modalOverlay} onClick={closeCardDetail}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTopBar}>
              <div className={styles.modalTopLeft}>
                <span className={`${styles.modalStatus} ${getStatusClass(selectedCard.Status)}`}>
                  {selectedCard.Status}
                </span>
                <span className={`${styles.modalPriority} ${getPriorityClass(selectedCard.Priority)}`}>
                  <Flag size={12} /> {selectedCard.Priority}
                </span>
              </div>
              <div className={styles.modalTopRight}>
                {isAdmin && (
                  <button className={styles.modalDeleteBtn} onClick={handleDeleteCard} title="Delete card">
                    <Trash2 size={16} />
                  </button>
                )}
                <button className={styles.modalCloseBtn} onClick={closeCardDetail}>
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.modalMain}>
                {editingCard ? (
                  <div className={styles.editForm}>
                    <div className={styles.editGroup}>
                      <label>Title</label>
                      <input
                        value={editForm.title}
                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                        disabled={!isAdmin}
                      />
                    </div>
                    <div className={styles.editGroup}>
                      <label>Description</label>
                      <textarea
                        value={editForm.description}
                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                        rows={4}
                      />
                    </div>
                    <div className={styles.editRow}>
                      <div className={styles.editGroup}>
                        <label>Status</label>
                        <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
                          <option value="TODO">TODO</option>
                          <option value="IN PROGRESS">IN PROGRESS</option>
                          <option value="REVIEW">REVIEW</option>
                          <option value="COMPLETED">COMPLETED</option>
                        </select>
                      </div>
                      <div className={styles.editGroup}>
                        <label>Priority</label>
                        <select value={editForm.priority} onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}>
                          <option value="LOW">LOW</option>
                          <option value="MEDIUM">MEDIUM</option>
                          <option value="HIGH">HIGH</option>
                          <option value="URGENT">URGENT</option>
                        </select>
                      </div>
                    </div>
                    {isAdmin && (
                      <div className={styles.editRow}>
                        <div className={styles.editGroup}>
                          <label>Assigned To</label>
                          <input
                            type="text"
                            placeholder="Person's name..."
                            value={editForm.assignedTo}
                            onChange={(e) => setEditForm({ ...editForm, assignedTo: e.target.value })}
                          />
                        </div>
                        <div className={styles.editGroup}>
                          <label>Due Date</label>
                          <input
                            type="date" value={editForm.dueDate ? editForm.dueDate.substring(0, 10) : ''}
                            onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                          />
                        </div>
                      </div>
                    )}
                    <div className={styles.editActions}>
                      <button className={styles.saveBtn} onClick={handleSaveCard}>Save Changes</button>
                      <button className={styles.cancelEditBtn} onClick={() => setEditingCard(false)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={styles.modalTitleRow}>
                      <h2>{selectedCard.Title}</h2>
                      <button className={styles.editBtn} onClick={() => setEditingCard(true)}>
                        <Edit3 size={14} /> Edit
                      </button>
                    </div>
                    {selectedCard.Description && (
                      <p className={styles.modalDesc}>{selectedCard.Description}</p>
                    )}
                    <div className={styles.modalMeta}>
                      {selectedCard.AssignedTo && (
                        <div className={styles.metaItem}>
                          <User size={14} />
                          <span>{selectedCard.AssignedTo}</span>
                        </div>
                      )}
                      {selectedCard.DueDate && (
                        <div className={styles.metaItem}>
                          <Calendar size={14} />
                          <span>{new Date(selectedCard.DueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Daily Updates */}
                <div className={styles.updatesSection}>
                  <h3><MessageSquare size={16} /> Daily Updates</h3>

                  <div className={styles.addUpdateBox}>
                    <textarea
                      placeholder="Write today's update..."
                      value={newUpdate}
                      onChange={(e) => setNewUpdate(e.target.value)}
                      rows={3}
                    />
                    <div className={styles.updateControls}>
                      <div className={styles.progressInput}>
                        <label>Progress: {newProgress}%</label>
                        <input
                          type="range" min="0" max="100" value={newProgress}
                          onChange={(e) => setNewProgress(Number(e.target.value))}
                        />
                      </div>
                      <button
                        className={styles.addUpdateBtn}
                        onClick={handleAddUpdate}
                        disabled={!newUpdate.trim() || savingUpdate}
                      >
                        {savingUpdate ? <Loader2 size={14} className={styles.spinIcon} /> : <Send size={14} />}
                        Add Update
                      </button>
                    </div>
                  </div>

                  <div className={styles.updatesList}>
                    {cardUpdates.length === 0 ? (
                      <p className={styles.noUpdates}>No updates yet. Add your first daily update!</p>
                    ) : (
                      cardUpdates.map((update) => (
                        <div key={update.UpdateID} className={styles.updateItem}>
                          <div className={styles.updateDot} />
                          <div className={styles.updateContent}>
                            <div className={styles.updateHeader}>
                              <span className={styles.updateDate}>
                                {new Date(update.CreatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                              {update.Progress > 0 && (
                                <span className={styles.updateProgress}>{update.Progress}%</span>
                              )}
                            </div>
                            <p>{update.UpdateText}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Activity Log */}
                {cardActivities.length > 0 && (
                  <div className={styles.activitySection}>
                    <h3><Activity size={16} /> Activity</h3>
                    <div className={styles.activityList}>
                      {cardActivities.map((act) => (
                        <div key={act.ActivityID} className={styles.activityItem}>
                          <Clock size={12} />
                          <span>
                            {act.Action}
                            {act.OldValue && act.NewValue && (
                              <> from <strong>{act.OldValue}</strong> to <strong>{act.NewValue}</strong></>
                            )}
                            {!act.OldValue && act.NewValue && (
                              <>: <strong>{act.NewValue}</strong></>
                            )}
                          </span>
                          <span className={styles.activityTime}>
                            {new Date(act.Timestamp).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
