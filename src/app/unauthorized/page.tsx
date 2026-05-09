export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md w-full text-center px-6">
        <div className="mb-6 flex justify-center">
          <div className="flex size-20 items-center justify-center rounded-full bg-destructive/10">
            <span className="text-4xl">🚫</span>
          </div>
        </div>
        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>
        <p className="text-muted-foreground mb-6">
          You don&apos;t have permission to access the Routely Admin Portal.
          This area is restricted to Routely staff only.
        </p>
        <div className="space-y-2">
          <a
            href="https://app.routelypro.com/dashboard"
            className="flex w-full items-center justify-center h-11 rounded-xl font-semibold text-sm text-white"
            style={{ backgroundColor: "#0167FF" }}
          >
            Go to Client Portal
          </a>
          <a
            href="https://app.routelypro.com/login"
            className="flex w-full items-center justify-center h-11 rounded-xl border font-medium text-sm text-muted-foreground hover:bg-muted/30"
          >
            Sign in with a different account
          </a>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          If you believe this is an error, contact{" "}
          <a href="mailto:support@routelypro.com" className="text-primary hover:underline">
            support@routelypro.com
          </a>
        </p>
      </div>
    </div>
  );
}
