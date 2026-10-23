'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { use } from 'react';

interface PageParams {
  params: Promise<{ id: string }>;
}

interface RegistrationWithUser {
  id: string;
  eventId: string;
  userId: string;
  responses: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'checked-in';
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  } | null;
}

interface EventDetails {
  id: string;
  name: string;
  description: string;
  date: string;
  location: string;
  formSchema: {
    fields: Array<{
      id: string;
      name: string;
      label: string;
      type: string;
      required: boolean;
    }>;
  };
}

export default function PendingRegistrationsPage({ params }: PageParams) {
  const resolvedParams = use(params);
  const eventId = resolvedParams.id;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [registrations, setRegistrations] = useState<RegistrationWithUser[]>([]);
  const [filteredRegistrations, setFilteredRegistrations] = useState<RegistrationWithUser[]>([]);
  const [event, setEvent] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const initialFilter = (searchParams.get('status') as 'all' | 'pending' | 'approved' | 'rejected' | 'checked-in') || 'all';
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'checked-in'>(initialFilter);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Applicants (no registrations) view
  const [viewMode, setViewMode] = useState<'registrations' | 'applicants'>('registrations');
  const [applicants, setApplicants] = useState<Array<{ id: string; name: string; email: string; createdAt: string }>>([]);
  const [applicantsCount, setApplicantsCount] = useState<number>(0);
  const [loadingApplicants, setLoadingApplicants] = useState<boolean>(false);
  const defaultPaymentConfirmationMessage = process.env.NEXT_PUBLIC_PAYMENT_CONFIRMATION_MESSAGE || `Hello!\nYou signed up for {EVENT_NAME}.\nPlease confirm your attendance by completing the payment and uploading the payment receipt using the payment confirmation form below.\n\nPayment confirmation form: https://forms.gle/\n\nPlease complete payment by the deadline. When completing the payment confirmation form, please use the same phone number you provided on your registration so we can match the receipt to your registration.\n\nThanks,\nTeam`;
  const [draftMessage, setDraftMessage] = useState<string>(defaultPaymentConfirmationMessage);
  const [csvUrl, setCsvUrl] = useState<string>('');
  const [csvRows, setCsvRows] = useState<Array<Record<string, string>>>([]);
  const [csvIndex, setCsvIndex] = useState<Record<string, Record<string, string>>>({});
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvKeyField, setCsvKeyField] = useState<string>('');
  const [csvLinkField, setCsvLinkField] = useState<string>('');
  const [csvDuplicateKeys, setCsvDuplicateKeys] = useState<string[]>([]);
  const [formKeyField, setFormKeyField] = useState<string>('');
  const [previewOpen, setPreviewOpen] = useState<Record<string, boolean>>({});
  const [csvLoading, setCsvLoading] = useState<boolean>(false);
  const [mailBcc, setMailBcc] = useState<string>('');
  const [pageMessage, setPageMessage] = useState<{ type: 'info' | 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    if (csvUrl) return;
    const fetchServerCsv = async () => {
      try {
        const resp = await fetch('/api/env/csv');
        if (!resp.ok) {
          if (resp.status === 403) console.warn('CSV mailer link is restricted to admins/organizers');
          return;
        }
        const data = await resp.json();
        if (data?.csvMailerLink) setCsvUrl(String(data.csvMailerLink));
        if (data?.csvMailerPrimary && !csvKeyField) {
          setCsvKeyField(String(data.csvMailerPrimary));
        }
      } catch {
        // ignore network errors
      }
    };
    fetchServerCsv();
  }, [csvUrl]);


  // Auto-fill BCC from the active filtered registrations
  useEffect(() => {
    const emails = filteredRegistrations.map(r => r.user?.email).filter(Boolean) as string[];
    setMailBcc(emails.join(','));
  }, [filteredRegistrations]);

  function cleanPhone(num?: string) {
    if (!num) return '';
    const cleaned = num.replace(/\D/g, '');
    if (cleaned.length === 10) return '91' + cleaned;
    return cleaned;
  }

  function normalizeKeyValue(value: string | unknown, isPhoneField: boolean = false): string {
    const s = String(value ?? '').trim();
    if (!s) return '';

    if (isPhoneField) {
      // Normalize phone for matching: strip non-digits and standardize
      const digits = s.replace(/\D/g, '');
      if (digits.length === 10) return '91' + digits;
      return digits;
    }

    return s.toLowerCase();
  }

  // --- SYNC HELPERS ---
  // Determine if we're matching by phone
  const isPhoneKeyField = !!(formKeyField && formKeyField.toLowerCase().includes('phone'));

  // Get the effective key field to use (form takes priority)
  const effectiveKeyField = formKeyField || csvKeyField;

  // Get matched and unmatched data
  function getMatchedAndUnmatchedData() {
    const matchedKeys = new Set<string>();

    for (const reg of registrations) {
      let val = '';
      // Handle special [google] fields
      if (formKeyField === '[google]name' && reg.user?.name) {
        val = normalizeKeyValue(reg.user.name, isPhoneKeyField);
      } else if (formKeyField === '[google]email' && reg.user?.email) {
        val = normalizeKeyValue(reg.user.email, false);
      } else if (formKeyField && formKeyField in reg.responses) {
        val = normalizeKeyValue(reg.responses[formKeyField], isPhoneKeyField);
      }
      // Fallback to CSV key field
      if (!val && csvKeyField && csvKeyField in reg.responses) {
        val = normalizeKeyValue(reg.responses[csvKeyField], isPhoneKeyField);
      }
      // Fallback to email if primary key not found
      if (!val && reg.user?.email) val = normalizeKeyValue(reg.user.email, false);
      if (val) matchedKeys.add(val);
    }

    const unmatched = csvRows.filter(r => {
      const key = r[csvKeyField] ?? r[csvKeyField.trim()] ?? '';
      const normalized = normalizeKeyValue(key, isPhoneKeyField);
      return normalized && !matchedKeys.has(normalized);
    });

    const matched = csvRows.filter(r => {
      const key = r[csvKeyField] ?? r[csvKeyField.trim()] ?? '';
      const normalized = normalizeKeyValue(key, isPhoneKeyField);
      return normalized && matchedKeys.has(normalized);
    });

    return { matched, unmatched, matchedKeys };
  }

  // Find the registration that matches a CSV row
  function findMatchingRegistration(csvRow: Record<string, string>) {
    const key = csvRow[csvKeyField] ?? csvRow[csvKeyField.trim()] ?? '';
    const normalized = normalizeKeyValue(key, isPhoneKeyField);
    if (!normalized) return null;

    return registrations.find(reg => {
      let val = '';
      // Handle special [google] fields
      if (formKeyField === '[google]name' && reg.user?.name) {
        val = normalizeKeyValue(reg.user.name, isPhoneKeyField);
      } else if (formKeyField === '[google]email' && reg.user?.email) {
        val = normalizeKeyValue(reg.user.email, false);
      } else if (formKeyField && formKeyField in reg.responses) {
        val = normalizeKeyValue(reg.responses[formKeyField], isPhoneKeyField);
      }
      if (!val && csvKeyField && csvKeyField in reg.responses) {
        val = normalizeKeyValue(reg.responses[csvKeyField], isPhoneKeyField);
      }
      if (!val && reg.user?.email) val = normalizeKeyValue(reg.user.email, false);
      return val === normalized;
    }) || null;
  }

  // Find the CSV row that matches a registration
  function findMatchingCsvRow(registration: RegistrationWithUser): Record<string, string> | null {
    let regKeyVal = '';

    // Handle special [google] fields
    if (formKeyField === '[google]name' && registration.user?.name) {
      regKeyVal = normalizeKeyValue(registration.user.name, isPhoneKeyField);
    } else if (formKeyField === '[google]email' && registration.user?.email) {
      regKeyVal = normalizeKeyValue(registration.user.email, false);
    } else if (formKeyField && formKeyField in registration.responses) {
      regKeyVal = normalizeKeyValue(registration.responses[formKeyField], isPhoneKeyField);
    }

    if (!regKeyVal && csvKeyField && csvKeyField in registration.responses) {
      regKeyVal = normalizeKeyValue(registration.responses[csvKeyField], isPhoneKeyField);
    }
    if (!regKeyVal && registration.user?.email) {
      regKeyVal = normalizeKeyValue(registration.user.email, false);
    }

    if (!regKeyVal) return null;

    return csvRows.find(row => {
      const key = row[csvKeyField] ?? row[csvKeyField.trim()] ?? '';
      const normalized = normalizeKeyValue(key, isPhoneKeyField);
      return normalized === regKeyVal;
    }) || null;
  }

  function getPhoneFromCsvRow(row: Record<string, string>): string {
    // Try common phone column names
    const phoneCandidates = ['phone', 'Phone', 'phone_number', 'Phone Number', 'mobile', 'Mobile', 'mobile_number', 'Mobile Number', 'contact', 'Contact Number'];
    for (const col of phoneCandidates) {
      if (col in row) {
        const phone = cleanPhone(row[col]);
        if (phone) return phone;
      }
    }

    // Search all columns for phone-like data (10+ digits)
    for (const [, val] of Object.entries(row)) {
      if (!val) continue;
      const cleaned = cleanPhone(val);
      if (cleaned && cleaned.length >= 10) return cleaned;
    }

    return '';
  }

  function getPhoneFromResponses(responses: Record<string, unknown>) {
    // Try default candidates
    const candidates = ['Phone Number', 'phone', 'phone_number', 'Phone', 'PHONE', 'Mobile', 'mobile', 'mobile_number', 'contact', 'Contact Number'];
    for (const k of candidates) {
      if (k in responses) {
        const v = responses[k];
        if (v == null) continue;
        const asStr = String(v).trim();
        const cleaned = cleanPhone(asStr);
        if (cleaned) return cleaned;
      }
    }

    // Fallback: search any value for a digit sequence
    for (const [, v] of Object.entries(responses)) {
      if (v == null) continue;
      const s = String(v);
      const digits = s.replace(/\D/g, '');
      if (digits.length >= 7) {
        return cleanPhone(digits);
      }
    }

    return '';
  }

  function openWhatsApp(phone: string, message: string) {
    if (!phone) return;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }

  // Simple CSV parser (handles quoted fields)
  function parseCSV(text: string) {
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return { header: [] as string[], rows: [] as Array<Record<string, string>> };
    const parseLine = (line: string) => {
      const res: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = !inQuotes; }
        } else if (ch === ',' && !inQuotes) { res.push(cur); cur = ''; } else { cur += ch; }
      }
      res.push(cur);
      return res.map(s => s.trim());
    };

    const header = parseLine(lines[0]);
    const rows = lines.slice(1).map(l => {
      const parts = parseLine(l);
      const obj: Record<string, string> = {};
      header.forEach((h, i) => { obj[h] = parts[i] ?? ''; });
      return obj;
    });
    return { header, rows };
  }

  function indexCsv(rows: Array<Record<string, string>>, keyField: string) {
    const idx: Record<string, Record<string, string>> = {};
    const normalizedKey = keyField.trim();
    rows.forEach(r => {
      // look up matching key in the row (case-sensitive and insensitive)
      let val = '';
      if (normalizedKey in r) val = r[normalizedKey];
      else {
        const foundKey = Object.keys(r).find(k => k.trim().toLowerCase() === normalizedKey.toLowerCase());
        if (foundKey) val = r[foundKey];
      }
      if (val) idx[String(val).trim()] = r;
    });
    return idx;
  }

  function findDuplicateKeys(rows: Array<Record<string, string>>, keyField: string) {
    const normalizedKey = keyField.trim();
    if (!normalizedKey) return [] as string[];

    const counts = new Map<string, number>();
    const duplicates = new Set<string>();

    rows.forEach(r => {
      let val = '';
      if (normalizedKey in r) val = r[normalizedKey];
      else {
        const foundKey = Object.keys(r).find(k => k.trim().toLowerCase() === normalizedKey.toLowerCase());
        if (foundKey) val = r[foundKey];
      }

      const keyVal = String(val ?? '').trim();
      if (!keyVal) return;

      const lower = keyVal.toLowerCase();
      const next = (counts.get(lower) ?? 0) + 1;
      counts.set(lower, next);
      if (next > 1) duplicates.add(keyVal);
    });

    return Array.from(duplicates);
  }

  const fetchCsvUrl = useCallback(async (url?: string) => {
    const u = (url ?? csvUrl).trim();
    if (!u) { setPageMessage({ type: 'info', text: 'Enter a CSV URL' }); return; }
    setCsvLoading(true);
    try {
      const resp = await fetch(u);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      const { header, rows } = parseCSV(text);
      setCsvHeaders(header);
      setCsvRows(rows);
      setCsvIndex(indexCsv(rows, csvKeyField));
      setPageMessage({ type: 'success', text: `Loaded ${rows.length} rows from CSV` });
    } catch (err) {
      console.error('Failed to fetch CSV URL', err);
      setPageMessage({ type: 'error', text: `Failed to fetch CSV: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setCsvLoading(false);
    }
  }, [csvUrl, csvKeyField]);

  useEffect(() => {
    if (!csvUrl) return;
    if (csvRows.length > 0) return;
    void fetchCsvUrl();
  }, [csvUrl, csvRows.length, fetchCsvUrl]);

  // Rebuild CSV index when key changes
  useEffect(() => {
    if (csvRows.length === 0) return;
    setCsvIndex(indexCsv(csvRows, csvKeyField));
    setCsvDuplicateKeys(findDuplicateKeys(csvRows, csvKeyField));
  }, [csvRows, csvKeyField]);

  // When headers load, ensure the link field is one of them
  useEffect(() => {
    if (csvHeaders.length === 0) return;
    if (!csvLinkField) return;
    if (!csvHeaders.includes(csvLinkField)) {
      setCsvLinkField('');
    }
  }, [csvHeaders, csvLinkField]);

  function getPreviewUrlFromLink(link: string) {
    if (!link) return '';
    const s = link.trim();
    // Google Drive file id
    const m = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m && m[1]) return `https://drive.google.com/file/d/${m[1]}/preview`;
    // shareable link with id= parameter
    const q = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (q && q[1]) return `https://drive.google.com/file/d/${q[1]}/preview`;
    // direct pdf
    if (s.endsWith('.pdf')) return s;
    return s; // fallback to open in iframe (may or may not work)
  }

  function buildGmailUrl(to: string[], bcc: string[], subject: string, body: string) {
    const params = new URLSearchParams();
    if (to.length) params.set('to', to.join(','));
    if (bcc.length) params.set('bcc', bcc.join(','));
    if (subject) params.set('su', subject);
    if (body) params.set('body', body);
    return `https://mail.google.com/mail/?view=cm&fs=1&${params.toString()}`;
  }

  // Fetch event data and ALL registrations
  const fetchData = useCallback(async () => {
    try {
      setRefreshing(true);
      // Fetch event details
      const eventResponse = await fetch(`/api/events/${eventId}`);
      if (!eventResponse.ok) {
        throw new Error(`Failed to fetch event: ${eventResponse.status}`);
      }
      const eventData = await eventResponse.json();
      setEvent(eventData.event);

      // Fetch ALL registrations for this event
      const registrationsResponse = await fetch(`/api/events/${eventId}/registrations`);
      if (!registrationsResponse.ok) {
        throw new Error(`Failed to fetch registrations: ${registrationsResponse.status}`);
      }
      const registrationsData = await registrationsResponse.json();
      setRegistrations(registrationsData.registrations || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (status !== 'loading') {
      fetchData();
    }
  }, [status, fetchData]);

  // When event loads, substitute {EVENT_NAME} token in the draft message if present
  useEffect(() => {
    if (event && draftMessage.includes('{EVENT_NAME}')) {
      setDraftMessage(prev => prev.replace('{EVENT_NAME}', event.name));
    }
  }, [event, draftMessage]);


  // Filter registrations based on status
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    const byStatus = statusFilter === 'all' ? registrations : registrations.filter(reg => reg.status === statusFilter);
    if (!q) {
      setFilteredRegistrations(byStatus);
      return;
    }

    const matches = byStatus.filter(reg => {
      if (reg.user?.name && String(reg.user.name).toLowerCase().includes(q)) return true;
      if (reg.user?.email && String(reg.user.email).toLowerCase().includes(q)) return true;
      if (String(reg.id).toLowerCase().includes(q)) return true;
      for (const v of Object.values(reg.responses || {})) {
        if (v == null) continue;
        if (String(v).toLowerCase().includes(q)) return true;
      }
      return false;
    });

    setFilteredRegistrations(matches);
  }, [registrations, statusFilter, searchQuery]);

  // Redirect if not authenticated or not organizer/admin
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push(`/auth/signin?callbackUrl=/dashboard/events/${eventId}/registrations`);
    } else if (status === 'authenticated' &&
      session.user.role !== 'admin' &&
      session.user.role !== 'organizer') {
      router.push('/dashboard');
    }
  }, [status, session, router, eventId]);

  const handleApprove = async (registrationId: string) => {
    setProcessingId(registrationId);
    try {
      const response = await fetch('/api/events/registrations/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ registrationId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to approve registration');
      }

      // Update the local state - don't remove, just update status
      setRegistrations(prev =>
        prev.map(reg =>
          reg.id === registrationId
            ? { ...reg, status: 'approved' as const }
            : reg
        )
      );
    } catch (err) {
      console.error('Error approving registration:', err);
      setPageMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to approve registration' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (registrationId: string) => {
    setProcessingId(registrationId);
    try {
      const response = await fetch('/api/events/registrations/reject', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ registrationId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reject registration');
      }

      // Update the local state - don't remove, just update status
      setRegistrations(prev =>
        prev.map(reg =>
          reg.id === registrationId
            ? { ...reg, status: 'rejected' as const }
            : reg
        )
      );
    } catch (err) {
      console.error('Error rejecting registration:', err);
      setPageMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to reject registration' });
    } finally {
      setProcessingId(null);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="space-y-6 md:space-y-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded-lg w-1/2"></div>
          <div className="h-4 bg-slate-200 rounded w-full"></div>
          <div className="h-4 bg-slate-200 rounded w-3/4"></div>
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="space-y-6 md:space-y-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-2xl">
          <p className="font-medium">Error: {error || 'Event not found'}</p>
        </div>
        <Link href="/dashboard/events" className="text-indigo-600 hover:text-indigo-800 font-medium">
          ← Back to events
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Page-level message banner */}
      {pageMessage && (
        <div className={`px-5 py-4 rounded-2xl flex justify-between items-center ${pageMessage.type === 'error' ? 'bg-red-50 border border-red-200 text-red-700' : pageMessage.type === 'success' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-blue-50 border border-blue-200 text-blue-700'}`}>
          <div>{pageMessage.text}</div>
          <button onClick={() => setPageMessage(null)} className="text-sm font-medium hover:underline">Dismiss</button>
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-slate-500">Registrations</p>
          <h1 className="text-2xl md:text-3xl font-semibold text-slate-900">{event.name}</h1>
          <p className="text-slate-600">
            {new Date(event.date).toLocaleDateString()} • {event.location}
          </p>
        </div>
        <Link
          href={`/dashboard/events/${eventId}`}
          className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm font-medium hover:border-slate-300"
        >
          ← Back
        </Link>
      </div>

      {/* Inline WhatsApp draft + per-registration send (organizers/admins) */}
      {session?.user?.role && ['admin', 'organizer'].includes(session.user.role) && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Messaging</p>
            <h3 className="text-lg font-semibold text-slate-900 mt-1">WhatsApp + Email Draft</h3>
          </div>
          <textarea
            value={draftMessage}
            onChange={e => setDraftMessage(e.target.value)}
            rows={5}
            className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm text-slate-600 block mb-1 font-medium">Primary key (e.g. SRN)</label>
              <select
                value={csvKeyField}
                onChange={e => setCsvKeyField(e.target.value)}
                className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white"
                disabled={csvHeaders.length === 0 || !csvUrl.trim()}
              >
                {csvHeaders.length === 0 ? (
                  <option value="">Load CSV to select</option>
                ) : (
                  <>
                    <option value="">Select field</option>
                    {csvHeaders.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </>
                )}
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-600 block mb-1 font-medium">Drive Preview-link Column</label>
              <select
                value={csvLinkField}
                onChange={e => setCsvLinkField(e.target.value)}
                className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white"
                disabled={csvHeaders.length === 0 || !csvUrl.trim()}
              >
                {csvHeaders.length === 0 ? (
                  <option value="">Load CSV to select</option>
                ) : (
                  <>
                    <option value="">Select column</option>
                    {csvHeaders.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </>
                )}
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-600 block mb-1 font-medium">CSV URL</label>
              <div className="flex gap-2">
                <input value={csvUrl} onChange={e => setCsvUrl(e.target.value)} placeholder="https://docs.google.com/..." className="flex-1 border border-slate-200 rounded-xl p-2.5 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
                <button
                  onClick={() => fetchCsvUrl()}
                  disabled={csvLoading}
                  className="px-3 py-2.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 disabled:opacity-50 font-medium text-sm"
                >
                  {csvLoading ? '...' : '↻'}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-slate-600 block mb-1 font-medium">Eloop primary key (please match the one above)</label>
              <select
                value={formKeyField}
                onChange={e => setFormKeyField(e.target.value)}
                className="w-full border border-slate-200 rounded-xl p-2.5 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white"
                disabled={csvHeaders.length === 0 || !csvUrl.trim()}
              >
                {csvHeaders.length === 0 ? (
                  <option value="">Load CSV to select</option>
                ) : (
                  <>
                    <option value="">Select field</option>
                    <option value="[google]name">[google]name</option>
                    <option value="[google]email">[google]email</option>
                    {event?.formSchema?.fields && event.formSchema.fields.map(f => (
                      <option key={f.id} value={f.name}>{f.label}</option>
                    ))}
                  </>
                )}
              </select>
            </div>

          </div>

          {csvDuplicateKeys.length > 0 && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <span className="text-amber-600 text-lg">⚠️</span>
              <div className="text-sm text-amber-900 space-y-1">
                <div className="font-medium">{csvDuplicateKeys.length} duplicate {csvDuplicateKeys.length === 1 ? 'value' : 'values'} in selected key</div>
                <div className="text-amber-800">Examples: {csvDuplicateKeys.slice(0, 3).join(', ')}{csvDuplicateKeys.length > 3 ? ' …' : ''}</div>
                <div className="text-amber-800">Duplicates may overwrite each other during matching. Consider picking a unique column.</div>
              </div>
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1">
              <label className="text-sm text-slate-600 block mb-1 font-medium">Mail BCC (auto-filled)</label>

              <div className="mt-2 flex items-center gap-3">
                <input value={mailBcc} onChange={e => setMailBcc(e.target.value)} placeholder="team@example.com" className="flex-1 border border-slate-200 rounded-xl p-2.5 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />

                <button
                  onClick={() => {
                    const bccEmails = filteredRegistrations.map(r => r.user?.email).filter(Boolean) as string[];
                    if (bccEmails.length === 0) { setPageMessage({ type: 'info', text: 'No recipients' }); return; }
                    const subject = `Update on ${event?.name || 'event'}`;
                    const gmailUrl = buildGmailUrl([], bccEmails, subject, draftMessage);
                    window.open(gmailUrl, '_blank');
                  }}
                  className="h-10 px-3 py-2 bg-indigo-100 text-indigo-700 rounded-md hover:bg-indigo-200 font-medium text-sm inline-flex items-center gap-2 whitespace-nowrap"
                  title="Email all filtered registrations"
                >
                  <span className="sr-only">Email All</span>
                  <span className="hidden md:inline">Email All</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-end md:justify-between">
          <div>
            <label htmlFor="search" className="text-sm text-slate-600 block mb-1 font-medium">Search registrations</label>
            <input
              id="search"
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Name, email, or field response"
              className="w-full md:w-80 border border-slate-200 rounded-xl p-2.5 text-sm focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {[
            { key: 'all', label: 'All', count: registrations.length },
            { key: 'pending', label: 'Pending', count: registrations.filter(r => r.status === 'pending').length },
            { key: 'approved', label: 'Approved', count: registrations.filter(r => r.status === 'approved').length },
            { key: 'checked-in', label: 'Checked In', count: registrations.filter(r => r.status === 'checked-in').length },
            { key: 'rejected', label: 'Rejected', count: registrations.filter(r => r.status === 'rejected').length },
          ].map(({ key, label, count }) => {
            const active = statusFilter === key && viewMode === 'registrations';
            return (
              <button
                key={key}
                onClick={() => {
                  setViewMode('registrations');
                   setStatusFilter(key as typeof statusFilter);
                  const params = new URLSearchParams(window.location.search);
                  params.set('status', key);
                  router.push(`?${params.toString()}`, { scroll: false });
                }}
                className={`px-3 py-2 rounded-full text-sm font-medium border transition ${active
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-200'
                  }`}
              >
                {label} ({count})
              </button>
            );
          })}

          {/* Applicants (no registrations) button */}
          <button
            onClick={async () => {
              if (viewMode === 'applicants') {
                setViewMode('registrations');
                return;
              }

              setViewMode('applicants');
              setLoadingApplicants(true);
              try {
                const resp = await fetch(`/api/admin/applicants/no-registrations?eventId=${encodeURIComponent(eventId)}`);
                if (!resp.ok) throw new Error('Failed to fetch applicants');
                const body = await resp.json();
                setApplicants(body.applicants || []);
                setApplicantsCount(Number(body.count || (body.applicants || []).length));
              } catch (err) {
                console.error('Failed to load applicants for event:', err);
                setPageMessage({ type: 'error', text: 'Failed to load applicants' });
                setViewMode('registrations');
              } finally {
                setLoadingApplicants(false);
              }
            }}
            className={`px-3 py-2 rounded-full text-sm font-medium border transition ${viewMode === 'applicants'
              ? 'bg-amber-100 text-amber-800 border-amber-200 shadow-sm'
              : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-200'
              }`}
          >
            Applicants ({applicantsCount || '–'})
          </button>
          <button
            onClick={() => fetchData()}
            disabled={refreshing}
            className="ml-2 px-3 py-2 bg-slate-100 text-slate-700 rounded-full hover:bg-slate-200 disabled:opacity-50 font-medium text-sm transition inline-flex items-center gap-1.5"
            title="Refresh registrations"
          >
            <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {viewMode === 'applicants' ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Applicants with no registrations</h3>
          {loadingApplicants ? (
            <div className="text-sm text-slate-500">Loading…</div>
          ) : applicants.length === 0 ? (
            <div className="text-sm text-slate-500">No applicants found for this event.</div>
          ) : (
            <div className="space-y-3">
              {applicants.map((a) => (
                <div key={a.id} className="flex items-center justify-between p-4 border border-slate-100 rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium text-slate-900">{a.name || a.email}</div>
                    <div className="text-sm text-slate-500">{a.email}</div>
                  </div>
                  <div className="text-sm text-slate-400">{new Date(a.createdAt).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : filteredRegistrations.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center text-slate-500">
          No {statusFilter === 'all' ? '' : statusFilter} registrations found.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredRegistrations.map((registration) => {
            const statusColors = {
              pending: 'bg-amber-100 text-amber-800',
              approved: 'bg-emerald-100 text-emerald-800',
              rejected: 'bg-rose-100 text-rose-800',
              'checked-in': 'bg-blue-100 text-blue-800'
            };

            return (
              <div key={registration.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">
                        {registration.user?.name || 'Unknown'}
                      </h3>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColors[registration.status]}`}>
                        {registration.status === 'checked-in' ? 'Checked In' : registration.status.charAt(0).toUpperCase() + registration.status.slice(1)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">{registration.user?.email}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Registered {new Date(registration.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 justify-end">
                    {registration.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleApprove(registration.id)}
                          disabled={processingId === registration.id}
                          className="px-3 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {processingId === registration.id ? '...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleReject(registration.id)}
                          disabled={processingId === registration.id}
                          className="px-3 py-2 bg-rose-600 text-white text-sm font-medium rounded-lg hover:bg-rose-700 disabled:opacity-50"
                        >
                          {processingId === registration.id ? '...' : 'Reject'}
                        </button>
                      </>
                    )}

                    {/* WhatsApp send button */}
                    {session?.user?.role && ['admin', 'organizer'].includes(session.user.role) && (
                      (() => {
                        const phone = getPhoneFromResponses(registration.responses);
                        return phone ? (
                          <button
                            onClick={() => openWhatsApp(phone, draftMessage)}
                            className="px-3 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700"
                          >
                            📱 Send
                          </button>
                        ) : (
                          <button className="px-3 py-2 bg-slate-100 text-slate-500 text-sm font-medium rounded-lg cursor-not-allowed" disabled>
                            No phone
                          </button>
                        );
                      })()
                    )}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <h4 className="font-medium text-sm text-slate-900 mb-3">Responses</h4>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(registration.responses).map(([key, value]) => {
                      const field = event.formSchema.fields.find(f => f.name === key);
                      const label = field?.label || key;
                      const stringValue = String(value);
                      const isLink = stringValue.includes('drive.google.com') || /^https?:\/\//i.test(stringValue);

                      return (
                        <div key={key} className="bg-slate-50 rounded-lg p-3">
                          <dt className="text-xs text-slate-500 font-medium uppercase">{label}</dt>
                          <dd className="text-slate-900 mt-1">
                            {isLink ? (
                              <a
                                href={stringValue}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-600 hover:text-indigo-800 underline text-sm break-all"
                              >
                                {stringValue.length > 50 ? stringValue.slice(0, 50) + '...' : stringValue}
                              </a>
                            ) : (
                              <span className="text-sm">{stringValue}</span>
                            )}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>

                {/* Matched CSV Data */}
                {(() => {
                  const csvRow = findMatchingCsvRow(registration);
                  if (!csvRow) return null;

                  const csvLink = csvRow[csvLinkField] ?? '';
                  const csvPhone = getPhoneFromCsvRow(csvRow);

                  return (
                    <div className="pt-4 border-t border-slate-100 space-y-4">
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                        <p className="text-xs text-emerald-600 font-medium mb-2">✓ CSV MATCHED</p>
                        <div className="space-y-2 text-sm">
                          {csvPhone && <div><span className="text-slate-600">📞 Phone:</span> <span className="text-slate-900">{csvPhone}</span></div>}
                          {csvLink && (
                            <div>
                              <span className="text-slate-600">📄 Document:</span>
                              <a href={getPreviewUrlFromLink(csvLink)} target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-800 underline ml-2">
                                View
                              </a>
                            </div>
                          )}
                          {Object.entries(csvRow).map(([key, val]) => {
                            if (!val || key === csvLinkField || key === effectiveKeyField) return null;
                            if (key.toLowerCase().includes('phone') || key.toLowerCase().includes('link') || key.toLowerCase().includes('drive')) return null;
                            return (
                              <div key={key} className="text-xs">
                                <span className="text-slate-600">{key}:</span> <span className="text-slate-900">{val}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {csvLink && (
                        <button
                          onClick={() => setPreviewOpen(prev => ({ ...prev, [registration.id]: !prev[registration.id] }))}
                          className="px-3 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
                        >
                          {previewOpen[registration.id] ? 'Hide' : 'Show'} Document
                        </button>
                      )}

                      {csvLink && previewOpen[registration.id] && (
                        <div className="border border-slate-200 rounded-xl overflow-hidden h-96 md:h-[500px]">
                          <iframe src={getPreviewUrlFromLink(csvLink)} className="w-full h-full" title="CSV Document preview" />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {/* Show CSV-only (missing) rows: rows present in CSV but not matched to any registration */}
      {csvRows.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">CSV SYNC STATUS</p>
            <h2 className="text-lg font-semibold text-slate-900">Unmatched CSV Entries</h2>
            <p className="text-sm text-slate-600 mt-1">Entries in the uploaded CSV that don&apos;t correspond to any platform registration</p>
          </div>
          {(() => {
            // Build a set of matched keys from registrations (case-insensitive)
            const matchedKeys = new Set<string>();
            // Detect if the key field might be a phone field
            const isPhoneKey = !!(formKeyField && formKeyField.toLowerCase().includes('phone'));

            for (const reg of registrations) {
              let val = '';
              // Use form key field if specified
              if (formKeyField && formKeyField in reg.responses) {
                val = normalizeKeyValue(reg.responses[formKeyField], isPhoneKey);
              }
              // Fallback to CSV key field
              if (!val && csvKeyField && csvKeyField in reg.responses) {
                val = normalizeKeyValue(reg.responses[csvKeyField], isPhoneKey);
              }
              // Fallback to email if primary key not found
              if (!val && reg.user?.email) val = normalizeKeyValue(reg.user.email, false);
              if (val) {
                matchedKeys.add(val);
              }
            }

            const missing = csvRows.filter(r => {
              const key = r[csvKeyField] ?? r[csvKeyField.trim()] ?? '';
              const normalized = normalizeKeyValue(key, isPhoneKeyField);
              return normalized && !matchedKeys.has(normalized);
            });

            if (missing.length === 0) {
              return (
                <div className="flex items-center gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <span className="text-emerald-600 text-xl">✓</span>
                  <p className="text-emerald-700 font-medium">All CSV entries matched successfully</p>
                </div>
              );
            }

            return (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <span className="text-sm font-medium text-amber-900">
                    {missing.length} unmatched {missing.length === 1 ? 'entry' : 'entries'}
                  </span>
                  <button
                    onClick={() => {
                      const csv = missing.map(row =>
                        Object.entries(row).map(([k, v]) => `"${v}"`).join(',')
                      ).join('\n');
                      const header = Object.keys(missing[0] || {}).map(k => `"${k}"`).join(',');
                      const blob = new Blob([header + '\n' + csv], { type: 'text/csv' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `unmatched-entries-${new Date().toISOString().split('T')[0]}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="px-3 py-1 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700"
                  >
                    Export ↓
                  </button>
                </div>
                {missing.map((row, idx) => {
                  const keyVal = (row[effectiveKeyField] ?? row[effectiveKeyField.trim()] ?? '') as string;
                  const link = (row[csvLinkField] ?? '') as string;
                  const phone = getPhoneFromCsvRow(row);

                  // Fallback display value if keyVal is empty - try to find a name, SRN, or email
                  let displayVal = keyVal;
                  if (!displayVal) {
                    const nameCandidates = ['Name', 'name', 'NAME', 'Full Name', 'full name'];
                    const srnCandidates = ['SRN', 'srn', 'Srn'];
                    const emailCandidates = ['E-mail', 'Email', 'email', 'E-MAIL'];

                    for (const key of nameCandidates) {
                      if (row[key]) { displayVal = row[key]; break; }
                    }
                    if (!displayVal) {
                      for (const key of srnCandidates) {
                        if (row[key]) { displayVal = row[key]; break; }
                      }
                    }
                    if (!displayVal) {
                      for (const key of emailCandidates) {
                        if (row[key]) { displayVal = row[key]; break; }
                      }
                    }
                    if (!displayVal) displayVal = phone || 'Unnamed Entry';
                  }

                  return (
                    <div key={idx} className="border border-amber-100 rounded-lg p-4 bg-amber-50/30 hover:bg-amber-50 transition-colors space-y-3">
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900 text-base">{displayVal}</div>
                          {phone && <div className="text-sm text-slate-600 mt-1">📞 {phone}</div>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {phone ? (
                            <button
                              onClick={() => openWhatsApp(phone, draftMessage)}
                              className="px-3 py-1.5 bg-teal-600 text-white rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors"
                              title="Contact via WhatsApp"
                            >
                              📱 Chat
                            </button>
                          ) : null}
                          {link ? (
                            <a
                              href={getPreviewUrlFromLink(link)}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
                              title="View document"
                            >
                              📄 View
                            </a>
                          ) : null}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-amber-200">
                        {Object.entries(row).map(([key, val]) => {
                          if (!val || key === effectiveKeyField) return null;
                          const isLinkCol = key === csvLinkField;
                          const isPhoneCol = key.toLowerCase().includes('phone');
                          if (isLinkCol || isPhoneCol) return null;

                          return (
                            <div key={key} className="bg-white/50 rounded px-2 py-1">
                              <div className="text-xs text-slate-500 uppercase font-medium">{key}</div>
                              <div className="text-sm text-slate-900 mt-0.5">{val}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
