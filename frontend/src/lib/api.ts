// Thin fetch wrapper. Frontend never touches SQLite directly - everything
// goes through these HTTP calls to the FastAPI backend.
const BASE = "/api";
const TOKEN_KEY = "bioextract_auth_token";

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path: string, options: RequestInit = {}) {
  const token = getAuthToken();
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {}
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  health: () => request("/health"),
  signup: async (email: string, password: string) => {
    const result = await request("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setAuthToken(result.token);
    return result.user;
  },
  login: async (email: string, password: string) => {
    const result = await request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setAuthToken(result.token);
    return result.user;
  },
  logout: async () => {
    try {
      await request("/auth/logout", { method: "POST" });
    } finally {
      setAuthToken(null);
    }
  },
  me: () => request("/auth/me").then((result) => result.user),
  listPapers: () => request("/papers"),
  getPaper: (id: number) => request(`/papers/${id}`),
  getPages: (id: number) => request(`/papers/${id}/pages`),
  paperFileUrl: (id: number) =>
    `${BASE}/papers/${id}/file${getAuthToken() ? `?token=${encodeURIComponent(getAuthToken() as string)}` : ""}`,
  uploadPaper: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request("/papers/upload", { method: "POST", body: form });
  },
  extractPaper: (id: number) => request(`/papers/${id}/extract`, { method: "POST" }),
  getPaperObservations: (id: number) => request(`/papers/${id}/observations`),
  getDataset: () => request("/datasets"),
  approveObservation: (id: number) => request(`/observations/${id}/approve`, { method: "POST" }),
  rejectObservation: (id: number) => request(`/observations/${id}/reject`, { method: "POST" }),
  patchObservation: (id: number, patch: Record<string, any>) =>
    request(`/observations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
};

export interface Paper {
  id: number;
  filename: string;
  title: string | null;
  authors: string | null;
  journal: string | null;
  pub_year: string | null;
  doi: string | null;
  pmid: string | null;
  abstract: string | null;
  page_count: number | null;
  status: string;
  uploaded_at: string;
  error_message: string | null;
}

export interface Observation {
  id: number;
  paper_id: number;
  paper_title: string | null;
  biological_entity: string | null;
  entity_type: string | null;
  organism: string | null;
  tissue: string | null;
  condition: string | null;
  treatment: string | null;
  experimental_group: string | null;
  control_group: string | null;
  measured_variable: string | null;
  value: number | null;
  value_text: string | null;
  unit: string | null;
  sample_size: number | null;
  p_value: number | null;
  effect: string | null;
  method: string | null;
  source_page: number | null;
  confidence: number | null;
  validation_status: string;
  evidence_quote: string | null;
  evidence_verified: boolean | null;
}
