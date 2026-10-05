import type { SessionMode } from '../hooks/useSetlistSession';

interface SessionControlProps {
  mode: SessionMode;
  onModeChange: (mode: SessionMode) => void;
  canLead: boolean;
  canFollow: boolean;
  leaderPresent: boolean;
  host?: string;
  error: string | null;
}

/**
 * Compact "now playing" sync control for the setlist player. Solo is the
 * default and changes nothing; Lead shares your position, Follow tracks the
 * leader's.
 */
export function SessionControl({ mode, onModeChange, canLead, canFollow, leaderPresent, host, error }: SessionControlProps) {
  if (!canLead && !canFollow) return null;

  const options: Array<{ value: SessionMode; label: string; enabled: boolean }> = [
    { value: 'solo', label: 'Solo', enabled: true },
    { value: 'lead', label: 'Lead', enabled: canLead },
    { value: 'follow', label: 'Follow', enabled: canFollow && !canLead },
  ];
  const visible = options.filter((option) => option.enabled);
  if (visible.length < 2) return null;

  let status = '';
  if (mode === 'lead') status = 'Sharing your position';
  else if (mode === 'follow') status = leaderPresent ? `Following ${host || 'leader'}` : 'Waiting for the leader';

  return (
    <div className="session-control" role="group" aria-label="Band sync">
      <div className="session-control-modes">
        {visible.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`session-control-mode${mode === option.value ? ' active' : ''}`}
            aria-pressed={mode === option.value}
            onClick={() => onModeChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {(status || error) && (
        <span className={`session-control-status${error ? ' error' : ''}`} role="status" aria-live="polite">
          {error || status}
        </span>
      )}
    </div>
  );
}
