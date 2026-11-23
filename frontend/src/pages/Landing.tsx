import DnaHelix from "../components/DnaHelix";
import Auth from "./Auth";

export default function Landing({ mode = "login" }: { mode?: "login" | "signup" }) {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10 md:py-16">
      <div className="grid min-h-[620px] items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="text-center lg:text-left">
          <div className="mx-auto flex max-w-md justify-center lg:mx-0">
            <DnaHelix size={230} />
          </div>
          <h1 className="mt-6 font-serif text-4xl leading-tight text-deepgreen md:text-5xl">
            Turn scientific literature into structured biological data
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-charcoal/70 lg:mx-0">
            Upload research papers, extract evidence-backed findings, and save your observations in a private account.
          </p>
          <p className="mt-8 text-xs font-mono text-charcoal/40">
            Upload → extract → verify evidence → clean → save
          </p>
        </section>
        <section className="w-full max-w-md justify-self-center lg:justify-self-end">
          <Auth mode={mode} embedded />
        </section>
      </div>
    </main>
  );
}
