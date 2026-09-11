import { Link, TABS, tab } from "./router";

export function Nav({ path }: { path: string }) {
  const here = tab(path);

  return (
    <nav>
      {TABS.map(({ path: to, label }) => (
        <Link key={to} to={to} className={to === here ? "here" : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
