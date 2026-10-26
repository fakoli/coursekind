import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SharingPanel } from './SharingPanel';
import type { CourseVisibility } from '../../types';

function setup(pending?: { outcome: 'success' | 'error' }) {
  const writes: { url: string; body: Record<string, string> }[] = [];
  let finish: (() => void) | undefined;
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (init?.method && init.method !== 'GET') {
      writes.push({ url, body: JSON.parse(String(init.body || '{}')) });
      if (pending && url.includes('/courses/first/sharing')) {
        await new Promise<void>(resolve => { finish = resolve; });
        if (pending.outcome === 'error') return new Response(JSON.stringify({ detail: 'Rejected' }), { status: 400 });
      }
    }
    return new Response(JSON.stringify({ recipients: [] }));
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const panel = (resource: 'courses' | 'paths', id: string, visibility: CourseVisibility) =>
    <QueryClientProvider client={client}><SharingPanel resource={resource} id={id} visibility={visibility} /></QueryClientProvider>;
  return { writes, panel, finish: () => finish?.() };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('resets visibility, email and feedback when the resource changes, including course to path', async () => {
  const { panel, writes } = setup();
  const view = render(panel('courses', 'first', 'public'));
  fireEvent.change(screen.getByLabelText('Recipient email'), { target: { value: 'first@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save visibility' }));
  await screen.findByText('Sharing saved');
  view.rerender(panel('courses', 'second', 'private'));
  expect(screen.getByLabelText('Visibility')).toHaveValue('private');
  expect(screen.getByLabelText('Recipient email')).toHaveValue('');
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  fireEvent.click(screen.getByRole('button', { name: 'Save visibility' }));
  await waitFor(() => expect(writes).toContainEqual({ url: '/api/v1/courses/second', body: { visibility: 'private' } }));
  fireEvent.change(screen.getByLabelText('Recipient email'), { target: { value: 'second@example.test' } });
  view.rerender(panel('paths', 'second', 'unlisted'));
  expect(screen.getByLabelText('Visibility')).toHaveValue('unlisted');
  expect(screen.getByLabelText('Recipient email')).toHaveValue('');
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});

it('reconciles changed authoritative visibility instead of preserving a stale draft', async () => {
  const { panel, writes } = setup();
  const view = render(panel('courses', 'first', 'public'));
  fireEvent.change(screen.getByLabelText('Visibility'), { target: { value: 'unlisted' } });
  view.rerender(panel('courses', 'first', 'private'));
  expect(screen.getByLabelText('Visibility')).toHaveValue('private');
  fireEvent.click(screen.getByRole('button', { name: 'Save visibility' }));
  await waitFor(() => expect(writes[0]).toEqual({ url: '/api/v1/courses/first', body: { visibility: 'private' } }));
  // Returning to an older server value must not resurrect the older unsaved draft.
  view.rerender(panel('courses', 'first', 'public'));
  expect(screen.getByLabelText('Visibility')).toHaveValue('public');
});

it.each(['success', 'error'] as const)('isolates a pending old-resource %s from the new form', async outcome => {
  const { panel, writes, finish } = setup({ outcome });
  const view = render(panel('courses', 'first', 'public'));
  fireEvent.change(screen.getByLabelText('Recipient email'), { target: { value: 'old@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Grant access' }));
  await waitFor(() => expect(writes).toHaveLength(1));
  view.rerender(panel('courses', 'second', 'private'));
  fireEvent.change(screen.getByLabelText('Recipient email'), { target: { value: 'new@example.test' } });
  expect(screen.getByRole('button', { name: 'Grant access' })).not.toBeDisabled();
  await act(async () => { finish(); });
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  expect(screen.getByLabelText('Recipient email')).toHaveValue('new@example.test');
  expect(screen.getByLabelText('Visibility')).toHaveValue('private');
  fireEvent.click(screen.getByRole('button', { name: 'Save visibility' }));
  await screen.findByText('Sharing saved');
  expect(screen.getByLabelText('Recipient email')).toHaveValue('new@example.test');
  expect(screen.queryByText(/Could not save sharing/)).not.toBeInTheDocument();
  expect(writes[0]).toEqual({ url: '/api/v1/courses/first/sharing', body: { email: 'old@example.test' } });
  expect(writes[1]).toEqual({ url: '/api/v1/courses/second', body: { visibility: 'private' } });
});
