import { useState } from 'react';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '../../hooks/useNotifications';
import { Card, CardContent, CardHeader } from './Card';
import { Input } from './Input';
import { Button } from './Button';

export function TimezoneSettings() {
  const { data: prefs, isLoading, error } = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const [draft, setDraft] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [invalid, setInvalid] = useState(false);
  return <Card><CardHeader><h3 className="font-medium">Study timezone</h3></CardHeader><CardContent>
    {isLoading ? <p>Loading timezone…</p> : error ? <p role="alert">Could not load your timezone. Reload and try again.</p> : <form className="space-y-3" onSubmit={async event => {
      event.preventDefault();
      const name = (draft ?? prefs?.timezone ?? 'UTC').trim();
      try {
        new Intl.DateTimeFormat('en', { timeZone: name });
      } catch {
        setInvalid(true);
        setMessage('Enter a valid IANA timezone, such as UTC or America/Los_Angeles.');
        return;
      }
      try {
        await update.mutateAsync({ timezone: name });
        setInvalid(false);
        setMessage('Timezone saved.');
      } catch {
        setInvalid(true);
        setMessage('Could not save your timezone. Check the IANA name and try again.');
      }
    }}>
      <Input id="study-timezone" label="Study timezone" value={draft ?? prefs?.timezone ?? 'UTC'} onChange={event => setDraft(event.target.value)} placeholder="America/Los_Angeles" />
      <p className="text-sm text-gray-600">Controls study-day streaks and notification times. Default: UTC. Changing it recalculates study days from your saved history.</p>
      <Button type="submit" disabled={update.isPending} isLoading={update.isPending}>Save timezone</Button>
      {message && <p role={invalid ? 'alert' : 'status'}>{message}</p>}
    </form>}
  </CardContent></Card>;
}
