import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { Settings } from './Settings';
import { AdminDashboard } from './admin/AdminDashboard';
import { installJourneyApi, renderJourney } from '../test/journeyApi';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
vi.mock('../components/common/AIPreferences', () => ({ AIPreferences: () => null }));
it('denies non-admin navigation before any admin request', async () => {
  installJourneyApi(); const original = fetch; const requests: string[] = [];
  vi.stubGlobal('fetch', (input: string, options?: RequestInit) => { requests.push(input); return original(input, options); });
  renderJourney(<AdminDashboard />, '/admin', '/admin');
  await screen.findByText(/Admin privileges required/);
  expect(requests.some(path => path.includes('/admin/'))).toBe(false);
});
it('announces toggles and unconfigured delivery feedback', async () => {
  installJourneyApi(); const original = fetch;
  vi.stubGlobal('fetch', (input: string, options?: RequestInit) => input.includes('/notifications/preferences')
    ? Promise.resolve(new Response(JSON.stringify({ email_enabled: true, daily_quiz_enabled: false, sms_enabled: false, email_available: false, sms_available: false, timezone: 'UTC' })))
    : original(input, options));
  renderJourney(<Settings />, '/settings', '/settings');
  expect(await screen.findByRole('switch', { name: 'Email notifications' })).toBeChecked();
  expect(screen.getByRole('button', { name: 'Test Email' })).toBeDisabled();
  expect(screen.getByText(/Email delivery is unavailable/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '555-1234' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Number' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/E.164/);
});
