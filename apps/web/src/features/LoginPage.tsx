import { FormEvent, useEffect, useState } from 'react';
import { useLogin } from '../hooks/useAuth';

export default function LoginPage(): JSX.Element {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const loginMutation = useLogin();

  const isSubmitting = loginMutation.isPending;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    if (isSubmitting) {
      return;
    }

    loginMutation.mutate({ email: email.trim(), password });
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

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.9rem' }}>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: '10px',
                padding: '0.65rem 0.75rem',
                fontSize: '0.95rem',
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Mot de passe</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: '10px',
                padding: '0.65rem 0.75rem',
                fontSize: '0.95rem',
              }}
            />
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
