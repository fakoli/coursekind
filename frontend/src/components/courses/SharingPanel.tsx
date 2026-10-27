import { useId, useState } from 'react';
import { ChevronDown, Share2 } from 'lucide-react';
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
  const [expanded, setExpanded] = useState(false);
  const panelId = useId();
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
  const sharing = useQuery({ queryKey: ['sharing', resource, id], enabled: expanded, queryFn: () => api.get<Sharing>(`${base}/sharing`) });
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
  const fieldClass = "w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500";
  return <section className="min-w-0 rounded-xl border border-gray-200 bg-white shadow-sm" aria-label="Sharing">
    <h2>
      <button type="button" aria-label="Sharing" aria-expanded={expanded} aria-controls={panelId}
        onClick={() => setExpanded(value => !value)}
        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
        <Share2 className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
        <span className="flex-1 font-medium text-gray-900">Sharing</span>
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium capitalize text-gray-600">{visibility}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
    </h2>
    <div id={panelId} hidden={!expanded} className="border-t border-gray-100 p-4">
      <div className="space-y-5">
        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="grid min-w-0 gap-1.5 text-sm font-medium text-gray-700">Visibility
            <select className={fieldClass} value={audience} disabled={change.isPending}
              onChange={e => setAudienceDraft({ source: visibility, value: e.target.value as CourseVisibility })}>
              <option value="private">Private — invited people</option>
              <option value="unlisted">Unlisted — anyone with the link</option>
              <option value="public">Public — discoverable by everyone</option>
            </select>
          </label>
          <Button onClick={() => change.mutate({ kind: 'visibility', visibility: audience })} disabled={change.isPending}>Save visibility</Button>
        </div>
        <p className="text-sm leading-relaxed text-gray-500">Recipients can study and reuse content. Only the owner can edit.
          {resource === 'paths' && ' Sharing a path does not share its private courses.'}</p>
        <label className="grid min-w-0 gap-1.5 text-sm font-medium text-gray-700">Share link
          <input className={fieldClass} readOnly value={`${window.location.origin}${base}`} />
        </label>
        <form className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end" onSubmit={e => { e.preventDefault(); change.mutate({ kind: 'grant', email }); }}>
          <label className="grid min-w-0 gap-1.5 text-sm font-medium text-gray-700">Recipient email
            <input className={fieldClass} type="email" required value={email} disabled={change.isPending}
              onChange={e => setEmail(e.target.value)} placeholder="Registered account email" />
          </label>
          <Button type="submit" disabled={change.isPending}>Grant access</Button>
        </form>
        {sharing.isError && <p role="alert" className="text-sm text-red-700">Could not load recipients.</p>}
        {!!sharing.data?.recipients.length && <ul className="space-y-3">{sharing.data.recipients.map(recipient => <li key={recipient.id} className="flex flex-wrap items-center justify-between gap-3">
          <span className="min-w-0 break-all text-sm text-gray-700">{recipient.name} ({recipient.email})</span>
          <Button variant="secondary" disabled={change.isPending} onClick={() => change.mutate({ kind: 'revoke', recipient: recipient.id })}
            aria-label={`Revoke access for ${recipient.email}`}>Revoke</Button>
        </li>)}</ul>}
        <p role="status" className="text-sm text-gray-600 empty:hidden">{message}</p>
      </div>
    </div>
  </section>;
}
