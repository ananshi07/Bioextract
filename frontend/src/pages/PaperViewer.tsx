import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, Paper, Observation } from "../lib/api";
import { CheckCircle2, XCircle, Sparkles, FileText, Layers, ShieldCheck, ShieldAlert } from "lucide-react";

type Tab = "pdf" | "text";

export default function PaperViewer() {
  const { id } = useParams();
  const paperId = Number(id);
  const [paper, setPaper] = useState<Paper | null>(null);
  const [pages, setPages] = useState<{ page_number: number; text: string }[]>([]);
  const [observations, setObservations] = useState<Observation[]>([]);
  const [tab, setTab] = useState<Tab>("pdf");
  const [activePage, setActivePage] = useState(1);
  const [extracting, setExtracting] = useState(false);
  const [selected, setSelected] = useState<Observation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api.getPaper(paperId).then(setPaper);
    api.getPages(paperId).then(setPages);
    api.getPaperObservations(paperId).then(setObservations);
  };

  useEffect(() => { load(); }, [paperId]);

  const runExtraction = async () => {
    setExtracting(true);
    setError(null);
    try {
      await api.extractPaper(paperId);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setExtracting(false);
    }
  };

  const act = async (obsId: number, action: "approve" | "reject") => {
    if (action === "approve") await api.approveObservation(obsId);
    else await api.rejectObservation(obsId);
    load();
  };

  if (!paper) return <div className="max-w-6xl mx-auto px-6 py-10 text-charcoal/50">Loading...</div>;

  const currentPageText = pages.find((p) => p.page_number === activePage)?.text || "";

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="font-serif text-2xl text-deepgreen leading-tight">{paper.title || paper.filename}</h1>
          <p className="text-sm text-charcoal/50 font-mono mt-1">
            {[paper.authors, paper.journal, paper.pub_year, paper.doi ? `DOI: ${paper.doi}` : null].filter(Boolean).join(" · ") || "Metadata not detected"}
          </p>
        </div>
        <button
          onClick={runExtraction}
          disabled={extracting || pages.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-deepgreen text-offwhite rounded-md text-sm font-medium hover:bg-teal disabled:opacity-40 shrink-0"
        >
          <Sparkles size={16} />
          {extracting ? "Extracting..." : "Run AI Extraction"}
        </button>
      </div>

      {error && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Paper viewer */}
        <div className="bg-white border border-sage/30 rounded-lg overflow-hidden flex flex-col" style={{ height: "70vh" }}>
          <div className="flex border-b border-sage/30 text-sm">
            <button onClick={() => setTab("pdf")} className={`flex-1 py-2 flex items-center justify-center gap-1.5 ${tab === "pdf" ? "bg-sage/20 text-deepgreen font-medium" : "text-charcoal/50"}`}>
              <FileText size={14} /> PDF
            </button>
            <button onClick={() => setTab("text")} className={`flex-1 py-2 flex items-center justify-center gap-1.5 ${tab === "text" ? "bg-sage/20 text-deepgreen font-medium" : "text-charcoal/50"}`}>
              <Layers size={14} /> Extracted Text
            </button>
          </div>
          {tab === "pdf" ? (
            <iframe src={api.paperFileUrl(paperId)} className="flex-1 w-full" title="paper-pdf" />
          ) : (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex gap-1 flex-wrap px-3 py-2 border-b border-sage/20 max-h-24 overflow-y-auto">
                {pages.map((p) => (
                  <button
                    key={p.page_number}
                    onClick={() => setActivePage(p.page_number)}
                    className={`text-xs px-2 py-1 rounded font-mono ${activePage === p.page_number ? "bg-deepgreen text-offwhite" : "bg-sage/20 text-charcoal/70"}`}
                  >
                    {p.page_number}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto p-4 text-sm whitespace-pre-wrap font-mono leading-relaxed">
                {currentPageText || "No text extracted for this page."}
              </div>
            </div>
          )}
        </div>

        {/* Observations */}
        <div className="bg-white border border-sage/30 rounded-lg overflow-hidden flex flex-col" style={{ height: "70vh" }}>
          <div className="px-4 py-2.5 border-b border-sage/30 text-sm font-medium text-deepgreen">
            Extracted Observations ({observations.length})
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-sage/15">
            {observations.length === 0 && (
              <p className="p-4 text-sm text-charcoal/40">No observations yet. Run AI extraction above.</p>
            )}
            {observations.map((o) => (
              <div key={o.id} className="p-3 hover:bg-sage/5 cursor-pointer" onClick={() => setSelected(o)}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{o.biological_entity || "Unnamed entity"}</span>
                  <StatusBadge status={o.validation_status} verified={o.evidence_verified} />
                </div>
                <div className="text-xs text-charcoal/50 font-mono mt-1">
                  {[o.measured_variable, o.value_text, o.unit].filter(Boolean).join(" ")}
                  {o.source_page ? ` · p.${o.source_page}` : ""}
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={(e) => { e.stopPropagation(); act(o.id, "approve"); }} className="flex items-center gap-1 text-xs text-teal hover:underline">
                    <CheckCircle2 size={13} /> Approve
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); act(o.id, "reject"); }} className="flex items-center gap-1 text-xs text-red-600 hover:underline">
                    <XCircle size={13} /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-charcoal/40 flex items-center justify-center p-6 z-20" onClick={() => setSelected(null)}>
          <div className="bg-offwhite rounded-lg max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <h3 className="font-serif text-lg text-deepgreen">{selected.biological_entity}</h3>
              <StatusBadge status={selected.validation_status} verified={selected.evidence_verified} />
            </div>
            <dl className="text-sm space-y-1.5 font-mono">
              <Row label="Measured variable" value={selected.measured_variable} />
              <Row label="Value" value={[selected.value_text, selected.unit].filter(Boolean).join(" ")} />
              <Row label="Condition / Treatment" value={[selected.condition, selected.treatment].filter(Boolean).join(" / ")} />
              <Row label="Sample size" value={selected.sample_size?.toString()} />
              <Row label="P-value" value={selected.p_value?.toString()} />
              <Row label="Confidence" value={selected.confidence != null ? `${Math.round(selected.confidence * 100)}%` : null} />
              <Row label="Source page" value={selected.source_page?.toString()} />
            </dl>
            <div className="mt-4 pt-4 border-t border-sage/30">
              <div className="text-xs uppercase tracking-wide text-charcoal/40 mb-1">Evidence</div>
              <p className="text-sm italic text-charcoal/80">"{selected.evidence_quote || "No evidence recorded."}"</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-charcoal/50">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function StatusBadge({ status, verified }: { status: string; verified: boolean | null }) {
  const map: Record<string, string> = {
    STAGED: "bg-sage/30 text-deepgreen",
    VERIFIED: "bg-teal/20 text-teal",
    EDITED: "bg-blue-100 text-blue-700",
    REJECTED: "bg-red-100 text-red-700",
    NEEDS_REVIEW: "bg-amber-100 text-amber-800",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${map[status] || "bg-gray-100"}`}>
      {verified === false ? <ShieldAlert size={11} /> : verified === true ? <ShieldCheck size={11} /> : null}
      {status}
    </span>
  );
}
