import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the adult-only service boundary', () => {
    render(<MemoryRouter><App /></MemoryRouter>);
    expect(screen.getByText('转念训练')).toBeInTheDocument();
    expect(screen.getByText('仅面向成年人')).toBeInTheDocument();
  });
});
