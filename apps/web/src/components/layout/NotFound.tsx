import { Link } from 'react-router-dom';

export default function NotFound(): JSX.Element {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 jp-bg">
      <div className="max-w-md w-full rounded-xl border p-8 text-center jp-surface jp-border">
        <h1 className="text-2xl font-semibold jp-text">
          Page introuvable
        </h1>
        <p className="mt-2 text-sm jp-muted-text">
          La page demandee est indisponible.
        </p>
        <Link
          to="/dashboard"
          className="inline-flex mt-6 px-4 py-2 rounded-md text-sm font-medium jp-btn-terra"
        >
          Retour au dashboard
        </Link>
      </div>
    </div>
  );
}
