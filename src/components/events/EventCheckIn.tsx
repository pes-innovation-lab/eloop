'use client';

import { useState } from 'react';
import { GenericQRScanner } from '../qr/GenericQRScanner';
import { Check, AlertTriangle, X, RefreshCw } from 'lucide-react';
import ELogoLoader from '@/components/ui/ELogoLoader';

interface CheckInProps {
  eventId: string;
  onSuccess?: () => void;
}

interface CheckInResponse {
  success: boolean;
  registration: {
    id: string;
    eventId: string;
    userId: string;
    status: 'registered' | 'checked-in';
    responses: Record<string, unknown>;
    checkedInAt?: Date;
  };
}

export const EventCheckIn: React.FC<CheckInProps> = ({ eventId, onSuccess }) => {
  const [isScanning, setIsScanning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<CheckInResponse | null>(null);

  const handleScan = async (qrData: string) => {
    if (isProcessing) return;

    try {
      setIsProcessing(true);
      setError(null);
      setScanResult(null);

      // Call the check-in API
      const response = await fetch('/api/events/check-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ qrToken: qrData }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to process check-in');
        return;
      }

      // Make sure this QR code is for this event
      if (data.registration.eventId !== eventId) {
        setError('This QR code is for a different event');
        return;
      }

      // Show success
      setScanResult(data);

      // Call onSuccess callback if provided
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setError('Failed to process QR code: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsProcessing(false);
      setIsScanning(false);
    }
  };

  // Reset scanner
  const resetScanner = () => {
    setIsScanning(true);
    setScanResult(null);
    setError(null);
  };

  if (!isScanning && !scanResult && !error) {
    return (
      <div className="p-4 bg-white rounded-lg shadow-md">
        <h3 className="text-lg font-semibold mb-2">Check-In Participants</h3>
        <p className="text-gray-600 mb-4">
          Scan participant QR codes to check them into this event.
        </p>
        <button
          onClick={() => setIsScanning(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Start Scanner
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white rounded-lg shadow-md">
      <h3 className="text-lg font-semibold mb-2">Check-In Participants</h3>

      {isScanning ? (
        <div>
          <GenericQRScanner
            onScan={handleScan}
            scannerDescription="Scan participant QR code"
            isActive={true}
          />
          <button
            onClick={() => setIsScanning(false)}
            className="mt-4 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div>
          {isProcessing ? (
            <div className="text-center py-8">
              <ELogoLoader size={56} colorClass="text-blue-500" label="Loading data..." className="mb-4" />
              <p className="text-gray-600">Processing check-in...</p>
            </div>
          ) : error ? (
            <div className="text-center py-4">
              <div className="bg-red-50 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <X className="text-red-500 w-8 h-8" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Check-In Failed</h2>
              <p className="text-red-600 mb-6">{error}</p>
              <button
                onClick={resetScanner}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-flex items-center"
              >
                <RefreshCw className="w-4 h-4 mr-2" /> Try Again
              </button>
            </div>
          ) : scanResult?.success ? (
            <div className="text-center py-4">
              <div className="bg-green-50 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <Check className="text-green-500 w-8 h-8" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Check-In Successful</h2>
              <p className="text-gray-600 mb-6">
                The participant has been checked in successfully.
              </p>
              <button
                onClick={resetScanner}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-flex items-center"
              >
                <RefreshCw className="w-4 h-4 mr-2" /> Scan Another
              </button>
            </div>
          ) : (
            <div className="text-center py-4">
              <div className="bg-yellow-50 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="text-yellow-500 w-8 h-8" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Something Went Wrong</h2>
              <p className="text-gray-600 mb-6">
                Please try scanning again.
              </p>
              <button
                onClick={() => setIsScanning(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 mr-2"
              >
                Cancel
              </button>
              <button
                onClick={resetScanner}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
