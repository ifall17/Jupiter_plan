import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import apiClient from '../../api/client';
import { emitAppNotification } from '../../utils/notifications';
import { useAuthStore } from '../../stores/auth.store';
import { useOrgStore } from '../../stores/org.store';

const organizationSchema = z.object({
  name: z.string().trim().min(2, 'Nom trop court').max(150, 'Nom trop long'),
});

const passwordSchema = z.object({
  current_password: z.string().min(8, 'Minimum 8 caractères'),
  new_password: z.string().min(8, 'Minimum 8 caractères').max(128, 'Mot de passe trop long'),
  confirm_password: z.string().min(8, 'Confirmation requise'),
}).refine((value) => value.new_password === value.confirm_password, {
  message: 'La confirmation ne correspond pas',
  path: ['confirm_password'],
});

type OrganizationFormValues = z.infer<typeof organizationSchema>;
type PasswordFormValues = z.infer<typeof passwordSchema>;

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,46,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div onClick={(event) => event.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 520, boxShadow: 'var(--shadow-md)', position: 'relative' }}>
        <button type="button" onClick={onClose} aria-label="Fermer" style={{ position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-md)', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>X</button>
        <h2 style={{ fontSize: 22, fontFamily: 'var(--font-serif)', color: 'var(--ink)', margin: '0 0 20px 0' }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const orgName = useOrgStore((s) => s.orgName);
  const currency = useOrgStore((s) => s.currency);
  const fiscalYearId = useOrgStore((s) => s.fiscalYearId);
  const fiscalYearLabel = useOrgStore((s) => s.fiscalYearLabel);
  const currentPeriod = useOrgStore((s) => s.currentPeriod);
  const currentPeriodLabel = useOrgStore((s) => s.currentPeriodLabel);
  const setOrg = useOrgStore((s) => s.setOrg);
  const queryClient = useQueryClient();
  const [showOrgModal, setShowOrgModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const orgForm = useForm<OrganizationFormValues>({
    resolver: zodResolver(organizationSchema),
    defaultValues: { name: orgName ?? '' },
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  });

  const updateOrganizationMutation = useMutation({
    mutationFn: (values: OrganizationFormValues) => apiClient.patch('/organizations/current', { name: values.name.trim() }),
    onSuccess: async (response) => {
      const data = response.data.data;
      setOrg({
        orgId: data.id,
        orgName: data.name,
        currency: data.currency,
        currentPeriod: data.current_period_id,
        currentPeriodLabel: data.current_period_label,
        fiscalYearId: data.fiscal_year_id,
        fiscalYearLabel: data.fiscal_year_label,
      });
      queryClient.setQueryData(['org', data.id], data);
      await queryClient.invalidateQueries({ queryKey: ['org'] });
      setShowOrgModal(false);
      emitAppNotification({ message: 'Nom de l organisation mis a jour avec succes.', severity: 'INFO' });
    },
    onError: () => {
      emitAppNotification({ message: 'Impossible de mettre a jour le nom de l organisation.', severity: 'CRITICAL' });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (values: PasswordFormValues) => apiClient.patch('/users/me/password', values),
    onSuccess: () => {
      passwordForm.reset();
      setShowPasswordModal(false);
    },
  });

  return (
    <div className="dashboard-page">
      <div className="page-head">
        <div>
          <p className="page-eyebrow">CONFIGURATION</p>
          <h1 className="page-title">Paramètres</h1>
          <p className="page-sub">Organisation &amp; profil utilisateur</p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 20, maxWidth: 760 }}>
        {/* Organisation info */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '24px 28px' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-hi)', margin: '0 0 18px 0', letterSpacing: '-0.01em' }}>
            Organisation
          </h2>
          <div style={{ display: 'grid', gap: 0 }}>
            {[
              { label: 'Nom', value: orgName ?? '—' },
              { label: 'Devise', value: currency },
              { label: 'Exercice actif', value: fiscalYearLabel ?? fiscalYearId ?? '—' },
              { label: 'Période ouverte', value: currentPeriodLabel ?? currentPeriod ?? '—' },
            ].map(({ label, value }, i, arr) => (
              <div
                key={label}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--text-md)' }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-hi)' }}>{value}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
            <button type="button" onClick={() => { orgForm.reset({ name: orgName ?? '' }); setShowOrgModal(true); }} style={{ padding: '8px 18px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)', cursor: 'pointer', fontWeight: 600 }}>
              Modifier le nom
            </button>
          </div>
        </div>

        {/* User profile */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '24px 28px' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-hi)', margin: '0 0 18px 0', letterSpacing: '-0.01em' }}>
            Mon profil
          </h2>
          <div style={{ display: 'grid', gap: 0 }}>
            {[
              { label: 'Email', value: user?.email ?? '—' },
              { label: 'Rôle', value: user?.role ?? '—' },
            ].map(({ label, value }, i, arr) => (
              <div
                key={label}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '12px 0',
                  borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--text-md)' }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: label === 'Rôle' ? 'var(--terra)' : 'var(--text-hi)' }}>{value}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
            <button type="button" onClick={() => { passwordForm.reset({ current_password: '', new_password: '', confirm_password: '' }); setShowPasswordModal(true); }} style={{ padding: '8px 18px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)', cursor: 'pointer', fontWeight: 600 }}>
              Changer le mot de passe
            </button>
          </div>
        </div>
      </div>

      {showOrgModal ? (
        <ModalShell title="Modifier le nom de l'organisation" onClose={() => setShowOrgModal(false)}>
          <div style={{ display: 'grid', gap: 12 }}>
            <input {...orgForm.register('name')} placeholder="Nom de l'organisation" style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }} />
            {orgForm.formState.errors.name ? <p style={{ margin: 0, color: 'var(--terra)', fontSize: 12 }}>{orgForm.formState.errors.name.message}</p> : null}
            {updateOrganizationMutation.isError ? <p style={{ margin: 0, color: 'var(--terra)', fontSize: 12 }}>Erreur lors de la mise à jour du nom.</p> : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setShowOrgModal(false)} style={{ padding: '8px 18px', border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', cursor: 'pointer' }}>Annuler</button>
              <button type="button" onClick={orgForm.handleSubmit((values) => updateOrganizationMutation.mutate(values))} disabled={updateOrganizationMutation.isPending} style={{ padding: '8px 18px', border: 'none', borderRadius: 8, background: updateOrganizationMutation.isPending ? 'var(--text-lo)' : 'var(--terra)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                {updateOrganizationMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {showPasswordModal ? (
        <ModalShell title="Changer le mot de passe" onClose={() => setShowPasswordModal(false)}>
          <div style={{ display: 'grid', gap: 12 }}>
            <input type="password" {...passwordForm.register('current_password')} placeholder="Mot de passe actuel" style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }} />
            {passwordForm.formState.errors.current_password ? <p style={{ margin: 0, color: 'var(--terra)', fontSize: 12 }}>{passwordForm.formState.errors.current_password.message}</p> : null}
            <input type="password" {...passwordForm.register('new_password')} placeholder="Nouveau mot de passe" style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }} />
            {passwordForm.formState.errors.new_password ? <p style={{ margin: 0, color: 'var(--terra)', fontSize: 12 }}>{passwordForm.formState.errors.new_password.message}</p> : null}
            <input type="password" {...passwordForm.register('confirm_password')} placeholder="Confirmer le nouveau mot de passe" style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }} />
            {passwordForm.formState.errors.confirm_password ? <p style={{ margin: 0, color: 'var(--terra)', fontSize: 12 }}>{passwordForm.formState.errors.confirm_password.message}</p> : null}
            {changePasswordMutation.isError ? <p style={{ margin: 0, color: 'var(--terra)', fontSize: 12 }}>Erreur lors du changement de mot de passe.</p> : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" onClick={() => setShowPasswordModal(false)} style={{ padding: '8px 18px', border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', cursor: 'pointer' }}>Annuler</button>
              <button type="button" onClick={passwordForm.handleSubmit((values) => changePasswordMutation.mutate(values))} disabled={changePasswordMutation.isPending} style={{ padding: '8px 18px', border: 'none', borderRadius: 8, background: changePasswordMutation.isPending ? 'var(--text-lo)' : 'var(--terra)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                {changePasswordMutation.isPending ? 'Mise à jour...' : 'Changer le mot de passe'}
              </button>
            </div>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}
