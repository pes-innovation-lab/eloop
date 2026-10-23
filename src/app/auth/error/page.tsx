"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import ELogoLoader from "@/components/ui/ELogoLoader";

function ErrorContent() {
  const searchParams = useSearchParams();
  const [errorMessage, setErrorMessage] = useState<string>("An unknown error occurred.");

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam) {
      switch (errorParam) {
        case "Configuration":
          setErrorMessage("There is a problem with the server configuration.");
          break;
        case "AccessDenied":
          setErrorMessage("You do not have permission to sign in.");
          break;
        case "Verification":
          setErrorMessage("The verification link is no longer valid.");
          break;
        case "OAuthSignin":
          setErrorMessage("Error in the OAuth sign-in process.");
          break;
        case "OAuthCallback":
          setErrorMessage("Error in the OAuth callback process.");
          break;
        case "OAuthCreateAccount":
          setErrorMessage("Could not create OAuth account.");
          break;
        case "EmailCreateAccount":
          setErrorMessage("Could not create email account.");
          break;
        case "Callback":
          setErrorMessage("Error in the callback process.");
          break;
        default:
          setErrorMessage("An unknown error occurred.");
          break;
      }
    }
  }, [searchParams]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-md p-8 space-y-8 bg-white rounded-lg shadow-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-red-600">Authentication Error</h1>
          <p className="mt-4 text-gray-600">{errorMessage}</p>
        </div>
        <div className="mt-8">
          <Link href="/" className="block w-full text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function AuthError() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[40vh]">
          <ELogoLoader size={52} colorClass="text-red-600" label="Loading error details..." />
        </div>
      }
    >
      <ErrorContent />
    </Suspense>
  );
}
