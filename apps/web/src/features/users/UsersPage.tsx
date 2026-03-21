import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserRole } from '@web/shared/enums';
import { z } from 'zod';
import apiClient, { unwrapApiData } from '../../api/client';
import { formatDate } from '../../utils/date';

type DepartmentScope = { department: string; can_read: boolean; can_write: boolean };

type User = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  org_id: string;
  is_active: boolean;
  last_login_at: string | null;
  department_scope: DepartmentScope[] | null;
  created_at: string;
};

type PaginatedUsers = { data: User[]; total: number };

const departments = ['VENTES', 'ACHATS', 'RH', 'FINANCE', 'MARKETING', 'IT', 'PRODUCTION', 'OPERATIONS'] as const;

const inviteUserSchema = z.object({
  email: z.string().email('Email invalide'),
  first_name: z.string().trim().min(1, 'Prénom obligatoire'),
  last_name: z.string().trim().min(1, 'Nom obligatoire'),
  role: z.nativeEnum(UserRole),
  department: z.string().optional(),
}).superRefine((value, ctx) => {
  if (value.role === UserRole.CONTRIBUTEUR && !value.department?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['department'],
      message: 'Département obligatoire pour un contributeur',
    });
  }
});

const updateUserSchema = z.object({
  role: z.nativeEnum(UserRole),
  department: z.string().optional(),
}).superRefine((value, ctx) => {
  if (value.role === UserRole.CONTRIBUTEUR && !value.department?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['department'],
      message: 'Département obligatoire pour un contributeur',
    });
  }
});

type InviteUserFormValues = z.infer<typeof inviteUserSchema>;
type UpdateUserFormValues = z.infer<typeof updateUserSchema>;

const ROLE_STYLE: Record<string, { bg: string; color: string }> = {
  SUPER_ADMIN:  { bg: 'var(--terra-lt)',  color: 'var(--terra)' },
  FPA:          { bg: 'var(--indigo-lt)', color: 'var(--indigo)' },
  CONTRIBUTEUR: { bg: 'var(--kola-lt)',   color: 'var(--kola)' },
  LECTEUR:      { bg: 'var(--gold-lt)',   color: 'var(--gold)' },
};

