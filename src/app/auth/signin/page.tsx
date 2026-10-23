import { Suspense } from "react";
import SignInClient from "@/components/auth/SignInClient";
import { getMissingEnvVars } from "@/lib/env";
import ELogoLoader from "@/components/ui/ELogoLoader";

export default function SignIn() {
  const missing = getMissingEnvVars();
  if (missing.length > 0) {
    // Minimal, left-aligned warning with more breathing room
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-md">
          <div className="bg-white border border-yellow-100 rounded-lg p-5 shadow-sm text-left">
            <h2 className="text-lg font-semibold text-yellow-900 mb-2">Missing environment variables</h2>

            <p className="text-sm text-gray-700 mb-3">Add the variables below and redeploy to enable authentication & database.</p>

            <ul className="grid gap-1 text-sm font-mono text-gray-800 mb-3">
              {missing.map((v) => (
                <li key={v} className="truncate">{v}</li>
              ))}
            </ul>

            <div className="flex gap-2">
              <a
                className="text-sm px-3 py-1 bg-yellow-600 text-white rounded"
                href="https://github.com/homebrew-ec-foss/eloop/blob/main/README.md#setup-env-variables"
                target="_blank"
                rel="noreferrer"
              >
                README
              </a>

              <a
                className="text-sm px-3 py-1 border border-gray-200 rounded text-gray-700"
                href="https://github.com/homebrew-ec-foss/eloop/blob/main/.env.example"
                target="_blank"
                rel="noreferrer"
              >
                .env.example
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[40vh]">
          <ELogoLoader size={52} colorClass="text-indigo-600" label="Loading sign-in..." />
        </div>
      }
    >
      <SignInClient />
    </Suspense>
  );
}
