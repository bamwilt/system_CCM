import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

describe('App', () => {
  it('renders home page', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>
    );
    expect(screen.getByText(/Sistema de Gestion de Pagos y Matriculas/i)).toBeInTheDocument();
  });
});
