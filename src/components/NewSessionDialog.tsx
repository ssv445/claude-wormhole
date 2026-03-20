'use client';

import { useState, useEffect } from 'react';

const SESSION_NAME_RE = /^[a-zA-Z0-9_-]+$/;

/** Sanitize a folder name into a valid session name prefix */
function sanitizeName(folderName: string): string {
  return folderName
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'session';
}

/** Compute next session name like "project-1", "project-2", etc. */
function nextSessionName(prefix: string, existingNames: string[]): string {
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`);
  let max = 0;
  for (const name of existingNames) {
    const m = name.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${max + 1}`;
}

interface ProjectsResponse {
  baseDir: string | null;
  projects: string[];
}

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
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  // Projects state
  const [projectsData, setProjectsData] = useState<ProjectsResponse | null>(null);
  const [selectedProject, setSelectedProject] = useState('');
  const [fallbackDir, setFallbackDir] = useState(initialDir ?? '');

  // Fetch projects on mount
  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data: ProjectsResponse) => {
        setProjectsData(data);
        if (data.baseDir && data.projects.length > 0 && initialDir) {
          // Pre-select project matching initialDir (suffix match handles ~/path vs /abs/path)
          const match = data.projects.find(
            (p) => initialDir.endsWith('/' + p) || initialDir === p
          );
          if (match) {
            setSelectedProject(match);
          }
        }
      })
      .catch(() => {
        // Failed to fetch — fall back to free-text
        setProjectsData({ baseDir: null, projects: [] });
      });
  }, [initialDir]);

  // Auto-generate session name when project selection changes
  useEffect(() => {
    if (!selectedProject) return;
    const folderName = selectedProject.split('/').pop() ?? selectedProject;
    const prefix = sanitizeName(folderName);
    const controller = new AbortController();

    fetch('/api/sessions', { signal: controller.signal })
      .then((r) => r.json())
      .then((sessions: { name: string }[]) => {
        const names = sessions.map((s) => s.name);
        setName(nextSessionName(prefix, names));
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setName(`${prefix}-1`);
      });

    return () => controller.abort();
  }, [selectedProject]);

  const hasProjects = projectsData && projectsData.baseDir && projectsData.projects.length > 0;

  function getWorkingDir(): string | undefined {
    if (hasProjects && selectedProject) {
      return `${projectsData!.baseDir}/${selectedProject}`;
    }
    return fallbackDir || undefined;
  }

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
    if (hasProjects && !selectedProject) {
      setError('Select a project');
      return;
    }

    setCreating(true);
    setError('');

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, workingDir: getWorkingDir() }),
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

  // Loading state
  if (!projectsData) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
        <div className="bg-surface border border-border rounded-xl p-5 w-full max-w-sm text-center">
          <p className="text-sm text-secondary">Loading projects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-surface border border-border rounded-xl p-5 w-full max-w-sm space-y-4"
      >
        <h2 className="text-lg font-semibold">New Session</h2>

        {/* Project picker or free-text dir */}
        {hasProjects ? (
          <div>
            <label className="block text-sm text-secondary mb-1">Project</label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 bg-input-bg border border-input-border rounded-md text-sm font-mono focus:outline-none focus:border-input-focus"
            >
              <option value="">Select a project...</option>
              {projectsData!.projects.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="block text-sm text-secondary mb-1">
              Working directory{' '}
              <span className="text-muted">(optional)</span>
            </label>
            <input
              type="text"
              value={fallbackDir}
              onChange={(e) => setFallbackDir(e.target.value)}
              placeholder="~/projects/my-app"
              className="w-full px-3 py-2 bg-input-bg border border-input-border rounded-md text-sm font-mono focus:outline-none focus:border-input-focus"
            />
          </div>
        )}

        {/* Session name */}
        <div>
          <label className="block text-sm text-secondary mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-session"
            autoFocus={!hasProjects}
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
