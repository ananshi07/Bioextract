import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, Observation } from "../lib/api";

const COLUMNS: { key: keyof Observation; label: string }[] = [
  { key: "paper_title", label: "Paper" },
  { key: "biological_entity", label: "Entity" },
  { key: "entity_type", label: "Type" },
  { key: "organism", label: "Organism" },
  { key: "condition", label: "Condition" },
  { key: "treatment", label: "Treatment" },
  { key: "measured_variable", label: "Measured Variable" },
  { key: "value_text", label: "Value" },
  { key: "unit", label: "Unit" },
  { key: "sample_size", label: "N" },
  { key: "p_value", label: "P-value" },
  { key: "effect", label: "Effect" },
  { key: "source_page", label: "Page" },
  { key: "validation_status", label: "Status" },
];

export default function Dataset() {
  const [rows, setRows] = useState<Observation[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sortKey, setSortKey] = useState<keyof Observation>("biological_entity");
  const [selected, setSelected] = useState<Observation | null>(null);

  useEffect(() => { api.getDataset().then(setRows); }, []);

  const visibleColumns = useMemo(
    () => COLUMNS.filter((c) => rows.some((r) => r[c.key] !== null && r[c.key] !== undefined && r[c.key] !== "")),
    [rows]
  );

  const filtered = rows
    .filter((r) => statusFilter === "ALL" || r.validation_status === statusFilter)
    .filter((r) =>
      !search ||
      JSON.stringify(r).toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? "")));

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <h1 className="font-serif text-2xl text-deepgreen mb-1">Unified Observation Dataset</h1>
      <p className="text-sm text-charcoal/50 mb-6">
        Standardized observations from all papers, ready for future cross-paper statistical analysis (R integration - planned).
      </p>

      <div className="flex gap-3 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search dataset..."
          className="border border-sage/50 rounded-md px-3 py-1.5 text-sm bg-white flex-1"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-sage/50 rounded-md px-3 py-1.5 text-sm bg-white"
        >
          {["ALL", "STAGED", "VERIFIED", "EDITED", "REJECTED", "NEEDS_REVIEW"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as keyof Observation)}
          className="border border-sage/50 rounded-md px-3 py-1.5 text-sm bg-white"
        >
          {visibleColumns.map((c) => (
            <option key={c.key} value={c.key}>Sort: {c.label}</option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <p className="text-charcoal/50 text-sm">No observations yet. Extract data from a paper first.</p>
      ) : (
        <div className="bg-white border border-sage/30 rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-sage/15 text-left">
                {visibleColumns.map((c) => (
                  <th key={c.key} className="px-3 py-2 font-medium text-charcoal/70 whitespace-nowrap">{c.label}</th>
                ))}
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sage/15">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-sage/5 cursor-pointer" onClick={() => setSelected(r)}>
                  {visibleColumns.map((c) => (
                    <td key={c.key} className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                      {String(r[c.key] ?? "—")}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <Link to={`/papers/${r.paper_id}`} onClick={(e) => e.stopPropagation()} className="text-teal text-xs hover:underline">
                      Open paper
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-charcoal/40 flex items-center justify-center p-6 z-20" onClick={() => setSelected(null)}>
          <div className="bg-offwhite rounded-lg max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-serif text-lg text-deepgreen mb-3">{selected.biological_entity}</h3>
            <div className="text-xs uppercase tracking-wide text-charcoal/40 mb-1">Evidence</div>
            <p className="text-sm italic mb-3">"{selected.evidence_quote || "No evidence recorded."}"</p>
            <p className="text-xs text-charcoal/50">Source page {selected.source_page ?? "—"} · Confidence {selected.confidence != null ? `${Math.round(selected.confidence * 100)}%` : "—"}</p>
          </div>
        </div>
      )}
    </div>
  );
}
