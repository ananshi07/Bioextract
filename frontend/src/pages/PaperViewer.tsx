import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, Paper, Observation } from "../lib/api";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Layers,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";

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
  const [overviewExpanded, setOverviewExpanded] = useState(false);

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
  const abstract = paper.abstract?.replace(/\s+/g, " ").trim();
  const outcomeHighlights = Array.from(
    new Set(observations.map((o) => o.effect?.trim()).filter((effect): effect is string => Boolean(effect)))
  ).slice(0, 3);
  const overviewText = abstract
    || (outcomeHighlights.length > 0
      ? `Extracted results include: ${outcomeHighlights.join(". ")}.`
      : observations.length > 0
        ? `${observations.length} findings were extracted. Open a finding below to review its details and source evidence.`
        : "The paper's structured findings will appear here after AI extraction.");
  const verifiedCount = observations.filter((o) => o.evidence_verified).length;

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

      <section className="mb-6 rounded-xl border border-sage/30 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal">Paper overview</p>
            <p className="mt-1 text-xs text-charcoal/50">
              {abstract ? "Abstract detected in the paper" : observations.length > 0 ? "Brief overview from extracted findings" : "No abstract was detected in the PDF"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOverviewExpanded((expanded) => !expanded)}
            aria-expanded={overviewExpanded}
            className="flex shrink-0 items-center gap-1 text-xs font-medium text-teal hover:text-deepgreen"
          >
            {overviewExpanded ? "Show less" : abstract ? "Read abstract" : "Read more"}
            {overviewExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>
        <p
          className={`mt-3 text-sm leading-6 text-charcoal/80 ${!overviewExpanded ? "line-clamp-4" : ""}`}
        >
          {overviewText}
        </p>
        {observations.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-sage/20 pt-3 text-xs text-charcoal/60">
            <span><strong className="text-deepgreen">{observations.length}</strong> extracted findings</span>
            <span><strong className="text-deepgreen">{verifiedCount}</strong> with verified evidence</span>
            <span>Findings are extracted facts, not ranked by importance</span>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Paper viewer */}
        <div className="bg-white border border-sage/30 rounded-lg overflow-hidden flex flex-col" style={{ height: "70vh" }}>
          <div className="flex border-b border-sage/30 text-sm">
            <button onClick={() => setTab("pdf")} className={`flex-1 py-2 flex items-center justify-center gap-1.5 ${tab === "pdf" ? "bg-sage/20 text-deepgreen font-medium" : "text-charcoal/50"}`}>
              <FileText size={14} /> PDF
            </button>
            <button onClick={() => setTab("text")} className={`flex-1 py-2 flex items-center justify-center gap-1.5 ${tab === "text" ? "bg-sage/20 text-deepgreen font-medium" : "text-charcoal/50"}`}>
              <Layers size={14} /> Source Text
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
              <p className="border-b border-sage/20 bg-sage/10 px-4 py-2 text-xs text-charcoal/60">
                Text extracted from the PDF on page {activePage}; use it to check the cited evidence.
              </p>
              <div className="flex-1 overflow-y-auto p-4 text-sm whitespace-pre-wrap font-sans leading-7 text-charcoal/80">
                {currentPageText || "No text extracted for this page."}
              </div>
            </div>
          )}
        </div>

        {/* Observations */}
        <div className="bg-white border border-sage/30 rounded-lg overflow-hidden flex flex-col" style={{ height: "70vh" }}>
          <div className="px-4 py-3 border-b border-sage/30">
            <h2 className="text-sm font-semibold text-deepgreen">Key findings</h2>
            <p className="mt-1 text-xs text-charcoal/50">
              Concise results with source pages. Review the evidence before relying on a finding.
            </p>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 bg-sage/5 p-3">
            {observations.length === 0 && (
              <div className="rounded-lg border border-dashed border-sage/50 bg-white p-6 text-center">
                <Sparkles className="mx-auto mb-2 text-teal" size={20} />
                <p className="text-sm font-medium text-deepgreen">No findings yet</p>
                <p className="mt-1 text-xs text-charcoal/50">Run AI extraction to identify results reported in this paper.</p>
              </div>
            )}
            {observations.map((o) => (
              <div
                key={o.id}
                className="rounded-lg border border-sage/25 bg-white p-4 shadow-sm transition hover:border-teal/50 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-teal">
                      {o.biological_entity || "Finding"}
                    </p>
                    <h3 className="mt-1 font-medium text-charcoal">
                      {o.measured_variable || "Reported result"}
                    </h3>
                  </div>
                  <StatusBadge status={o.validation_status} verified={o.evidence_verified} />
                </div>

                <div className="mt-3 rounded-md bg-offwhite px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-charcoal/45">Reported outcome</p>
                  <p className="mt-0.5 text-sm font-medium text-deepgreen">
                    {o.effect || "Outcome not reported"}
                  </p>
                  {(o.value_text || o.value != null) && (
                    <p className="mt-1 text-xs text-charcoal/60">
                      Measured value: {[o.value_text ?? (o.value != null ? String(o.value) : null), o.unit].filter(Boolean).join(" ")}
                    </p>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {[o.organism, o.tissue, o.condition, o.treatment].filter(Boolean).map((item, index) => (
                    <span key={`${item}-${index}`} className="rounded-full bg-sage/15 px-2.5 py-1 text-[11px] text-charcoal/70">
                      {item}
                    </span>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-sage/15 pt-3">
                  <button
                    type="button"
                    onClick={() => setSelected(o)}
                    className="text-xs font-medium text-teal hover:text-deepgreen"
                  >
                    View evidence and details{o.source_page ? ` · Page ${o.source_page}` : ""}
                  </button>
                  <div className="flex gap-3">
                    <button onClick={() => act(o.id, "approve")} className="flex items-center gap-1 text-xs text-teal hover:underline">
                      <CheckCircle2 size={13} /> Approve
                    </button>
                    <button onClick={() => act(o.id, "reject")} className="flex items-center gap-1 text-xs text-red-600 hover:underline">
                      <XCircle size={13} /> Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 bg-charcoal/40 flex items-center justify-center p-6 z-20" onClick={() => setSelected(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="finding-title"
            className="bg-offwhite rounded-xl max-w-xl w-full p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start gap-4 mb-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-teal">Finding details</p>
                <h3 id="finding-title" className="font-serif text-xl text-deepgreen mt-1">
                  {selected.biological_entity || "Reported finding"}
                </h3>
              </div>
              <StatusBadge status={selected.validation_status} verified={selected.evidence_verified} />
            </div>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Row label="Measured" value={selected.measured_variable} />
              <Row label="Measured value" value={[selected.value_text ?? (selected.value != null ? String(selected.value) : null), selected.unit].filter(Boolean).join(" ")} />
              <Row label="Reported outcome" value={selected.effect} />
              <Row label="Condition" value={selected.condition} />
              <Row label="Treatment" value={selected.treatment} />
              <Row label="Experimental group" value={selected.experimental_group} />
              <Row label="Control group" value={selected.control_group} />
              <Row label="Organism" value={selected.organism} />
              <Row label="Tissue" value={selected.tissue} />
              <Row label="Sample size" value={selected.sample_size?.toString()} />
              <Row label="P-value" value={selected.p_value?.toString()} />
              <Row label="Method" value={selected.method} />
              <Row label="Confidence" value={selected.confidence != null ? `${Math.round(selected.confidence * 100)}%` : null} />
            </dl>
            <div className="mt-5 rounded-lg border-l-4 border-teal bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-charcoal/45 mb-2">
                Source evidence{selected.source_page ? ` · Page ${selected.source_page}` : ""}
              </div>
              <blockquote className="text-sm leading-6 text-charcoal/80">
                {selected.evidence_quote ? `“${selected.evidence_quote}”` : "No evidence quote was recorded."}
              </blockquote>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="mt-5 rounded-md bg-deepgreen px-4 py-2 text-sm font-medium text-white hover:bg-teal"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="rounded-md bg-white/70 px-3 py-2">
      <dt className="text-[11px] font-medium text-charcoal/50">{label}</dt>
      <dd className="mt-0.5 text-sm text-charcoal">{value}</dd>
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
