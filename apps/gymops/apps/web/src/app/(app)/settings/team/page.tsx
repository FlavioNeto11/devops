'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  membershipsApi, invitationsApi, unitsApi, areasApi,
  type MembershipRecord, type InvitationRecord,
} from '@/lib/admin-api';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { UserAvatar } from '@/components/ui/avatar';
import { UserPlus, Mail, Trash2, Users, Loader2, Clock, Pencil, Check, X } from 'lucide-react';
import { TutorialTrigger } from '@/features/tutorial';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  org_manager: 'Gestor',
  unit_manager: 'Gerente de Unidade',
  area_leader: 'Líder de Área',
  executor: 'Executor',
  viewer: 'Visualizador',
};

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-red-100 text-red-700',
  org_manager: 'bg-purple-100 text-purple-700',
  unit_manager: 'bg-blue-100 text-blue-700',
  area_leader: 'bg-teal-100 text-teal-700',
  executor: 'bg-green-100 text-green-700',
  viewer: 'bg-gray-100 text-gray-600',
};

const SCOPE_LABELS: Record<string, string> = {
  organization: 'Organização',
  unit: 'Unidade',
  area: 'Área',
};

const INVITATION_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  accepted: 'Aceito',
  expired: 'Expirado',
  canceled: 'Cancelado',
};

const INVITATION_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  accepted: 'bg-green-100 text-green-700',
  expired: 'bg-gray-100 text-gray-500',
  canceled: 'bg-red-100 text-red-600',
};

type TabKey = 'members' | 'invitations';

