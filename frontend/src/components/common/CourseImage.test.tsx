import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CourseImage } from './CourseImage';
import { MarkdownRenderer } from './MarkdownRenderer';
import { CourseCard } from '../courses/CourseCard';
import type { CourseResponse } from '../../types';

const identity = vi.hoisted(() => ({ user: { id: 'owner' }, isLoading: false }));
vi.mock('./AuthProvider', () => ({ useAuthContext: () => identity }));
const RealURL = URL;

beforeEach(() => {
  identity.user = { id: 'owner' };
  localStorage.setItem('token', 'synthetic-owner-token');
  vi.stubGlobal('URL', class extends RealURL {
    static createObjectURL = vi.fn(() => 'blob:synthetic');
    static revokeObjectURL = vi.fn();
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

it('loads local markdown images using a header and revokes their blob on unmount', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(new Blob(['synthetic'])));
  vi.stubGlobal('fetch', fetcher);
  const view = render(<MarkdownRenderer content="![Private diagram](/api/v1/uploads/courses/c1/images/test.png)" />);
  const image = await screen.findByAltText('Private diagram');
  expect(image).toHaveAttribute('src', 'blob:synthetic');
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/api/v1/uploads/courses/c1/images/test.png'), expect.objectContaining({
    headers: { Authorization: 'Bearer synthetic-owner-token' }, cache: 'no-store', redirect: 'error', credentials: 'omit',
  }));
  expect(fetcher.mock.calls[0][0]).not.toContain('synthetic-owner-token');
  view.unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic');
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
});

it('never fetches or sends credentials to arbitrary remote image origins', () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  render(<CourseImage src="https://outside.example/api/v1/uploads/courses/c1/images/x.png" alt="External" />);
  expect(screen.getByAltText('External')).toHaveAttribute('src', 'https://outside.example/api/v1/uploads/courses/c1/images/x.png');
  expect(fetcher).not.toHaveBeenCalled();
});

it('aborts pending image reads on identity changes and never mounts the old result', async () => {
  const pending: { resolve: (response: Response) => void; signal: AbortSignal }[] = [];
  const fetcher = vi.fn((_url: string, options: RequestInit) => new Promise<Response>(resolve => {
    pending.push({ resolve, signal: options.signal as AbortSignal });
  }));
  vi.stubGlobal('fetch', fetcher);
  const view = render(<CourseImage src="/api/v1/uploads/courses/c1/images/x.png" alt="Secret" />);
  await waitFor(() => expect(pending).toHaveLength(1));
  identity.user = { id: 'recipient' };
  localStorage.setItem('token', 'synthetic-recipient-token');
  view.rerender(<CourseImage src="/api/v1/uploads/courses/c1/images/x.png" alt="Secret" />);
  expect(pending[0].signal.aborted).toBe(true);
  await waitFor(() => expect(pending).toHaveLength(2));
  pending[0].resolve(new Response(new Blob(['owner secret'])));
  pending[1].resolve(new Response('', { status: 404 }));
  expect(await screen.findByText('Image unavailable: Secret')).toBeInTheDocument();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  view.unmount();
  expect(pending[1].signal.aborted).toBe(true);
});

it('clears a loaded blob immediately when the identity changes', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(new Response(new Blob(['secret'])))
    .mockResolvedValue(new Response('', { status: 404 }));
  vi.stubGlobal('fetch', fetcher);
  const view = render(<CourseImage src="/api/v1/uploads/courses/c1/images/x.png" alt="Secret" />);
  expect(await screen.findByAltText('Secret')).toHaveAttribute('src', 'blob:synthetic');
  identity.user = { id: 'other' };
  view.rerender(<CourseImage src="/api/v1/uploads/courses/c1/images/x.png" alt="Secret" />);
  expect(screen.queryByAltText('Secret')).not.toBeInTheDocument();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic');
  expect(await screen.findByText('Image unavailable: Secret')).toBeInTheDocument();
});

it('uses the same protected renderer for course thumbnails', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(new Blob(['thumbnail'])));
  vi.stubGlobal('fetch', fetcher);
  const course = { id: 'c1', title: 'Shared course', thumbnail_url: '/api/v1/uploads/courses/c1/images/x.png',
    difficulty: 'beginner', tags: [], author_name: 'Author', module_count: 1, times_added: 0 } as unknown as CourseResponse;
  const { container } = render(<MemoryRouter><CourseCard course={course} /></MemoryRouter>);
  await waitFor(() => expect(container.querySelector('img')).toHaveAttribute('src', 'blob:synthetic'));
  expect(fetcher).toHaveBeenCalledTimes(1);
});
