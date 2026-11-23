import { Link, useLocation } from "react-router-dom";

const LINKS = [
  { to: "/papers", label: "Papers", active: true },
  { to: "/dataset", label: "Dataset", active: true },
  { to: "/analysis", label: "Analysis", active: false },
  { to: "/visualizations", label: "Visualizations", active: false },
  { to: "/reports", label: "Reports", active: false },
];

export default function Nav({
  user,
  onLogout,
}: {
  user: { id: number; email: string } | null;
  onLogout: () => void;
}) {
  const loc = useLocation();
  return (
    <header className="border-b border-sage/40 bg-offwhite/95 backdrop-blur sticky top-0 z-10">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link to="/" className="font-serif text-xl text-deepgreen font-semibold tracking-tight">
          BioExtract
        </Link>
        <nav className="flex gap-1 text-sm">
          {user && (
            <span className="hidden px-2 py-1.5 text-xs text-charcoal/55 sm:inline" title={user.email}>
              {user.email}
            </span>
          )}
          {LINKS.map((l) => {
            const isActive = loc.pathname.startsWith(l.to);
            return (
              <Link
                key={l.to}
                to={l.active ? l.to : "#"}
                onClick={(e) => !l.active && e.preventDefault()}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  isActive ? "bg-deepgreen text-offwhite" : l.active ? "text-charcoal hover:bg-sage/20" : "text-charcoal/35 cursor-not-allowed"
                }`}
                title={l.active ? undefined : "Planned - future phase"}
              >
                {l.label}
                {!l.active && <span className="ml-1 text-[10px] uppercase tracking-wide">soon</span>}
              </Link>
            );
          })}
          {user ? (
            <button
              type="button"
              onClick={onLogout}
              className="ml-1 rounded-md px-3 py-1.5 text-charcoal hover:bg-sage/20"
            >
              Sign out
            </button>
          ) : (
            <Link
              to="/login"
              className="ml-1 rounded-md px-3 py-1.5 text-charcoal hover:bg-sage/20"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
