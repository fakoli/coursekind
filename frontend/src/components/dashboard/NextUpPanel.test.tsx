import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { NextUpPanel } from './NextUpPanel';

afterEach(cleanup);

it('uses an honest empty state when there are no unfinished courses', () => {
  render(
    <MemoryRouter>
      <NextUpPanel items={[]} />
    </MemoryRouter>,
  );

  expect(screen.getByText(/No unfinished courses right now/i)).toBeInTheDocument();
  expect(screen.queryByText(/haven't started any courses/i)).not.toBeInTheDocument();
});
