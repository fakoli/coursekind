import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Button } from '../common/Button';
import type { CourseVisibility } from '../../types';

type Sharing = { recipients: { id: string; name: string; email: string }[] };
type SharingPanelProps = {
  resource: 'courses' | 'paths'; id: string; visibility: CourseVisibility;
};
type SharingChange =
  | { kind: 'visibility'; visibility: CourseVisibility }
  | { kind: 'grant'; email: string }
  | { kind: 'revoke'; recipient: string };

/** Render only for the owner. Recipient identities come from an owner-only API. */
export function SharingPanel(props: SharingPanelProps) {
  // A cached route can reuse this wrapper. Each resource owns its form and mutation
  // observer, so an old request cannot clear drafts or report errors in the new form.
  return <ResourceSharingPanel key={`${props.resource}:${props.id}`} {...props} />;
}

function ResourceSharingPanel({ resource, id, visibility }: SharingPanelProps) {
  const client = useQueryClient();
  const [audienceDraft, setAudienceDraft] = useState({ source: visibility, value: visibility });
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  // Reconcile changed server authority before committing a render. An effect would
  // briefly expose the old audience after a refetch; unchanged props preserve drafts.
  if (audienceDraft.source !== visibility) {
    setAudienceDraft({ source: visibility, value: visibility });
    setMessage('');
  }
  const audience = audienceDraft.source === visibility ? audienceDraft.value : visibility;
  const base = `/${resource}/${id}`;
  const sharing = useQuery({ queryKey: ['sharing', resource, id], queryFn: () => api.get<Sharing>(`${base}/sharing`) });
  const change = useMutation({
    mutationFn: async (action: SharingChange) => {
      if (action.kind === 'visibility') await api.put(base, { visibility: action.visibility });
      else if (action.kind === 'grant') await api.post(`${base}/sharing`, { email: action.email });
      else await api.delete(`${base}/sharing/${action.recipient}`);
      return action.kind;
    },
    onSuccess: async kind => {
      if (kind === 'grant') setEmail('');
      setMessage(kind === 'revoke' ? 'Access revoked. Public or unlisted links still allow access.' : 'Sharing saved');
      await Promise.all(['sharing', 'courses', 'course', 'paths', 'path', 'progress'].map(key =>
        client.invalidateQueries({ queryKey: [key] })));
    },
    onError: () => setMessage('Could not save sharing. Check the recipient email and try again.'),
  });
  return <section className="rounded-lg border p-4 space-y-3" aria-label="Sharing">
    <h2 className="text-lg font-semibold">Sharing</h2>
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1">Visibility
        <select className="border rounded p-2" value={audience} disabled={change.isPending}
          onChange={e => setAudienceDraft({ source: visibility, value: e.target.value as CourseVisibility })}>
          <option value="private">Private — owner and named recipients</option>
          <option value="unlisted">Unlisted — anyone with the link</option>
          <option value="public">Public — discoverable by everyone</option>
        </select>
      </label>
      <Button onClick={() => change.mutate({ kind: 'visibility', visibility: audience })} disabled={change.isPending}>Save visibility</Button>
    </div>
    <p className="text-sm text-gray-600">Recipients can study and reuse content. Only the owner can edit.
      {resource === 'paths' && ' Sharing a path does not share its private courses.'}</p>
    <label className="grid gap-1">Share link<input className="border rounded p-2" readOnly value={`${window.location.origin}${base}`} /></label>
    <form className="flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); change.mutate({ kind: 'grant', email }); }}>
      <label className="grid gap-1">Recipient email<input className="border rounded p-2" type="email" required
        value={email} disabled={change.isPending} onChange={e => setEmail(e.target.value)} placeholder="Registered account email" /></label>
      <Button type="submit" disabled={change.isPending}>Grant access</Button>
    </form>
    {sharing.isError && <p role="alert">Could not load recipients.</p>}
    <ul className="space-y-2">{sharing.data?.recipients.map(recipient => <li key={recipient.id} className="flex items-center gap-3">
      <span>{recipient.name} ({recipient.email})</span>
      <Button variant="secondary" disabled={change.isPending} onClick={() => change.mutate({ kind: 'revoke', recipient: recipient.id })}
        aria-label={`Revoke access for ${recipient.email}`}>Revoke</Button>
    </li>)}</ul>
    <p role="status">{message}</p>
  </section>;
}
