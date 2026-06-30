import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { useAuth } from '@/auth/useAuth';
import { AdminOnly } from '@/auth/AdminOnly';
import { useToast } from '@/components/common/Toast';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { BusinessSubLayout } from '@/components/businesses/BusinessSubLayout';
import { reportError } from '@/lib/sentry';
import { FiTrash2 } from 'react-icons/fi';

type Note = {
  id: string;
  body: string;
  author_name: string | null;
  admin_user_id: string | null;
  created_at: string;
};

export const BusinessNotesPage = () => {
  const { id } = useParams<{ id: string }>();
  const { adminUser } = useAuth();
  const { toast } = useToast();

  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchNotes = useCallback(async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from('tenant_notes')
        .select('*')
        .eq('tenant_id', id)
        .order('created_at', { ascending: false });
      if (error) {
        // Table not deployed yet → show a friendly hint instead of a hard error.
        if (error.message?.toLowerCase().includes('tenant_notes')) {
          setMissingTable(true);
          return;
        }
        throw error;
      }
      setNotes((data as Note[]) ?? []);
    } catch (error) {
      reportError(error, { where: 'BusinessNotesPage.fetchNotes' });
      console.error('Error loading notes:', error);
      toast('Failed to load notes', 'error');
    } finally {
      setLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch on mount; setState runs after await, not during render
    fetchNotes();
  }, [fetchNotes]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !draft.trim() || !adminUser) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('tenant_notes').insert({
        tenant_id: id,
        admin_user_id: adminUser.id,
        author_name: adminUser.full_name || adminUser.email,
        body: draft.trim(),
      });
      if (error) throw error;
      setDraft('');
      toast('Note added.');
      fetchNotes();
    } catch (error) {
      reportError(error, { where: 'BusinessNotesPage.handleAdd' });
      console.error('Error adding note:', error);
      toast(error instanceof Error ? error.message : 'Failed to add note', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    try {
      const { error } = await supabase.from('tenant_notes').delete().eq('id', noteId);
      if (error) throw error;
      toast('Note deleted.');
      fetchNotes();
    } catch (error) {
      reportError(error, { where: 'BusinessNotesPage.handleDelete' });
      console.error('Error deleting note:', error);
      toast(error instanceof Error ? error.message : 'Failed to delete note', 'error');
    }
  };

  return (
    <BusinessSubLayout tenantId={id!}>
      {missingTable ? (
        <div className="page-card">
          <div className="empty-state">
            <p className="empty-state__text">
              The <code>tenant_notes</code> table isn't deployed yet. Run the{' '}
              <code>create_tenant_notes</code> migration on the Supabase project to enable internal notes.
            </p>
          </div>
        </div>
      ) : (
        <>
          <AdminOnly>
            <form onSubmit={handleAdd} className="page-card" style={{ marginBottom: '1.5rem' }}>
              <label className="form-label">Add an internal note</label>
              <textarea
                className="form-input"
                rows={3}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="e.g. Called owner 6/12 — promised to fix the transfer number by Friday."
                style={{ resize: 'vertical', marginBottom: '0.75rem' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" className="btn btn--primary" disabled={saving || !draft.trim()}>
                  {saving ? 'Saving…' : 'Add Note'}
                </button>
              </div>
            </form>
          </AdminOnly>

          {loading ? (
            <div className="page-card">
              <p>Loading notes…</p>
            </div>
          ) : notes.length === 0 ? (
            <div className="page-card">
              <div className="empty-state">
                <p className="empty-state__text">No notes yet. Internal notes are visible only to the admin team.</p>
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {notes.map((n) => (
                <div key={n.id} className="page-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                    <p style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}>{n.body}</p>
                    <AdminOnly>
                      <button
                        className="btn btn--ghost btn--sm"
                        style={{ color: 'hsl(var(--destructive))', flexShrink: 0 }}
                        onClick={() => setDeleteId(n.id)}
                        title="Delete note"
                      >
                        <FiTrash2 />
                      </button>
                    </AdminOnly>
                  </div>
                  <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
                    {n.author_name || 'Unknown'} · {new Date(n.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' })}
                  </p>
                </div>
              ))}
            </div>
          )}

          <ConfirmDialog
            isOpen={!!deleteId}
            title="Delete note"
            message="Permanently delete this internal note?"
            isDestructive
            confirmLabel="Delete"
            onConfirm={() => {
              if (deleteId) handleDelete(deleteId);
            }}
            onCancel={() => setDeleteId(null)}
          />
        </>
      )}
    </BusinessSubLayout>
  );
};
