import Link from "next/link";

export function GuestDocumentFooter({ redirectPath = "/account/sales-documents" }: { redirectPath?: string }) {
  const loginHref = `/login?redirect=${encodeURIComponent(redirectPath)}`;
  const signupHref = `/auth/signup?redirect=${encodeURIComponent(redirectPath)}`;

  return (
    <div className="mt-10 border-t border-neutral-200 pt-6 text-center text-sm text-neutral-600">
      <p>
        Already have a Shalean account?{" "}
        <Link href={loginHref} className="font-medium text-blue-600 hover:underline">
          Sign in
        </Link>
        {" · "}
        <Link href={signupHref} className="font-medium text-blue-600 hover:underline">
          Create account
        </Link>
      </p>
    </div>
  );
}
