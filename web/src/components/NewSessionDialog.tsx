'use client';

import { useState } from 'react';

const SESSION_NAME_RE = /^[a-zA-Z0-9_-]+$/;

export function NewSessionDialog({
  onClose,
  onCreated,
  initialDir,
}: {
  onClose: () => void;
  onCreated: (name: string) => void;
  initialDir?: string;
}) {
  const [name, setName] = useState('');
  const [dir, setDir] = useState(initialDir ?? '');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();

    if (!trimmed) {
      setError('Name is required');
      return;
    }
    if (!SESSION_NAME_RE.test(trimmed)) {
      setError('Only letters, numbers, hyphens, underscores');
      return;
    }

    setCreating(true);
    setError('');

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, workingDir: dir || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create session');
        setCreating(false);
        return;
      }
      onCreated(trimmed);
    } catch {
      setError('Network error');
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-surface border border-border rounded-xl p-5 w-full max-w-sm space-y-4"
      >
        <h2 className="text-lg font-semibold">New Session</h2>

        <div>
          <label className="block text-sm text-secondary mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-session"
            autoFocus
            className="w-full px-3 py-2 bg-input-bg border border-input-border rounded-md text-sm font-mono focus:outline-none focus:border-input-focus"
          />
        </div>

        <div>
          <label className="block text-sm text-secondary mb-1">
            Working directory{' '}
            <span className="text-muted">(optional)</span>
          </label>
          <input
            type="text"
            value={dir}
            onChange={(e) => setDir(e.target.value)}
            placeholder="~/projects/my-app"
            className="w-full px-3 py-2 bg-input-bg border border-input-border rounded-md text-sm font-mono focus:outline-none focus:border-input-focus"
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-secondary hover:text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={creating}
            className="px-4 py-2 bg-surface-hover hover:bg-input-border rounded-md text-sm font-medium transition-colors disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  );
}
