import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, Paper } from "../lib/api";
import { UploadCloud, FileText, Loader2 } from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  Uploaded: "bg-sage/30 text-deepgreen",
  Processing: "bg-teal/20 text-teal",
  Ready: "bg-sage/30 text-deepgreen",
  "Extraction Complete": "bg-deepgreen/15 text-deepgreen",
  "Needs Review": "bg-amber-100 text-amber-800",
  Failed: "bg-red-100 text-red-700",
};

export default function Papers() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    api.listPapers().then((p) => { setPapers(p); setLoading(false); }).catch((e) => setError(e.message));
  };

  useEffect(() => { load(); }, []);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are accepted.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await api.uploadPaper(file);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const filtered = papers.filter((p) =>
    (p.title || p.filename).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-serif text-2xl text-deepgreen">Research Paper Library</h1>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search papers..."
          className="border border-sage/50 rounded-md px-3 py-1.5 text-sm bg-white w-64"
        />
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors mb-8 ${
          dragOver ? "border-teal bg-teal/5" : "border-sage/50 bg-white"
        }`}
      >
        <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        {uploading ? (
          <div className="flex flex-col items-center gap-2 text-teal">
            <Loader2 className="animate-spin" size={28} />
            <span className="text-sm">Processing paper...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-charcoal/60">
            <UploadCloud size={28} />
            <span className="text-sm">Drag & drop a research paper PDF, or click to select</span>
          </div>
        )}
      </div>

      {error && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

      {loading ? (
        <p className="text-charcoal/50 text-sm">Loading...</p>
      ) : filtered.length === 0 ? (
        <p className="text-charcoal/50 text-sm">No papers yet. Upload one to get started.</p>
      ) : (
        <div className="grid gap-3">
          {filtered.map((p) => (
            <Link
              key={p.id}
              to={`/papers/${p.id}`}
              className="flex items-start gap-4 bg-white border border-sage/30 rounded-lg p-4 hover:border-teal transition-colors"
            >
              <FileText className="text-teal mt-1 shrink-0" size={20} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-charcoal truncate">{p.title || p.filename}</div>
                <div className="text-xs text-charcoal/50 mt-1 font-mono">
                  {[p.authors, p.journal, p.pub_year].filter(Boolean).join(" · ") || "Metadata not detected"}
                </div>
                {p.error_message && <div className="text-xs text-red-600 mt-1">{p.error_message}</div>}
              </div>
              <div className="text-right shrink-0">
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_STYLES[p.status] || "bg-gray-100 text-gray-600"}`}>
                  {p.status}
                </span>
                <div className="text-xs text-charcoal/40 mt-1">{p.page_count ? `${p.page_count} pages` : ""}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
