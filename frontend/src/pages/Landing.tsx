import { Link } from "react-router-dom";
import DnaHelix from "../components/DnaHelix";

export default function Landing() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-20 text-center">
      <DnaHelix />
      <h1 className="font-serif text-4xl md:text-5xl text-deepgreen mt-8 leading-tight">
        Turn Scientific Literature Into Structured Biological Data
      </h1>
      <p className="text-charcoal/70 mt-5 text-lg max-w-2xl mx-auto">
        Extract, verify, clean, and organize biological research data from scientific literature.
      </p>
      <Link
        to="/papers"
        className="inline-block mt-8 px-6 py-3 bg-deepgreen text-offwhite rounded-md font-medium hover:bg-teal transition-colors"
      >
        Start Analyzing
      </Link>
      <p className="text-xs text-charcoal/40 mt-10 font-mono">
        MVP scope: upload → extract → verify evidence → clean → SQLite. Statistical analysis is a future phase.
      </p>
    </div>
  );
}
