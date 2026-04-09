'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { StatusIcon } from '@/components/StatusIcon';

interface SessionInfo {
  name: string;
  windows: number;
  attached: boolean;
  created: string;
  createdAt: number;   // epoch seconds — used for sorting newest-first
  workingDir: string;
  lastActivity: string;
  claudeState: 'busy' | 'permission' | 'waiting' | 'idle' | 'error' | null;
}

export function SessionList({
  refreshKey,
  openTabs,
  activeTab,
  onAttach,
  onDetach,
  onRefresh,
  onNewInDir,
  onRename,
  onKill,
}: {
  refreshKey: number;
  openTabs: string[];
  activeTab: string | null;
  onAttach: (name: string) => void;
  onDetach: (name: string) => void;
  onRefresh: () => void;
  onNewInDir?: (workingDir: string) => void;
  onRename?: (oldName: string, newName: string) => void;
  onKill?: (name: string) => void;
}) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSession, setEditingSession] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions');
      const data = await res.json();
      setSessions(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    const interval = setInterval(fetchSessions, 5000);
    return () => clearInterval(interval);
  }, [fetchSessions, refreshKey]);

  // Close menu on outside click or Escape
  useEffect(() => {
    if (!openMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [openMenu]);

  if (loading) {
    return <p className="text-muted text-sm px-2">Loading...</p>;
  }

  if (sessions.length === 0) {
    return (
      <p className="text-muted text-sm px-2">
        No sessions running.
      </p>
    );
  }

  // Helper to normalize working directory path
  const normalizeWorkingDir = (workingDir: string): string => {
    return workingDir.replace(/^\$HOME/, '~');
  };

  // Helper to group sessions by directory. Within a group, newest sessions
  // come first (highest createdAt). Folders are sorted by path — stable
  // alphabetical order regardless of recent activity, so the list doesn't
  // reshuffle on you as sessions tick over.
  interface DirectoryGroup {
    dir: string;
    sessions: SessionInfo[];
  }

  const groupByDirectory = (sessionsList: SessionInfo[]): DirectoryGroup[] => {
    const groups = new Map<string, SessionInfo[]>();

    sessionsList.forEach(session => {
      const dir = normalizeWorkingDir(session.workingDir);
      if (!groups.has(dir)) {
        groups.set(dir, []);
      }
      groups.get(dir)!.push(session);
    });

    const result: DirectoryGroup[] = [];
    groups.forEach((groupSessions, dir) => {
      const sortedSessions = [...groupSessions].sort(
        (a, b) => b.createdAt - a.createdAt,
      );
      result.push({ dir, sessions: sortedSessions });
    });

    return result;
  };

  // Show only ATTACHED sessions (the ones in openTabs). Everything else is
  // detached and lives in the "Open session..." dropdown, not here.
  const attachedSessions = sessions.filter((s) => openTabs.includes(s.name));

  // Grouped by folder, alphabetical by folder path (case-insensitive), with
  // newest sessions first within each folder.
  const allGroups = groupByDirectory(attachedSessions);
  allGroups.sort((a, b) =>
    a.dir.toLowerCase().localeCompare(b.dir.toLowerCase()),
  );

  // Strip longest common directory prefix across all groups for shorter display
  const allDirs = allGroups.map(g => g.dir);
  let commonPrefix = '';
  if (allDirs.length > 1) {
    const parts = allDirs[0].split('/');
    for (let i = 0; i < parts.length; i++) {
      const candidate = parts.slice(0, i + 1).join('/') + '/';
      if (allDirs.every(d => d.startsWith(candidate))) {
        commonPrefix = candidate;
      } else {
        break;
      }
    }
  }
  const shortDir = (dir: string) => {
    if (commonPrefix && dir.startsWith(commonPrefix)) {
      return dir.slice(commonPrefix.length) || dir;
    }
    return dir;
  };

  const commitRename = async (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName || !/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setEditingSession(null);
      return;
    }
    try {
      const res = await fetch('/api/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName, newName: trimmed }),
      });
      if (res.ok) {
        onRename?.(oldName, trimmed);
        fetchSessions();
      }
    } catch {
      // silent
    }
    setEditingSession(null);
  };

  const handleRestart = async (name: string) => {
    try {
      await fetch('/api/sessions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restart', name }),
      });
      fetchSessions();
    } catch {
      // silent
    }
  };

  // Render a session item
  const renderSession = (s: SessionInfo) => {
    const isOpen = openTabs.includes(s.name);
    const isActive = s.name === activeTab;
    const isEditing = editingSession === s.name;
    const isMenuOpen = openMenu === s.name;

    return (
      <div
        key={s.name}
        className={`flex items-center justify-between gap-2 pl-6 pr-1.5 py-2 rounded-lg cursor-pointer transition-colors ${
          isActive
            ? 'bg-surface-hover text-primary'
            : 'text-secondary hover:bg-surface-hover hover:text-primary'
        }`}
        onClick={() => !isEditing && onAttach(s.name)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <StatusIcon
              state={s.claudeState}
              attached={openTabs.includes(s.name)}
            />
            {isEditing ? (
              <input
                ref={editInputRef}
                className="font-mono text-sm bg-surface border border-border rounded px-1 py-0 w-full outline-none focus:border-muted"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(s.name, editValue);
                  if (e.key === 'Escape') setEditingSession(null);
                }}
                onBlur={() => commitRename(s.name, editValue)}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="font-mono text-[15px] md:text-sm truncate">
                {s.name}
              </span>
            )}
          </div>
          <div className="text-[13px] md:text-xs text-muted ml-3 truncate flex items-center gap-1.5">
            {s.claudeState === 'busy' && (
              <span className="text-blue-400">working</span>
            )}
            {s.claudeState === 'permission' && (
              <span className="text-yellow-400">permission</span>
            )}
            {s.claudeState === 'waiting' && (
              <span className="text-amber-400">input needed</span>
            )}
            {s.claudeState === 'idle' && (
              <span className="text-green-400">idle</span>
            )}
            {s.claudeState === 'error' && (
              <span className="text-red-400">error</span>
            )}
            {s.lastActivity}
          </div>
        </div>

        {/* Dropdown menu trigger */}
        <div className="relative shrink-0" ref={isMenuOpen ? menuRef : undefined}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpenMenu(isMenuOpen ? null : s.name);
            }}
            className="w-8 h-8 flex items-center justify-center text-muted hover:text-primary rounded transition-colors hover:bg-surface"
            title="Actions"
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="8" cy="3" r="1.5" />
              <circle cx="8" cy="8" r="1.5" />
              <circle cx="8" cy="13" r="1.5" />
            </svg>
          </button>

          {isMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-36 bg-surface border border-border rounded-lg shadow-lg z-50 py-1 text-sm">
              {/* Detach — only if session is open in a tab */}
              {isOpen && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDetach(s.name);
                    setOpenMenu(null);
                  }}
                  className="w-full text-left px-3 py-2.5 text-secondary hover:bg-surface-hover transition-colors"
                >
                  Detach
                </button>
              )}

              {/* Restart — exits Claude and resumes with same session ID */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRestart(s.name);
                  setOpenMenu(null);
                }}
                className="w-full text-left px-3 py-2.5 text-secondary hover:bg-surface-hover transition-colors"
              >
                Restart
              </button>

              {/* Rename */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenMenu(null);
                  setEditingSession(s.name);
                  setEditValue(s.name);
                  setTimeout(() => editInputRef.current?.select(), 0);
                }}
                className="w-full text-left px-3 py-2.5 text-secondary hover:bg-surface-hover transition-colors"
              >
                Rename
              </button>

              {/* Kill — destructive, separated */}
              {onKill && (
                <>
                  <div className="border-t border-border my-1" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onKill(s.name);
                      setOpenMenu(null);
                    }}
                    className="w-full text-left px-3 py-2.5 text-red-400 hover:bg-surface-hover transition-colors"
                  >
                    Kill
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {allGroups.map(group => (
        <div key={group.dir}>
          <div className="flex items-center justify-between text-[13px] md:text-xs text-muted px-2 mb-1">
            <span className="font-mono truncate">{shortDir(group.dir)}</span>
            {onNewInDir && (
              <button
                onClick={(e) => { e.stopPropagation(); onNewInDir(group.dir); }}
                className="text-muted hover:text-primary shrink-0 ml-1"
                title="New session in this folder"
              >+</button>
            )}
          </div>
          <div className="space-y-1">
            {group.sessions.map(renderSession)}
          </div>
        </div>
      ))}
    </div>
  );
}
