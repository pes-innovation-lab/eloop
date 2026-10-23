'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

interface FailedScan {
  id: string;
  qrCode: string | null;
  checkpoint: string;
  scanStatus: string;
  errorMessage: string | null;
  eventName: string | null;
  eventId: string | null;
  volunteerName: string | null;
  volunteerEmail: string | null;
  userName: string | null;
  userEmail: string | null;
  timestamp: string;
}

export default function ScanLogsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [failedScans, setFailedScans] = useState<FailedScan[]>([]);
  const [loadingScans, setLoadingScans] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'success' | 'failed'>('all');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }

    // Only admin and organizer can access this page
    if (session?.user?.role !== 'admin' && session?.user?.role !== 'organizer') {
      router.push('/dashboard');
      return;
    }

    // Auto-fetch on mount
    fetchFailedScans();
  }, [session, status, router]);

  async function fetchFailedScans() {
    setLoadingScans(true);
    try {
      const response = await fetch('/api/admin/failed-scans');
      if (response.ok) {
        const data = await response.json();
        const scans = data.scans.map((scan: Record<string, string | null>) => ({
          id: scan.id || '',
          qrCode: scan.qr_code || null,
          checkpoint: scan.checkpoint || '',
          scanStatus: scan.scan_status || 'unknown',
          errorMessage: scan.error_message || null,
          eventName: scan.event_name || 'Unknown Event',
          eventId: scan.event_id || null,
          volunteerName: scan.volunteer_name || 'Unknown',
          volunteerEmail: scan.volunteer_email || '',
          userName: scan.user_name || null,
          userEmail: scan.user_email || null,
          timestamp: scan.created_at || new Date().toISOString(),
        }));
        setFailedScans(scans);
      }
    } catch (error) {
      console.error('Error fetching scan logs:', error);
    } finally {
      setLoadingScans(false);
    }
  }

  if (status === 'loading') {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!session?.user || (session.user.role !== 'admin' && session.user.role !== 'organizer')) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="mx-6 pt-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Scan Activity Logs</h1>
          <p className="text-slate-500 mt-1">
            {session.user.role === 'admin'
              ? 'All scan attempts across events'
              : 'Scan attempts for your events'}
          </p>
        </div>
      </div>

      {/* Filter and Action Buttons */}
      <div className="mx-6 space-y-4">
        <div className="flex gap-3 flex-wrap items-center">
          <button
            onClick={fetchFailedScans}
            disabled={loadingScans}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2 text-sm font-medium"
            title="Refresh scan logs"
          >
            <svg className={`w-4 h-4 ${loadingScans ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterStatus === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
            >
              All ({failedScans.length})
            </button>
            <button
              onClick={() => setFilterStatus('success')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterStatus === 'success'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
            >
              Success ({failedScans.filter(s => s.scanStatus === 'success').length})
            </button>
            <button
              onClick={() => setFilterStatus('failed')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterStatus === 'failed'
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
            >
              Failed ({failedScans.filter(s => s.scanStatus !== 'success').length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {loadingScans ? (
        <div className="mx-6 text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-slate-600">Loading scan logs...</p>
        </div>
      ) : failedScans.length === 0 ? (
        <div className="mx-6 bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
          <svg className="w-16 h-16 mx-auto mb-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-lg font-semibold text-slate-900">No scan logs yet</p>
          <p className="text-sm text-slate-500 mt-1">Scan logs will appear once volunteers check in participants</p>
        </div>
      ) : (
        <div className="mx-6 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-wide font-medium text-slate-500">Time</th>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-wide font-medium text-slate-500">Event</th>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-wide font-medium text-slate-500">Checkpoint</th>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-wide font-medium text-slate-500">Volunteer</th>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-wide font-medium text-slate-500">Status</th>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-wide font-medium text-slate-500">Details</th>
                  <th className="px-6 py-3 text-left text-xs uppercase tracking-wide font-medium text-slate-500">Participant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {failedScans
                  .filter(scan => {
                    if (filterStatus === 'all') return true;
                    if (filterStatus === 'success') return scan.scanStatus === 'success';
                    if (filterStatus === 'failed') return scan.scanStatus !== 'success';
                    return true;
                  })
                  .map((scan) => (
                    <tr key={scan.id} className={`hover:bg-slate-50 transition-colors ${scan.scanStatus === 'success' ? 'bg-emerald-50/30' : ''
                      }`}>
                      <td className="px-6 py-3 text-xs text-slate-900 whitespace-nowrap">
                        {new Date(scan.timestamp).toLocaleDateString()} <br className="md:hidden" /> {new Date(scan.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-900 max-w-[140px] truncate">
                        {scan.eventName || 'Unknown'}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-900 whitespace-nowrap">
                        {scan.checkpoint || '-'}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-900 max-w-[150px]">
                        <div className="font-medium truncate">{scan.volunteerName || 'Unknown'}</div>
                        <div className="text-xs text-slate-500 truncate">{scan.volunteerEmail}</div>
                      </td>
                      <td className="px-6 py-3 text-sm whitespace-nowrap">
                        <span className={`inline-flex px-2.5 py-1 text-xs font-semibold rounded-full ${scan.scanStatus === 'success' ? 'bg-emerald-100 text-emerald-700' :
                            scan.scanStatus === 'invalid_qr' ? 'bg-rose-100 text-rose-700' :
                              scan.scanStatus === 'not_found' ? 'bg-amber-100 text-amber-700' :
                                scan.scanStatus === 'already_checked_in' ? 'bg-blue-100 text-blue-700' :
                                  scan.scanStatus === 'wrong_checkpoint' ? 'bg-purple-100 text-purple-700' :
                                    'bg-slate-100 text-slate-700'
                          }`}>
                          {scan.scanStatus ? scan.scanStatus.replace(/_/g, ' ').toLowerCase() : 'unknown'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm max-w-[180px]">
                        {scan.errorMessage ? (
                          <div className="text-rose-600 text-xs truncate" title={scan.errorMessage}>{scan.errorMessage}</div>
                        ) : (
                          <span className="text-slate-500 text-xs">-</span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-sm text-slate-900 max-w-[150px]">
                        {scan.userName ? (
                          <div>
                            <div className="font-medium truncate">{scan.userName}</div>
                            <div className="text-xs text-slate-500 truncate">{scan.userEmail}</div>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-xs">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-slate-200">
            {failedScans
              .filter(scan => {
                if (filterStatus === 'all') return true;
                if (filterStatus === 'success') return scan.scanStatus === 'success';
                if (filterStatus === 'failed') return scan.scanStatus !== 'success';
                return true;
              })
              .map((scan) => (
                <div key={scan.id} className={`p-4 space-y-2 ${scan.scanStatus === 'success' ? 'bg-emerald-50/30' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-slate-500">{new Date(scan.timestamp).toLocaleDateString()}</p>
                      <p className="text-sm font-medium text-slate-900">{scan.eventName || 'Unknown Event'}</p>
                    </div>
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${scan.scanStatus === 'success' ? 'bg-emerald-100 text-emerald-700' :
                        scan.scanStatus === 'invalid_qr' ? 'bg-rose-100 text-rose-700' :
                          scan.scanStatus === 'not_found' ? 'bg-amber-100 text-amber-700' :
                            scan.scanStatus === 'already_checked_in' ? 'bg-blue-100 text-blue-700' :
                              scan.scanStatus === 'wrong_checkpoint' ? 'bg-purple-100 text-purple-700' :
                                'bg-slate-100 text-slate-700'
                      }`}>
                      {scan.scanStatus ? scan.scanStatus.replace(/_/g, ' ').toLowerCase() : 'unknown'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-slate-500">Checkpoint</p>
                      <p className="font-medium text-slate-900">{scan.checkpoint || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Volunteer</p>
                      <p className="font-medium text-slate-900">{scan.volunteerName || 'Unknown'}</p>
                    </div>
                  </div>
                  {scan.userName && (
                    <div>
                      <p className="text-xs text-slate-500">Participant</p>
                      <p className="font-medium text-slate-900">{scan.userName}</p>
                    </div>
                  )}
                  {scan.errorMessage && (
                    <div className="text-xs text-rose-600 bg-rose-50 p-2 rounded">{scan.errorMessage}</div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
