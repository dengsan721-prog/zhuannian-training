import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AdultGatePage } from './AdultGatePage';

describe('AdultGatePage', () => {
  it('limits the service to adults and states the crisis boundary', () => {
    render(<AdultGatePage />);

    expect(screen.getByRole('heading', { name: '仅面向成年人' })).toBeInTheDocument();
    expect(screen.getByText('本服务不是急救或危机热线')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '我已年满18周岁，继续' })).toHaveAttribute('href', '#/join');
  });
});
