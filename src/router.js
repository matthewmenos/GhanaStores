/** History API navigation shared by the public site, seller PWA, and admin. */
import { useEffect, useState } from 'react';

export function navigate(path, { replace = false } = {}) {
  const next = path.startsWith('/') ? path : `/${path}`;
  if (window.location.pathname + window.location.search === next) return;
  window.history[replace ? 'replaceState' : 'pushState']({}, '', next);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function usePathname() {
  const read = () => {
    const path = window.location.pathname || '/';
    if (path === '/' || path === '') return '/';
    return path.replace(/\/+$/, '') || '/';
  };
  const [pathname, setPathname] = useState(read);
  useEffect(() => {
    const onChange = () => setPathname(read());
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
  }, []);
  return pathname;
}
