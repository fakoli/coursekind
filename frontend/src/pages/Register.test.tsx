import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { Register } from './Register';
import { installJourneyApi, renderJourney } from '../test/journeyApi';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it.each(['login', 'verification'])('offers sign-in without another registration after account creation and %s failure', async failure => {
  installJourneyApi(); localStorage.removeItem('token');
  let registrations = 0;
  vi.stubGlobal('fetch', async (input: string) => {
    if (input.endsWith('/auth/register')) { registrations++; return new Response('{"id":"new"}'); }
    if (input.endsWith('/auth/login')) return failure === 'login'
      ? new Response('{"detail":"Temporary login failure"}', { status: 503 })
      : new Response('{"access_token":"new-token"}');
    if (input.endsWith('/auth/me')) return new Response('{"detail":"Invalid token"}', { status: 401 });
    throw new Error('Unexpected request');
  });
  renderJourney(<Register />, '/register', '/register');
  fireEvent.change(await screen.findByLabelText(/Name/), { target: { value: 'New learner' } });
  fireEvent.change(screen.getByLabelText(/Email/), { target: { value: 'new@example.com' } });
  fireEvent.change(screen.getByLabelText(/Password/), { target: { value: 'synthetic-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/account was created/i);
  expect(screen.queryByRole('button', { name: 'Create account' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  expect(registrations).toBe(1);
});
