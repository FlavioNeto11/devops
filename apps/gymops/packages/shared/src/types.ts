// ─── API Response envelope ────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  meta?: {
    total?: number;
    nextCursor?: string;
    page?: number;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthTokenPayload {
  sub: string; // userId
  email: string;
  name: string;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  organizationId: string | null;
  role: string | null;
  primaryUnitId: string | null;
  isPlatformAdmin: boolean;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  };
}

// ─── Domain types (API responses) ────────────────────────────────────────────

export type UserRole = 'owner' | 'org_manager' | 'unit_manager' | 'area_leader' | 'executor' | 'viewer';
export type ScopeType = 'organization' | 'unit' | 'area';
export type ActivityStatus = 'novo' | 'em_andamento' | 'aguardando_terceiro' | 'aguardando_aprovacao' | 'concluido' | 'cancelado';
export type ActivityPriority = 'baixa' | 'media' | 'alta' | 'critica';
export type VisibilityMode = 'inherited' | 'restricted' | 'shared';
export type AssigneeKind = 'responsible' | 'participant' | 'watcher';

export interface OrganizationDTO {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  createdAt: string;
}

export interface UnitDTO {
  id: string;
  organizationId: string;
  name: string;
  code: string | null;
  address: string | null;
  status: string;
  createdAt: string;
}

export interface AreaDTO {
  id: string;
  organizationId: string;
  name: string;
  key: string;
  color: string | null;
  visibilityDefault: VisibilityMode;
}

export interface UnitAreaDTO {
  id: string;
  unitId: string;
  areaId: string;
  enabled: boolean;
  order: number;
  area: AreaDTO;
}

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
}

export interface MembershipDTO {
  id: string;
  userId: string;
  organizationId: string;
  scopeType: ScopeType;
  scopeId: string;
  role: UserRole;
  createdAt: string;
  user?: UserDTO;
}

export interface ActivityAssigneeDTO {
  userId: string;
  name: string;
  avatarUrl: string | null;
  kind: AssigneeKind;
}

export interface ActivityDTO {
  id: string;
  organizationId: string;
  unitId: string;
  areaId: string;
  templateId: string | null;
  title: string;
  description: string | null;
  status: ActivityStatus;
  priority: ActivityPriority;
  dueAt: string | null;
  visibilityMode: VisibilityMode;
  metadata: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  isOverdue: boolean;
  unit?: Pick<UnitDTO, 'id' | 'name'>;
  area?: Pick<AreaDTO, 'id' | 'name' | 'color'>;
  assignees?: ActivityAssigneeDTO[];
  checklistProgress?: { done: number; total: number };
}

export interface ChecklistItemDTO {
  id: string;
  text: string;
  done: boolean;
  doneBy: string | null;
  doneAt: string | null;
  /** Comentário curto e único do item (minimalista — não é thread). */
  comment: string | null;
  order: number;
}

export interface ChecklistDTO {
  id: string;
  title: string;
  order: number;
  /** Checklist desativado: fora do progresso, somente leitura na UI. */
  disabledAt: string | null;
  items: ChecklistItemDTO[];
}

export interface CommentDTO {
  id: string;
  activityId: string;
  userId: string;
  body: string;
  editedAt: string | null;
  createdAt: string;
  user: UserDTO;
}

export interface ActivityEventDTO {
  id: string;
  activityId: string;
  actorId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
  actor?: Pick<UserDTO, 'id' | 'name' | 'avatarUrl'> | null;
}
