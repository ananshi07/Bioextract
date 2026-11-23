import { useEffect, useState } from "react";
import { Navigate, Routes, Route, useNavigate } from "react-router-dom";
import Nav from "./components/Nav";
import Landing from "./pages/Landing";
import Papers from "./pages/Papers";
import PaperViewer from "./pages/PaperViewer";
import Dataset from "./pages/Dataset";
import Future from "./pages/Future";
import { api, getAuthToken, setAuthToken } from "./lib/api";

type User = { id: number; email: string };

export default function App() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    if (!getAuthToken()) {
      setAuthLoading(false);
      return;
    }
    api.me()
      .then(setUser)
      .catch(() => setAuthToken(null))
      .finally(() => setAuthLoading(false));
  }, []);

  const logout = () => {
    api.logout().finally(() => {
      setUser(null);
      navigate("/login");
    });
  };

  const protectedRoute = (element: JSX.Element) => {
    if (authLoading) return <div className="mx-auto max-w-6xl px-6 py-10 text-charcoal/50">Loading account...</div>;
    return user ? element : <Navigate to="/login" replace />;
  };

  return (
    <div className="min-h-screen">
      <Nav user={user} onLogout={logout} />
      <Routes>
        <Route path="/" element={user ? <Navigate to="/papers" replace /> : <Landing mode="login" />} />
        <Route path="/login" element={user ? <Navigate to="/papers" replace /> : <Landing mode="login" />} />
        <Route path="/signup" element={user ? <Navigate to="/papers" replace /> : <Landing mode="signup" />} />
        <Route path="/papers" element={protectedRoute(<Papers />)} />
        <Route path="/papers/:id" element={protectedRoute(<PaperViewer />)} />
        <Route path="/dataset" element={protectedRoute(<Dataset />)} />
        <Route path="/analysis" element={protectedRoute(<Future label="Analysis" />)} />
        <Route path="/visualizations" element={protectedRoute(<Future label="Visualizations" />)} />
        <Route path="/reports" element={protectedRoute(<Future label="Reports" />)} />
      </Routes>
    </div>
  );
}
