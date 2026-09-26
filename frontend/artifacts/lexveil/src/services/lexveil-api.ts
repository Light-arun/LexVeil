export type AskResponse = {
  answer?: string;
  citations?: unknown[];
  confidence?: number | string;
  canAnswer?: boolean;
};

export type DocumentRecord = {
  id: string;
  title: string;
  originalText: string;
  summary?: string;
  clauses: unknown[];
  risks: unknown[];
  status?: string;
  [key: string]: unknown;
};

export class LexVeilApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'LexVeilApiError';
    this.status = status;
  }
}

async function readResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(body: unknown): string {
  if (typeof body === 'object' && body !== null) {
    const record = body as Record<string, unknown>;
    if (typeof record.error === 'string' && record.error) return record.error;
    if (typeof record.message === 'string' && record.message) return record.message;
  }
  return 'The analysis service returned an error. Please try again.';
}

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

async function request(path: string, init: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, credentials: 'include' });
  } catch {
    throw new LexVeilApiError('LexVeil could not reach the analysis service. Check the connection and try again.', 0);
  }
  const body = await readResponse(response);
  if (!response.ok) {
    throw new LexVeilApiError(extractErrorMessage(body), response.status);
  }
  return body;
}

export async function uploadDocument(
  input: File | string,
): Promise<DocumentRecord> {
  if (input instanceof File) {
    const form = new FormData();
    form.append("document", input);

    return (await request("/api/documents/upload", {
      method: "POST",
      body: form,
    })) as DocumentRecord;
  }

  return (await request("/api/documents/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: input }),
  })) as DocumentRecord;
}

export async function askDocument(documentId: string, question: string): Promise<AskResponse> {
  return (await request(`/api/documents/${encodeURIComponent(documentId)}/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  })) as AskResponse;
}

export async function exportDocument(documentId: string): Promise<{ blob: Blob; filename: string }> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/documents/${encodeURIComponent(documentId)}/export`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    throw new LexVeilApiError('The export service is unavailable. Check the connection and try again.', 0);
  }
  if (!response.ok) {
    const body = await readResponse(response);
    throw new LexVeilApiError(extractErrorMessage(body), response.status);
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  return { blob, filename: match?.[1] ?? 'lexveil-brief' };
}



