import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient, { unwrapApiData } from '../../api/client';
import { useAuthStore } from '../../stores/auth.store';
import { formatDate } from '../../utils/date';

type CommentEntityType = 'SCENARIO' | 'HYPOTHESIS';

type CommentItem = {
  id: string;
  org_id: string;
  user_id: string;
  entity_type: CommentEntityType;
  entity_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    first_name: string;
    last_name: string;
  };
};

interface CommentSectionProps {
  entityType: CommentEntityType;
  entityId: string;
  title?: string;
}

export default function CommentSection({ entityType, entityId, title = 'Commentaires' }: CommentSectionProps) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState('');
  const canWrite = user?.role === 'SUPER_ADMIN' || user?.role === 'FPA';

  const commentsQuery = useQuery({
    queryKey: ['comments', entityType, entityId],
    queryFn: () => apiClient.get<CommentItem[]>(`/comments/${entityType}/${entityId}`).then(unwrapApiData),
  });

  const addComment = useMutation({
    mutationFn: () =>
      apiClient
        .post('/comments', {
          entity_type: entityType,
          entity_id: entityId,
          content: newComment.trim(),
        })
        .then(unwrapApiData),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['comments', entityType, entityId] });
      setNewComment('');
    },
  });

  const deleteComment = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/comments/${id}`).then(unwrapApiData),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['comments', entityType, entityId] });
    },
  });

  const comments = commentsQuery.data ?? [];

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        padding: '20px 24px',
        marginTop: 16,
      }}
    >
      <p
        style={{
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--text-lo)',
          marginBottom: 16,
        }}
      >
        Commentaires {title} ({comments.length})
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        {!commentsQuery.isLoading && comments.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-lo)', fontStyle: 'italic' }}>Aucun commentaire pour l'instant</p>
        ) : null}

        {comments.map((comment) => (
          <div
            key={comment.id}
            style={{
              background: 'var(--surface2)',
              borderRadius: 10,
              padding: '12px 16px',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: 'var(--ink)',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {(comment.user?.first_name?.[0] ?? '').toUpperCase()}
                  {(comment.user?.last_name?.[0] ?? '').toUpperCase()}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-hi)' }}>
                  {comment.user?.first_name} {comment.user?.last_name}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-lo)' }}>{formatDate(comment.created_at, 'short')}</span>
              </div>

              {canWrite && comment.user_id === user?.id ? (
                <button
                  onClick={() => deleteComment.mutate(comment.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 12,
                    color: 'var(--text-lo)',
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}
                  title="Supprimer"
                >
                  X
                </button>
              ) : null}
            </div>

            <p style={{ fontSize: 13, color: 'var(--text-hi)', lineHeight: 1.5, margin: 0 }}>{comment.content}</p>
          </div>
        ))}
      </div>

      {canWrite ? (
        <>
          <div style={{ display: 'flex', gap: 10 }}>
            <textarea
              value={newComment}
              onChange={(event) => setNewComment(event.target.value)}
              placeholder="Ajouter un commentaire..."
              rows={2}
              style={{
                flex: 1,
                padding: '10px 14px',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 13,
                fontFamily: 'var(--font-body)',
                resize: 'vertical',
                outline: 'none',
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && event.ctrlKey) {
                  if (newComment.trim()) {
                    addComment.mutate();
                  }
                }
              }}
            />
            <button
              onClick={() => {
                if (newComment.trim()) {
                  addComment.mutate();
                }
              }}
              disabled={!newComment.trim() || addComment.isPending}
              style={{
                padding: '0 18px',
                background: newComment.trim() ? 'var(--terra)' : 'var(--text-lo)',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                cursor: newComment.trim() ? 'pointer' : 'not-allowed',
                fontSize: 13,
                fontWeight: 600,
                alignSelf: 'flex-end',
                height: 40,
              }}
            >
              {addComment.isPending ? '...' : 'Envoyer'}
            </button>
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-lo)', marginTop: 4 }}>Ctrl+Entrée pour envoyer rapidement</p>
        </>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--text-lo)', marginTop: 10 }}>
          Mode lecture : vous pouvez consulter les commentaires mais pas en ajouter.
        </p>
      )}
    </div>
  );
}
