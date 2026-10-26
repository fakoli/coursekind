import { Input } from './Input';
import { Textarea } from './Textarea';
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderJourney, installJourneyApi } from '../../test/journeyApi';
import { Modal } from './Modal';
import { CourseCard } from '../courses/CourseCard';
import type { CourseResponse } from '../../types';
afterEach(cleanup);
it('keeps course card actions outside links', async () => {
  installJourneyApi();
  renderJourney(<CourseCard course={{ id:'c',title:'Course',difficulty:'beginner',tags:[],source:'database' } as unknown as CourseResponse} onAddToPath={() => {}} />, "/courses", "/courses");
  const action = await screen.findByRole('button', { name: /Add to path/i });
  expect(action.closest('a')).toBeNull();
  expect(screen.getByRole('link', { name: 'Course' })).toHaveAttribute('href', '/courses/c');
});
it('traps keyboard focus around enabled actions and restores the trigger on Escape', async () => {
  function Harness() { const [open, setOpen] = useState(false); return <><button onClick={() => setOpen(true)}>Open</button><Modal isOpen={open} title="Action" onClose={() => setOpen(false)}><button>Save</button><button disabled>Unavailable</button></Modal></>; }
  render(<Harness />);
  const trigger = screen.getByRole('button', { name: 'Open' }); trigger.focus(); fireEvent.click(trigger);
  const close = screen.getByRole('button', { name: 'Close modal' });
  await waitFor(() => expect(close).toHaveFocus());
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
  expect(screen.getByRole('button', { name: 'Save' })).toHaveFocus();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});

it('associates shared form labels and errors even when callers omit ids', () => {
  render(<><Textarea label="Front" error="Enter a question" /><Textarea label="Back" /><Input label="Title" /></>);
  expect(screen.getByRole('textbox', { name: 'Front' })).toHaveAccessibleDescription('Enter a question');
  expect(screen.getByRole('textbox', { name: 'Back' })).toHaveAttribute('id');
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveAttribute('id');
  expect(new Set(screen.getAllByRole('textbox').map(input => input.id)).size).toBe(3);
});
