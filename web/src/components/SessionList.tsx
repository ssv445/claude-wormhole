'use client';

import { useEffect, useState, useCallback } from 'react';

interface SessionInfo {
  name: string;
  windows: number;
  attached: boolean;
  created: string;
  workingDir: string;
  lastActivity: string;
}

export function SessionList({
  refreshKey,
  openTabs,
  activeTab,
  onAttach,
  onDetach,
  onRefresh,
  onNewInDir,
}: {
  refreshKey: number;
  openTabs: string[];
  activeTab: string | null;
  onAttach: (name: string) => void;
  onDetach: (name: string) => void;
  onRefresh: () => void;
  onNewInDir?: (workingDir: string) => void;
}) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Helper to parse activity time for sorting
  const parseActivityTime = (activity: string): Date => {
    const now = Date.now();
    const match = activity.match(/^(\d+)([smhd])/);

    if (activity === 'just now') return new Date(now);
    if (!match) return new Date(0);

    const value = parseInt(match[1]);
    const unit = match[2];

    const multipliers: Record<string, number> = {
      's': 1000,
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000
    };

    return new Date(now - value * (multipliers[unit] || 0));
  };

  // Helper to group sessions by directory
  interface DirectoryGroup {
    dir: string;
    sessions: SessionInfo[];
    mostRecentActivity: Date;
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
      // Sort sessions within group by name
      const sortedSessions = [...groupSessions].sort((a, b) =>
        parseActivityTime(b.lastActivity).getTime() - parseActivityTime(a.lastActivity).getTime()
      );

      // Find most recent activity in this group
      const mostRecent = groupSessions.reduce((latest, session) => {
        const sessionTime = parseActivityTime(session.lastActivity);
        return sessionTime > latest ? sessionTime : latest;
      }, new Date(0));

      result.push({
        dir,
        sessions: sortedSessions,
        mostRecentActivity: mostRecent
      });
    });

    return result;
  };

  // Split sessions into attached and available
  const attachedSessions = sessions.filter(s => openTabs.includes(s.name));
  const availableSessions = sessions.filter(s => !openTabs.includes(s.name));

  // Group both sets
  const attachedGroups = groupByDirectory(attachedSessions);
  const availableGroups = groupByDirectory(availableSessions);

  // Sort available groups by most recent activity
  availableGroups.sort((a, b) => b.mostRecentActivity.getTime() - a.mostRecentActivity.getTime());

  // Render a session item
  const renderSession = (s: SessionInfo) => {
    const isOpen = openTabs.includes(s.name);
    const isActive = s.name === activeTab;

    return (
      <div
        key={s.name}
        className={`flex items-center justify-between gap-2 pl-6 pr-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
          isActive
            ? 'bg-surface-hover text-primary'
            : 'text-secondary hover:bg-surface-hover hover:text-primary'
        }`}
        onClick={() => onAttach(s.name)}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isOpen ? 'bg-green-400' : 'bg-muted'}`} />
            <span className="font-mono text-sm truncate">{s.name}</span>
          </div>
          <div className="text-xs text-muted ml-3 truncate">
            {s.windows}w &middot; {s.lastActivity}
          </div>
        </div>

        {isOpen && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDetach(s.name);
            }}
            className="text-xs text-muted hover:text-primary shrink-0 px-1.5 py-0.5 rounded transition-colors hover:bg-surface"
            title="Detach"
          >
            detach
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Attached section */}
      {attachedGroups.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted uppercase tracking-wider px-2 mb-2">
            Attached
          </div>
          <div className="space-y-2">
            {attachedGroups.map(group => (
              <div key={group.dir}>
                <div className="flex items-center justify-between text-xs text-muted px-2 mb-1">
                  <span className="font-mono truncate">{group.dir}</span>
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
        </div>
      )}

      {/* Available section */}
      {availableGroups.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted uppercase tracking-wider px-2 mb-2">
            Available
          </div>
          <div className="space-y-2">
            {availableGroups.map(group => (
              <div key={group.dir}>
                <div className="flex items-center justify-between text-xs text-muted px-2 mb-1">
                  <span className="font-mono truncate">{group.dir}</span>
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
        </div>
      )}
    </div>
  );
}
