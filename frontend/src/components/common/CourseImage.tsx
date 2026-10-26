import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { useAuthContext } from './AuthProvider';

/** Only the configured API's course media may receive an Authorization header. */
function localCourseMediaUrl(src: string | undefined): string | null {
  if (!src) return null;
  const base = new URL(import.meta.env.VITE_API_URL || '/api/v1', window.location.origin);
  const mediaPrefix = `${base.pathname.replace(/\/$/, '')}/uploads/courses/`;
  try {
    // Server-authored markdown uses the canonical /api/v1 path, even with a remote API.
    const url = src.startsWith('/api/v1/uploads/courses/')
      ? new URL(`${mediaPrefix}${src.slice('/api/v1/uploads/courses/'.length)}`, base)
      : new URL(src, window.location.origin);
    return url.origin === base.origin && url.pathname.startsWith(mediaPrefix)
      && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function CourseImage({ src, alt = '', ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  const { user, isLoading } = useAuthContext();
  const localUrl = localCourseMediaUrl(src);
  const token = localStorage.getItem('token');
  const identity = `${user?.id ?? 'anonymous'}:${token ?? ''}:${localUrl ?? ''}`;
  const [loaded, setLoaded] = useState<{ identity: string; url: string | null; failed: boolean } | null>(null);

  useEffect(() => {
    if (!localUrl || isLoading) return;
    let active = true;
    let blobUrl: string | null = null;
    let controller: AbortController | null = null;
    const release = () => {
      controller?.abort();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = null;
    };
    const load = async () => {
      release();
      const current = new AbortController();
      controller = current;
      setLoaded({ identity, url: null, failed: false });
      try {
        const response = await fetch(localUrl, {
          signal: current.signal, redirect: 'error', credentials: 'omit', cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!response.ok) throw new Error('Image unavailable');
        const blob = await response.blob();
        if (!active || current.signal.aborted) return;
        blobUrl = URL.createObjectURL(blob);
        setLoaded({ identity, url: blobUrl, failed: false });
      } catch {
        if (active && !current.signal.aborted) setLoaded({ identity, url: null, failed: true });
      }
    };
    void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', refresh);
    return () => { active = false; release(); window.removeEventListener('focus', refresh); };
  }, [localUrl, identity, isLoading, token]);

  if (!localUrl) return <img {...props} src={src} alt={alt} />;
  const current = loaded?.identity === identity ? loaded : null;
  if (!current?.url) return <span className={props.className} role={current?.failed ? 'status' : undefined}>
    {current?.failed ? `Image unavailable${alt ? `: ${alt}` : ''}` : 'Loading image…'}
  </span>;
  return <img {...props} src={current.url} alt={alt} />;
}
