import { useEffect } from 'react';
import { supabase } from '@/config/supabase';

type UseRealtimeOptions = {
  table: string;
  event: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  onUpdate: (payload: any) => void;
  schema?: string;
};

export const useRealtime = ({ table, event, onUpdate, schema = 'public' }: UseRealtimeOptions) => {
  useEffect(() => {
    const channel = supabase
      .channel(`admin_realtime_${table}`)
      .on(
        'postgres_changes',
        { event, schema, table },
        (payload) => {
          onUpdate(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, event, onUpdate, schema]);
};
