import { type ReactNode, useEffect, useState } from "react";

export const TABS = [
  { path: "/cards", label: "Cards" },
  { path: "/collection", label: "Collection" },
  { path: "/decks", label: "Decks" },
  { path: "/lists", label: "Lists" },
];

export const HOME = "/cards";

// A tab and everything it drills down into.
function within(path: string, at: string): boolean {
  return path === at || path.startsWith(`${at}/`);
}

// Whether the bar can mark this path. An OAuth callback and a bare `/` can't,
// and are the only paths anything rewrites.
export function known(path: string): boolean {
  return TABS.some(({ path: at }) => within(path, at));
}

export function tab(path: string): string {
  const found = TABS.find(({ path: at }) => within(path, at));
  return found ? found.path : HOME;
}

// Corrects the address bar without adding a step to go back through.
export function replace(path: string): void {
  if (path === location.pathname) return;
  history.replaceState(null, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
}

export function navigate(path: string): void {
  if (path === location.pathname) return;
  history.pushState(null, "", path);
  dispatchEvent(new PopStateEvent("popstate"));
}

export function usePath(): string {
  const [path, setPath] = useState(location.pathname);

  useEffect(() => {
    const listen = () => setPath(location.pathname);
    addEventListener("popstate", listen);
    return () => removeEventListener("popstate", listen);
  }, []);

  return path;
}

export function Link({
  to,
  className,
  children,
}: {
  to: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={to}
      className={className}
      onClick={(event) => {
        // A modified click is the browser's to answer, not ours.
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
