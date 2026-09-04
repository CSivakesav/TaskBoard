// ─── Enums ──────────────────────────────────────────────

export type Role = 'ADMIN' | 'MEMBER';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type CardStatus = 'TODO' | 'IN PROGRESS' | 'REVIEW' | 'COMPLETED';

// ─── Data Models ────────────────────────────────────────

export interface User {
  UserID: string;
  Name: string;
  Email: string;
  PasswordHash: string;
  Role: Role;
  Active: boolean;
  CreatedAt: string;
}

export interface Board {
  BoardID: string;
  BoardName: string;
  Description: string;
  CreatedBy: string;
  CreatedAt: string;
  UpdatedAt: string;
  Archived: boolean;
}

export interface List {
  ListID: string;
  BoardID: string;
  ListName: string;
  Position: number;
  CreatedAt: string;
}

export interface Card {
  CardID: string;
  BoardID: string;
  ListID: string;
  Title: string;
  Description: string;
  AssignedTo: string;
  Priority: Priority;
  DueDate: string;
  Position: number;
  CreatedBy: string;
  CreatedAt: string;
  UpdatedAt: string;
  Status: CardStatus;
}

export interface DailyUpdate {
  UpdateID: string;
  CardID: string;
  UserID: string;
  Date: string;
  UpdateText: string;
  Status: string;
  Progress: number;
  CreatedAt: string;
  UpdatedAt: string;
}

export interface Activity {
  ActivityID: string;
  CardID: string;
  UserID: string;
  Action: string;
  OldValue: string;
  NewValue: string;
  Timestamp: string;
}

// ─── Auth / Session ─────────────────────────────────────

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

// ─── API Payloads ───────────────────────────────────────

export interface CreateBoardPayload {
  boardName: string;
  description: string;
}

export interface CreateListPayload {
  boardId: string;
  listName: string;
}

export interface CreateCardPayload {
  boardId: string;
  listId: string;
  title: string;
  description?: string;
  assignedTo?: string;
  priority?: Priority;
  dueDate?: string;
}

export interface UpdateCardPayload {
  title?: string;
  description?: string;
  assignedTo?: string;
  priority?: Priority;
  dueDate?: string;
  status?: CardStatus;
  listId?: string;
  position?: number;
}

export interface MoveCardPayload {
  cardId: string;
  sourceListId: string;
  destinationListId: string;
  newPosition: number;
}

export interface CreateDailyUpdatePayload {
  cardId: string;
  updateText: string;
  status?: string;
  progress?: number;
}

export interface DashboardStats {
  totalTasks: number;
  completed: number;
  inProgress: number;
  pending: number;
  overdue: number;
  todaysUpdates: number;
  tasksByMember: { name: string; email: string; count: number }[];
  completionPercentage: number;
  recentUpdates: (DailyUpdate & { cardTitle: string; userName: string })[];
  overdueTasks: (Card & { listName: string })[];
}
