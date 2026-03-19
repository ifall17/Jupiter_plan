import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useLogin } from '../hooks/useAuth';

const loginSchema = z.object({
  email: z.email('Email invalide').trim(),
  password: z.string().min(1, 'Le mot de passe est obligatoire'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage(): JSX.Element {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const loginMutation = useLogin();

  const isSubmitting = loginMutation.isPending;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = (values: LoginFormValues) => {
    setErrorMessage(null);

    if (isSubmitting) {
      return;
    }

    loginMutation.mutate({ email: values.email.trim(), password: values.password });
  };

  useEffect(() => {
    const handleError = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      if (typeof customEvent.detail === 'string' && customEvent.detail.trim()) {
        setErrorMessage(customEvent.detail);
      }
    };

    window.addEventListener('app:error', handleError as EventListener);
    return () => window.removeEventListener('app:error', handleError as EventListener);
  }, []);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '1.5rem',
      }}
    >
      <section
        className="jp-surface jp-border"
        style={{
          width: '100%',
          maxWidth: '440px',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderRadius: '14px',
          padding: '1.5rem',
          boxShadow: '0 10px 30px rgba(26, 26, 46, 0.08)',
        }}
      >
        <header style={{ marginBottom: '1rem' }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Connexion</h1>
          <p className="jp-muted-text" style={{ margin: '0.4rem 0 0' }}>
            Connectez-vous pour acceder a Jupiter Plan.
          </p>
        </header>

        <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'grid', gap: '0.9rem' }}>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              {...register('email')}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: '10px',
                padding: '0.65rem 0.75rem',
                fontSize: '0.95rem',
              }}
            />
            {errors.email ? (
              <span style={{ color: '#b42318', fontSize: '0.8rem' }}>{errors.email.message}</span>
            ) : null}
          </label>

          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Mot de passe</span>
            <input
              type="password"
              autoComplete="current-password"
              {...register('password')}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: '10px',
                padding: '0.65rem 0.75rem',
                fontSize: '0.95rem',
              }}
            />
            {errors.password ? (
              <span style={{ color: '#b42318', fontSize: '0.8rem' }}>{errors.password.message}</span>
            ) : null}
          </label>

          <button
            type="submit"
            className="jp-btn-terra"
            disabled={isSubmitting}
            style={{
              border: 'none',
              borderRadius: '10px',
              padding: '0.72rem 0.95rem',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.7 : 1,
            }}
          >
            {isSubmitting ? 'Connexion en cours...' : 'Se connecter'}
          </button>

          {errorMessage ? (
            <p
              role="alert"
              style={{
                margin: 0,
                fontSize: '0.9rem',
                color: '#b42318',
              }}
            >
              {errorMessage}
            </p>
          ) : null}
        </form>
      </section>
    </main>
  );
}
