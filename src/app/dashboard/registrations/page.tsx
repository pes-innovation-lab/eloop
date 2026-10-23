'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { GenericQRDisplay } from '@/components/qr/GenericQRDisplay';

interface Registration {
  id: string;
  eventId: string;
  eventName: string;
  eventDate: string;
  qrCode: string;
  status: 'pending' | 'approved' | 'rejected' | 'checked-in';
  checkedInAt?: string;
  // For organizers/admins viewing all registrations
  userId?: string;
  userName?: string;
  userEmail?: string;
}

export default function RegistrationsPage() {
  const { data: session } = useSession();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRegistration, setSelectedRegistration] = useState<Registration | null>(null);

  // Check if user is participant (only participants should see QR codes)
  const isParticipant = session?.user?.role === 'participant';

  useEffect(() => {
    const fetchRegistrations = async () => {
      try {
        const response = await fetch('/api/events/registrations');

        if (!response.ok) {
          throw new Error('Failed to fetch registrations');
        }

        const data = await response.json();
        setRegistrations(data.registrations);
      } catch (err) {
        console.error('Error fetching registrations:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    if (session?.user) {
      fetchRegistrations();
    }
  }, [session]);

  // Just use the global refresh mechanism managed by the hook

  if (!session?.user) {
    return (
      <div className="mx-6 py-6">
        <div className="bg-amber-50 border border-amber-200 text-amber-700 px-5 py-4 rounded-xl">
          <p>Sign in to view your registrations.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-6 py-6">
        <h1 className="text-2xl font-semibold text-slate-900 mb-6">
          {isParticipant ? 'Your Registrations' : 'All Registrations'}
        </h1>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <div className="h-6 bg-slate-200 rounded w-1/3 mb-4"></div>
              <div className="h-4 bg-slate-200 rounded w-1/4 mb-2"></div>
              <div className="h-4 bg-slate-200 rounded w-full mb-2"></div>
              <div className="h-4 bg-slate-200 rounded w-2/3"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-6 py-6">
        <h1 className="text-2xl font-semibold text-slate-900 mb-6">
          {isParticipant ? 'Your Registrations' : 'All Registrations'}
        </h1>
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-5 py-4 rounded-xl">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // If a registration is selected and user is a participant with approved status, show its QR code
  if (selectedRegistration && isParticipant) {
    // Only show QR code if registration is approved or checked-in
    if (selectedRegistration.status !== 'approved' && selectedRegistration.status !== 'checked-in') {
      return (
        <div className="mx-6 py-6">
          <button
            onClick={() => setSelectedRegistration(null)}
            className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium mb-6"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Registrations
          </button>

          <div className="bg-amber-50 border border-amber-200 text-amber-700 px-5 py-4 rounded-xl space-y-1">
            <p className="font-medium">Registration Pending Approval</p>
            <p className="text-sm">Your registration is awaiting approval from the event organizer. You&apos;ll access your QR code once approved.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="mx-6 py-6">
        <button
          onClick={() => setSelectedRegistration(null)}
          className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium mb-6"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Registrations
        </button>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">{selectedRegistration.eventName}</h2>
            <p className="text-slate-600 mt-2">
              {new Date(selectedRegistration.eventDate).toLocaleDateString()} at{' '}
              {new Date(selectedRegistration.eventDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>

          <div className="flex justify-center">
            <GenericQRDisplay
              qrData={selectedRegistration.qrCode}
              title="Your Check-in QR Code"
              description="Show this to event staff upon arrival"
              showDownload={true}
              userName={selectedRegistration.userName}
              eventName={selectedRegistration.eventName}
            />
          </div>

          <div className="border-t border-slate-200 pt-4">
            <h3 className="font-medium text-slate-900 mb-3">Status</h3>
            <div className="flex items-center gap-2">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${selectedRegistration.status === 'checked-in' ? 'bg-emerald-500' : 'bg-indigo-500'
                }`}></span>
              <span className="text-slate-700">
                {selectedRegistration.status === 'checked-in'
                  ? `Checked in ${new Date(selectedRegistration.checkedInAt || '').toLocaleDateString()}`
                  : '✓ Approved - Ready to check in'}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mx-6 pt-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          {isParticipant ? 'Your Registrations' : 'All Registrations'}
        </h1>
        <p className="text-slate-500 mt-1">Track your event registrations and check-in status</p>
      </div>

      {registrations.length === 0 ? (
        <div className="mx-6 bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
          <p className="text-slate-600">
            {isParticipant
              ? "You haven't registered for any events yet."
              : "No registrations found."}
          </p>
          {isParticipant && (
            <Link href="/dashboard/events" className="text-indigo-600 hover:text-indigo-700 font-medium mt-4 inline-block">
              Browse upcoming events
            </Link>
          )}
        </div>
      ) : (
        <div className="mx-6 space-y-4">
          {registrations.map((registration) => (
            <div key={registration.id} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
              <div>
                <h2 className="font-semibold text-lg text-slate-900">{registration.eventName}</h2>
                <p className="text-slate-600 text-sm mt-1">
                  {new Date(registration.eventDate).toLocaleDateString()} at{' '}
                  {new Date(registration.eventDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
                {/* Show user info for organizers/admins */}
                {!isParticipant && registration.userName && (
                  <p className="text-sm text-slate-700 mt-2">
                    <span className="font-medium">Participant:</span> {registration.userName} ({registration.userEmail})
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 py-2 border-t border-slate-200">
                <span className={`inline-block w-2 h-2 rounded-full ${registration.status === 'checked-in' ? 'bg-emerald-500' :
                  registration.status === 'approved' ? 'bg-indigo-500' :
                    registration.status === 'rejected' ? 'bg-rose-500' : 'bg-amber-500'
                  }`}></span>
                <span className="text-sm font-medium text-slate-700">
                  {registration.status === 'checked-in'
                    ? `✓ Checked in ${new Date(registration.checkedInAt || '').toLocaleDateString()}`
                    : registration.status === 'approved'
                      ? '✓ Approved'
                      : registration.status === 'rejected'
                        ? '✗ Rejected'
                        : '⏳ Pending'}
                </span>
              </div>

              <div className="flex gap-3">
                {/* Only participants with approved or checked-in status can see their QR codes */}
                {isParticipant && (registration.status === 'approved' || registration.status === 'checked-in') && (
                  <button
                    onClick={() => setSelectedRegistration(registration)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm transition-colors"
                  >
                    Show QR Code
                  </button>
                )}
                <Link
                  href={`/dashboard/events/${registration.eventId}`}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 font-medium text-sm transition-colors"
                >
                  Event Details
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
