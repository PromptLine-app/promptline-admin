import * as Sentry from '@sentry/react';

// Public DSN — safe to embed. Overridable via VITE_SENTRY_DSN.
const DEFAULT_DSN =
  'https://7887d63331c983a15f0e09124cbea3bb@o4511564677447680.ingest.us.sentry.io/4511564682297344';

const getDsn = () => import.meta.env.VITE_SENTRY_DSN ?? DEFAULT_DSN;

// Env is explicit (do NOT infer from the Supabase URL — the prod frontend still
// points at the sandbox Supabase project until the pending cutover).
const getEnvironment = () => import.meta.env.VITE_APP_ENV ?? 'sandbox';

export const initSentry = () => {
  const dsn = getDsn();
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment: getEnvironment(),
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
  });
};

type SentryUser = {
  id: string;
  email?: string;
  tenant_id?: string;
};

export const setSentryUser = (user: SentryUser) => {
  Sentry.setUser(user);
};

export const clearSentryUser = () => {
  Sentry.setUser(null);
};

export function reportError(error: unknown, context?: Record<string, unknown>) {
  // no-op safe if Sentry not initialized; never throw from here
  try {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  } catch {
    /* ignore */
  }
}