const TH: React.CSSProperties = {
  padding: '10px 16px', color: 'var(--text-lo)', fontWeight: 600,
  fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'left',
};
const TD: React.CSSProperties = { padding: '14px 16px', color: 'var(--text-hi)', fontSize: 13 };

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(26,26,46,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 300,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          background: 'var(--surface)',
          borderRadius: 16,
          padding: 28,
          width: 520,
          boxShadow: 'var(--shadow-md)',
          position: 'relative',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            width: 30,
            height: 30,
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text-md)',
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          X
        </button>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--ink)', marginBottom: 20 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function InviteUserModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [submitError, setSubmitError] = useState('');
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<InviteUserFormValues>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: {
      email: '',
      first_name: '',
      last_name: '',
      role: UserRole.LECTEUR,
      department: '',
    },
  });

  const role = watch('role');
  const inviteMutation = useMutation({
    mutationFn: (values: InviteUserFormValues) =>
      apiClient.post('/users/invite', {
        ...values,
        email: values.email.trim().toLowerCase(),
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        department: values.role === UserRole.CONTRIBUTEUR ? values.department?.trim() : undefined,
      }),
    onSuccess: onSuccess,
    onError: (err: any) => {
      setSubmitError(err.response?.data?.message ?? 'Erreur lors de l invitation');
    },
  });

  return (
    <ModalShell title="Inviter un utilisateur" onClose={onClose}>
      <div style={{ display: 'grid', gap: 12 }}>
        <input {...register('email')} placeholder="Email" style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }} />
        {errors.email ? <p style={{ margin: 0, color: 'var(--terra)', fontSize: 12 }}>{errors.email.message}</p> : null}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
          <div>
            <input {...register('first_name')} placeholder="Prénom" style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }} />
            {errors.first_name ? <p style={{ margin: '6px 0 0', color: 'var(--terra)', fontSize: 12 }}>{errors.first_name.message}</p> : null}
          </div>
          <div>
            <input {...register('last_name')} placeholder="Nom" style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }} />
            {errors.last_name ? <p style={{ margin: '6px 0 0', color: 'var(--terra)', fontSize: 12 }}>{errors.last_name.message}</p> : null}
          </div>
        </div>
        <select {...register('role')} style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
          {Object.values(UserRole).map((roleOption) => (
            <option key={roleOption} value={roleOption}>{roleOption}</option>
          ))}
        </select>
        {role === UserRole.CONTRIBUTEUR ? (
          <div>
            <select {...register('department')} style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
              <option value="">Sélectionner un département</option>
              {departments.map((department) => (
                <option key={department} value={department}>{department}</option>
              ))}
            </select>
            {errors.department ? <p style={{ margin: '6px 0 0', color: 'var(--terra)', fontSize: 12 }}>{errors.department.message}</p> : null}
          </div>
        ) : null}
        {submitError ? <p style={{ margin: 0, color: 'var(--terra)', fontSize: 12 }}>{submitError}</p> : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
          <button type="button" onClick={onClose} style={{ padding: '8px 18px', border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', cursor: 'pointer' }}>Annuler</button>
          <button type="button" onClick={handleSubmit((values) => inviteMutation.mutate(values))} disabled={inviteMutation.isPending} style={{ padding: '8px 18px', border: 'none', borderRadius: 8, background: inviteMutation.isPending ? 'var(--text-lo)' : 'var(--terra)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
            {inviteMutation.isPending ? 'Invitation...' : 'Inviter'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function UpdateRoleModal({ user, onClose, onSuccess }: { user: User; onClose: () => void; onSuccess: () => void }) {
  const [submitError, setSubmitError] = useState('');
  const defaultDepartment = user.department_scope?.find((scope) => scope.can_write)?.department ?? '';
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<UpdateUserFormValues>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      role: user.role,
      department: defaultDepartment,
    },
  });

  const role = watch('role');
  const updateMutation = useMutation({
    mutationFn: (values: UpdateUserFormValues) =>
      apiClient.put(`/users/${user.id}`, {
        role: values.role,
        department: values.role === UserRole.CONTRIBUTEUR ? values.department?.trim() : undefined,
      }),
    onSuccess: onSuccess,
    onError: (err: any) => {
      setSubmitError(err.response?.data?.message ?? 'Erreur lors de la modification');
    },
  });

  return (
    <ModalShell title={`Modifier le rôle de ${user.first_name} ${user.last_name}`} onClose={onClose}>
      <div style={{ display: 'grid', gap: 12 }}>
        <select {...register('role')} style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
          {Object.values(UserRole).map((roleOption) => (
            <option key={roleOption} value={roleOption}>{roleOption}</option>
          ))}
        </select>
        {role === UserRole.CONTRIBUTEUR ? (
          <div>
            <select {...register('department')} style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
              <option value="">Sélectionner un département</option>
              {departments.map((department) => (
                <option key={department} value={department}>{department}</option>
              ))}
            </select>
            {errors.department ? <p style={{ margin: '6px 0 0', color: 'var(--terra)', fontSize: 12 }}>{errors.department.message}</p> : null}
          </div>
        ) : null}
        {submitError ? <p style={{ margin: 0, color: 'var(--terra)', fontSize: 12 }}>{submitError}</p> : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
          <button type="button" onClick={onClose} style={{ padding: '8px 18px', border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', cursor: 'pointer' }}>Annuler</button>
          <button type="button" onClick={handleSubmit((values) => updateMutation.mutate(values))} disabled={updateMutation.isPending} style={{ padding: '8px 18px', border: 'none', borderRadius: 8, background: updateMutation.isPending ? 'var(--text-lo)' : 'var(--terra)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
            {updateMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['users'],
    queryFn: () =>
      apiClient.get<PaginatedUsers>('/users?limit=100').then(unwrapApiData),
  });

  const { data: currentUser } = useQuery({
    queryKey: ['users-me'],
    queryFn: () => apiClient.get<User>('/users/me').then(unwrapApiData),
  });

  const toggleMutation = useMutation({
    mutationFn: (userId: string) => apiClient.patch(`/users/${userId}/toggle`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => apiClient.delete(`/users/${userId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const users = data?.data ?? [];
  const activeCount = users.filter((u) => u.is_active).length;

  return (
    <div className="dashboard-page">
      <div className="page-head">
        <div>
          <p className="page-eyebrow">ADMINISTRATION</p>
          <h1 className="page-title">Gestion des Utilisateurs</h1>
          <p className="page-sub">
            {isLoading ? '…' : `${users.length} utilisateur(s)`}
            {activeCount > 0 && !isLoading ? ` · ${activeCount} actif(s)` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowInviteModal(true)}
          style={{
            padding: '10px 18px',
            border: 'none',
            borderRadius: 10,
            background: 'var(--terra)',
            color: '#fff',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          Inviter un utilisateur
        </button>
      </div>

      {isLoading && (
        <div style={{ display: 'grid', gap: 10 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ height: 52, background: 'var(--surface2)', borderRadius: 14, animation: 'pulse 1.5s ease infinite' }} />
          ))}
        </div>
      )}

      {isError && (
        <div style={{ padding: 24, background: 'var(--terra-lt)', border: '1px solid var(--terra)', borderRadius: 14, color: 'var(--terra)', fontSize: 13 }}>
          ⚠️ Impossible de charger les utilisateurs.
        </div>
      )}

      {!isLoading && !isError && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          {users.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-lo)' }}>Aucun utilisateur.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
                    <th style={TH}>Nom</th>
                    <th style={TH}>Email</th>
                    <th style={TH}>Rôle</th>
                    <th style={TH}>Départements</th>
                    <th style={{ ...TH, textAlign: 'center' }}>Statut</th>
                    <th style={TH}>Dernière connexion</th>
                    <th style={TH}>Créé le</th>
                    <th style={TH}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, idx) => {
                    const rc = ROLE_STYLE[u.role] ?? { bg: 'var(--surface2)', color: 'var(--text-md)' };
                    const depts = u.department_scope?.filter((d) => d.can_write).map((d) => d.department) ?? [];
                    const isSelf = currentUser?.id === u.id;
                    return (
                      <tr
                        key={u.id}
                        style={{ borderBottom: idx < users.length - 1 ? '1px solid var(--border)' : 'none' }}
                      >
                        <td style={TD}>
                          <span style={{ fontWeight: 600 }}>{u.first_name} {u.last_name}</span>
                        </td>
                        <td style={{ ...TD, color: 'var(--text-md)' }}>{u.email}</td>
                        <td style={TD}>
                          <span style={{ background: rc.bg, color: rc.color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                            {u.role}
                          </span>
                        </td>
                        <td style={{ ...TD, color: 'var(--text-md)', fontSize: 11 }}>
                          {depts.length > 0 ? depts.join(', ') : '—'}
                        </td>
                        <td style={{ ...TD, textAlign: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: u.is_active ? 'var(--kola)' : 'var(--terra)' }}>
                            {u.is_active ? '✓ Actif' : '✗ Inactif'}
                          </span>
                        </td>
                        <td style={{ ...TD, color: 'var(--text-md)' }}>
                          {u.last_login_at ? formatDate(u.last_login_at, 'short') : '—'}
                        </td>
                        <td style={{ ...TD, color: 'var(--text-md)' }}>{formatDate(u.created_at, 'short')}</td>
                        <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                          <button
                            type="button"
                            onClick={() => setEditingUser(u)}
                            disabled={isSelf}
                            style={{ padding: '6px 10px', marginRight: 6, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: isSelf ? 'not-allowed' : 'pointer', color: 'var(--indigo)', opacity: isSelf ? 0.5 : 1 }}
                          >
                            Rôle
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleMutation.mutate(u.id)}
                            disabled={isSelf || toggleMutation.isPending}
                            style={{ padding: '6px 10px', marginRight: 6, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: isSelf ? 'not-allowed' : 'pointer', color: u.is_active ? 'var(--terra)' : 'var(--kola)', opacity: isSelf ? 0.5 : 1 }}
                          >
                            {u.is_active ? 'Désactiver' : 'Activer'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Supprimer définitivement ${u.first_name} ${u.last_name} ?`)) {
                                deleteMutation.mutate(u.id);
                              }
                            }}
                            disabled={isSelf || deleteMutation.isPending}
                            style={{ padding: '6px 10px', border: '1px solid var(--terra)', borderRadius: 8, background: 'transparent', cursor: isSelf ? 'not-allowed' : 'pointer', color: 'var(--terra)', opacity: isSelf ? 0.5 : 1 }}
                          >
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showInviteModal ? (
        <InviteUserModal
          onClose={() => setShowInviteModal(false)}
          onSuccess={async () => {
            await queryClient.invalidateQueries({ queryKey: ['users'] });
            setShowInviteModal(false);
          }}
        />
      ) : null}

      {editingUser ? (
        <UpdateRoleModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSuccess={async () => {
            await queryClient.invalidateQueries({ queryKey: ['users'] });
            setEditingUser(null);
          }}
        />
      ) : null}
    </div>
  );
}
