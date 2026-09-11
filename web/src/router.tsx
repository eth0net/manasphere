import { type ReactNode, useEffect, useState } from "react";

export const TABS = [
  { path: "/cards", label: "Cards" },
  { path: "/collection", label: "Collection" },
  { path: "/decks", label: "Decks" },
  { path: "/lists", label: "Lists" },
];

export const HOME = "/cards";

// Which tab a path belongs to, drill-downs included. An OAuth callback and a
// cold load of `/` are both on their way here too.
export function tab(path: string): string {
  const found = TABS.find(
    ({ path: at }) => path === at || path.startsWith(`${at}/`),
  );
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
        // A modified click means a new tab or a download, which the browser
        // does better than we would.
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
