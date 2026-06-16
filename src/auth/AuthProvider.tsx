import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabaseAuth, supabase } from '@/config/supabase';
import type { AdminRole, AdminUser } from '@/types/domain';
import { clearSentryUser, reportError, setSentryUser } from '@/lib/sentry';

export type AuthContextValue = {
  user: User | null;
  session: Session | null;
  adminUser: AdminUser | null;
  initializing: boolean;
  role: AdminRole | null;
  isAdmin: boolean;
  isViewer: boolean;
  hasBusinessAccess: boolean;
  hasInfraAccess: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [session, setSession] = useState<Session | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const loadAdminUser = useCallback(async (authUserId: string) => {
    try {
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .eq('auth_user_id', authUserId)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        setAdminUser(null);
        return;
      }
      setAdminUser(data as AdminUser);
    } catch (err) {
      reportError(err, { where: 'AuthProvider.loadAdminUser' });
      setAdminUser(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    supabaseAuth.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user) {
        loadAdminUser(s.user.id).finally(() => {
          if (mounted) setInitializing(false);
        });
      } else {
        setInitializing(false);
      }
    });

    const { data: listener } = supabaseAuth.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s?.user) {
        void loadAdminUser(s.user.id);
      } else {
        setAdminUser(null);
      }
    });

    return () => {
      mounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, [loadAdminUser]);

  // Identify the authenticated user to Sentry so errors can be filtered by user.
  useEffect(() => {
    const authUser = session?.user;
    if (!authUser?.id) {
      clearSentryUser();
      return;
    }
    setSentryUser({
      id: authUser.id,
      email: authUser.email ?? undefined,
    });
  }, [session]);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    setAuthError(null);
    const { error } = await supabaseAuth.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error(error.message);
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabaseAuth.auth.signOut();
    setAdminUser(null);
    setSession(null);
  }, []);

  const role = adminUser?.role ?? null;

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      adminUser,
      initializing,
      role,
      isAdmin: role === 'admin',
      isViewer: role === 'viewer',
      hasBusinessAccess: adminUser?.has_business_access ?? true,
      hasInfraAccess: adminUser?.has_infra_access ?? false,
      signInWithPassword,
      signOut,
    }),
    [session, adminUser, initializing, role, signInWithPassword, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
