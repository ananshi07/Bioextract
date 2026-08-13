export default function Future({ label }: { label: string }) {
  return (
    <div className="max-w-2xl mx-auto px-6 py-24 text-center">
      <h1 className="font-serif text-2xl text-deepgreen mb-3">{label}</h1>
      <p className="text-charcoal/60">
        This section is planned for a future phase, once R is integrated for statistical analysis on the
        standardized SQLite dataset. It does not contain real functionality yet.
      </p>
    </div>
  );
}
