import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { TimezoneSettings } from './TimezoneSettings';
import { installJourneyApi, renderJourney } from '../../test/journeyApi';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('saves a valid IANA timezone and keeps it on remount', async () => {
  installJourneyApi();
  const mount = () => renderJourney(<TimezoneSettings />, '/settings', '/settings');
  mount();
  const input = await screen.findByRole('textbox', { name: 'Study timezone' });
  fireEvent.change(input, { target: { value: 'Asia/Tokyo' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save timezone' }));
  await screen.findByText('Timezone saved.');
  cleanup();
  mount();
  expect(await screen.findByRole('textbox', { name: 'Study timezone' })).toHaveValue('Asia/Tokyo');
});
