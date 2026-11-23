import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";

export default function Auth({
  mode,
  embedded = false,
}: {
  mode: "login" | "signup";
  embedded?: boolean;
}) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isSignup = mode === "signup";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isSignup) await api.signup(email, password);
      else await api.login(email, password);
      navigate("/papers");
      window.location.reload();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const panel = (
      <div className="rounded-xl border border-sage/30 bg-white p-7 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal">BioExtract account</p>
        <h1 className="mt-2 font-serif text-3xl text-deepgreen">
          {isSignup ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-2 text-sm text-charcoal/55">
          {isSignup
            ? "Save your papers and extracted datasets to this account."
            : "Sign in to open your saved papers and observations."}
        </p>

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm text-charcoal/70">
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-sage/50 bg-offwhite px-3 py-2 text-charcoal"
            />
          </label>
          <label className="block text-sm text-charcoal/70">
            Password
            <input
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
              minLength={isSignup ? 8 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-sage/50 bg-offwhite px-3 py-2 text-charcoal"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-deepgreen px-4 py-2.5 text-sm font-medium text-white hover:bg-teal disabled:opacity-50"
          >
            {submitting ? "Please wait..." : isSignup ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-charcoal/55">
          {isSignup ? "Already have an account?" : "New to BioExtract?"}{" "}
          <Link to={isSignup ? "/login" : "/signup"} className="font-medium text-teal hover:underline">
            {isSignup ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </div>
  );

  return embedded ? panel : (
    <main className="mx-auto max-w-md px-6 py-16">{panel}</main>
  );
}
