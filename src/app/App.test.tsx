import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the adult-only service boundary', () => {
    render(<MemoryRouter><App /></MemoryRouter>);
    expect(screen.getByText('杞康璁粌')).toBeInTheDocument();
    expect(screen.getByText('浠呴潰鍚戞垚骞翠汉')).toBeInTheDocument();
  });
});