export default function TeamPage() {
  const { organizationId, user: currentUser } = useAuthStore();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [tab, setTab] = useState<TabKey>('members');
  const [invStatusFilter, setInvStatusFilter] = useState('');

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  // Load ALL memberships (org + unit + area) in one query
  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['memberships-all', organizationId],
    queryFn: () => membershipsApi.list({ organizationId: organizationId! }),
    enabled: !!organizationId,
  });

  const { data: invitationsData, isLoading: invLoading } = useQuery({
    queryKey: ['invitations', organizationId],
    queryFn: () => invitationsApi.list(organizationId!),
    enabled: !!organizationId && tab === 'invitations',
  });

  const revokeMutation = useMutation({
    mutationFn: membershipsApi.revoke,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memberships-all', organizationId] });
      showToast('success', 'Acesso revogado.');
    },
    onError: () => showToast('error', 'Erro ao revogar acesso.'),
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({ membership, role }: { membership: MembershipRecord; role: string }) =>
      membershipsApi.updateRole(membership, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memberships-all', organizationId] });
      showToast('success', 'Papel atualizado.');
    },
    onError: () => showToast('error', 'Erro ao atualizar papel.'),
  });

  const cancelInviteMutation = useMutation({
    mutationFn: invitationsApi.cancel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations', organizationId] });
      showToast('success', 'Convite cancelado.');
    },
  });

  const members = membersData?.data ?? [];
  const invitations = invitationsData?.data ?? [];
  const filteredInvitations = invStatusFilter
    ? invitations.filter((i) => i.status === invStatusFilter)
    : invitations;

  const tabItems: Array<{ key: TabKey; label: string }> = [
    { key: 'members', label: `Membros (${members.length})` },
    { key: 'invitations', label: 'Convites' },
  ];

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Equipe</h1>
          <p className="text-sm text-muted-foreground mt-1">Gerencie membros e convites da organização, unidades e áreas.</p>
        </div>
        <div className="flex gap-2 items-center">
          <TutorialTrigger tutorialId="team-permissions" />
          <Button onClick={() => setShowInvite(true)} className="gap-2">
            <UserPlus className="h-4 w-4" />
            Convidar
          </Button>
        </div>
      </div>

      {toast && (
        <div className={`mb-4 rounded-md p-3 text-sm ${toast.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {toast.message}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-6 overflow-x-auto">
        {tabItems.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'members' && (
        membersLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : members.length === 0 ? (
          <div className="text-center py-16 border rounded-lg">
            <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="font-medium">Nenhum membro encontrado</p>
          </div>
        ) : (
          <div className="space-y-2" data-tutorial="team-list">
            {members.map((m) => (
              <MemberRow
                key={m.id}
                membership={m}
                isCurrentUser={m.userId === currentUser?.id}
                onRevoke={(id) => {
                  if (confirm('Revogar acesso deste membro?')) revokeMutation.mutate(id);
                }}
                onUpdateRole={(role) => updateRoleMutation.mutate({ membership: m, role })}
                revoking={revokeMutation.isPending && revokeMutation.variables === m.id}
                updating={updateRoleMutation.isPending}
              />
            ))}
          </div>
        )
      )}

      {tab === 'invitations' && (
        <div>
          {/* Filter by status */}
          <div className="mb-4 flex gap-2 flex-wrap">
            {['', 'pending', 'accepted', 'expired', 'canceled'].map((s) => (
              <button
                key={s}
                onClick={() => setInvStatusFilter(s)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${invStatusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-muted'}`}
              >
                {s === '' ? 'Todos' : INVITATION_STATUS_LABELS[s] ?? s}
              </button>
            ))}
          </div>

          {invLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : filteredInvitations.length === 0 ? (
            <div className="text-center py-16 border rounded-lg">
              <Mail className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
              <p className="font-medium mb-1">Nenhum convite encontrado</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredInvitations.map((inv) => (
                <InvitationRow
                  key={inv.id}
                  invitation={inv}
                  onCancel={(id) => {
                    if (confirm('Cancelar este convite?')) cancelInviteMutation.mutate(id);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <InviteDialog
        open={showInvite}
        onClose={() => setShowInvite(false)}
        organizationId={organizationId!}
        onSuccess={() => {
          setShowInvite(false);
          queryClient.invalidateQueries({ queryKey: ['memberships-all', organizationId] });
          queryClient.invalidateQueries({ queryKey: ['invitations', organizationId] });
          showToast('success', 'Convite enviado!');
        }}
      />
    </div>
  );
}

function MemberRow({ membership: m, isCurrentUser, onRevoke, onUpdateRole, revoking, updating }: {
  membership: MembershipRecord;
  isCurrentUser: boolean;
  onRevoke: (id: string) => void;
  onUpdateRole: (role: string) => void;
  revoking: boolean;
  updating: boolean;
}) {
  const [editingRole, setEditingRole] = useState(false);
  const [selectedRole, setSelectedRole] = useState(m.role);

  const EDITABLE_ROLES = ['org_manager', 'unit_manager', 'area_leader', 'executor', 'viewer'];

  const handleSaveRole = () => {
    if (selectedRole !== m.role) onUpdateRole(selectedRole);
    setEditingRole(false);
  };

  return (
    <div className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/30 transition-colors gap-2">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <UserAvatar name={m.user.name} avatarUrl={m.user.avatarUrl} className="h-8 w-8 shrink-0" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{m.user.name}</span>
            {isCurrentUser && <span className="text-xs text-muted-foreground">(você)</span>}
          </div>
          <p className="text-xs text-muted-foreground truncate">{m.user.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
        <Badge variant="outline" className="text-xs">
          {SCOPE_LABELS[m.scopeType] ?? m.scopeType}
        </Badge>

        {editingRole ? (
          <div className="flex items-center gap-1">
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="text-xs rounded border bg-background px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {EDITABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
            </select>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleSaveRole} disabled={updating} aria-label="Salvar papel">
              <Check className="h-3 w-3 text-green-600" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingRole(false); setSelectedRole(m.role); }} aria-label="Cancelar edição">
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ROLE_COLORS[m.role] ?? 'bg-gray-100 text-gray-600'}`}>
            {ROLE_LABELS[m.role] ?? m.role}
          </span>
        )}

        {!isCurrentUser && m.role !== 'owner' && !editingRole && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingRole(true)} aria-label="Editar papel">
            <Pencil className="h-3 w-3" />
          </Button>
        )}
        {!isCurrentUser && m.role !== 'owner' && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRevoke(m.id)} disabled={revoking} aria-label="Revogar acesso">
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        )}
      </div>
    </div>
  );
}

function InvitationRow({ invitation: inv, onCancel }: { invitation: InvitationRecord; onCancel: (id: string) => void }) {
  const expiresAt = new Date(inv.expiresAt);

  return (
    <div className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/30 transition-colors gap-2">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
          <Mail className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <span className="font-medium text-sm truncate block">{inv.email}</span>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full ${ROLE_COLORS[inv.role] ?? 'bg-gray-100 text-gray-600'}`}>
              {ROLE_LABELS[inv.role] ?? inv.role}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${INVITATION_STATUS_COLORS[inv.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {INVITATION_STATUS_LABELS[inv.status] ?? inv.status}
            </span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {new Intl.DateTimeFormat('pt-BR').format(expiresAt)}
            </span>
          </div>
        </div>
      </div>
      {inv.status === 'pending' && (
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => onCancel(inv.id)} aria-label="Cancelar convite">
          <Trash2 className="h-3 w-3 text-destructive" />
        </Button>
      )}
    </div>
  );
}

function InviteDialog({ open, onClose, organizationId, onSuccess }: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'org_manager' | 'unit_manager' | 'area_leader' | 'executor' | 'viewer'>('executor');
  const [scopeType, setScopeType] = useState<'organization' | 'unit' | 'area'>('organization');
  const [scopeId, setScopeId] = useState('');
  const [error, setError] = useState('');

  const { data: unitsData } = useQuery({
    queryKey: ['units', organizationId],
    queryFn: () => unitsApi.list(organizationId),
    enabled: open && scopeType === 'unit',
  });

  const { data: areasData } = useQuery({
    queryKey: ['areas', organizationId],
    queryFn: () => areasApi.list(organizationId),
    enabled: open && scopeType === 'area',
  });

  const units = unitsData?.data ?? [];
  const areas = areasData?.data ?? [];

  const inviteMutation = useMutation({
    mutationFn: (data: Parameters<typeof invitationsApi.create>[0]) => invitationsApi.create(data),
    onSuccess,
    onError: (err: unknown) => {
      const message = (err as { message?: string })?.message;
      setError(message ?? 'Erro ao enviar convite.');
    },
  });

  const handleScopeTypeChange = (newScope: typeof scopeType) => {
    setScopeType(newScope);
    setScopeId(newScope === 'organization' ? organizationId : '');
    if (newScope === 'organization') setRole('org_manager');
    else if (newScope === 'unit') setRole('unit_manager');
    else setRole('area_leader');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) { setError('E-mail é obrigatório.'); return; }
    const resolvedScopeId = scopeType === 'organization' ? organizationId : scopeId;
    if (!resolvedScopeId) { setError('Selecione o escopo (unidade ou área).'); return; }
    inviteMutation.mutate({ organizationId, email: email.trim(), role, scopeType, scopeId: resolvedScopeId });
  };

  const INVITE_ROLES_BY_SCOPE: Record<string, Array<{ value: string; label: string }>> = {
    organization: [
      { value: 'org_manager', label: 'Gestor da organização' },
    ],
    unit: [
      { value: 'unit_manager', label: 'Gerente de unidade' },
      { value: 'executor', label: 'Executor' },
      { value: 'viewer', label: 'Visualizador' },
    ],
    area: [
      { value: 'area_leader', label: 'Líder de área' },
      { value: 'executor', label: 'Executor' },
      { value: 'viewer', label: 'Visualizador' },
    ],
  };

  const inviteRoles = INVITE_ROLES_BY_SCOPE[scopeType] ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">Convidar membro</h2>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="invite-email" className="block text-sm font-medium mb-1">E-mail *</label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@empresa.com"
              required
            />
          </div>

          <div>
            <label htmlFor="invite-scope" className="block text-sm font-medium mb-1">Escopo do acesso *</label>
            <select
              id="invite-scope"
              value={scopeType}
              onChange={(e) => handleScopeTypeChange(e.target.value as typeof scopeType)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="organization">Organização (acesso completo)</option>
              <option value="unit">Unidade específica</option>
              <option value="area">Área específica</option>
            </select>
          </div>

          {scopeType === 'unit' && (
            <div>
              <label htmlFor="invite-unit" className="block text-sm font-medium mb-1">Unidade *</label>
              <select
                id="invite-unit"
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Selecione uma unidade...</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
          )}

          {scopeType === 'area' && (
            <div>
              <label htmlFor="invite-area" className="block text-sm font-medium mb-1">Área *</label>
              <select
                id="invite-area"
                value={scopeId}
                onChange={(e) => setScopeId(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Selecione uma área...</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="invite-role" className="block text-sm font-medium mb-1">Papel *</label>
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {inviteRoles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>

          <p className="text-xs text-muted-foreground">
            Se o usuário já tiver cadastro, será adicionado diretamente. Caso contrário, receberá um convite por e-mail.
          </p>
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={inviteMutation.isPending} className="gap-2">
              {inviteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Enviar convite
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
