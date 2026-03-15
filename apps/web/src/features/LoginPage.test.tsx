import { screen } from '@testing-library/react';
import App from '../App';
import { renderWithProviders } from '../test/test-utils';

describe('LoginPage route', () => {
  it('renders login route content', () => {
    renderWithProviders(<App />, { route: '/login' });

    expect(screen.getByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
  });
});
