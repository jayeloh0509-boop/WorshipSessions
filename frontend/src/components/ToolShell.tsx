import type { ReactNode } from 'react';
import { useToast } from '../context/ToastContext';
import { copyText } from '../lib/clipboard';

interface ToolShellProps {
  navigate: (view: string) => void;
  title: string;
  subtitle: string;
  children: ReactNode;
}

// Shared frame for every tool page: back link, heading, intro, content card(s).
export function ToolShell({ navigate, title, subtitle, children }: ToolShellProps) {
  return (
    <div className="tools-page tool-subpage">
      <button className="btn btn-ghost btn-sm tool-back" onClick={() => navigate('tools')}>
        &#8592; Back to Tools
      </button>
      <h1 className="tools-title">{title}</h1>
      <p className="tools-subtitle">{subtitle}</p>
      {children}
    </div>
  );
}

interface CopyButtonProps {
  getText: () => string;
  label?: string;
  className?: string;
}

export function CopyButton({ getText, label = 'Copy result', className }: CopyButtonProps) {
  const toast = useToast();
  const onCopy = async () => {
    const ok = await copyText(getText());
    toast(ok ? 'Copied to clipboard' : 'Copy failed — select and copy manually', ok ? '' : 'error');
  };
  return (
    <button className={className || 'btn btn-sm'} onClick={onCopy}>
      {label}
    </button>
  );
}

export interface RelatedToolLink {
  label: string;
  onClick: () => void;
}

// Footer row of contextual jumps into sibling tools.
export function RelatedTools({ links }: { links: RelatedToolLink[] }) {
  if (links.length === 0) return null;
  return (
    <div className="tool-related">
      <span className="tool-chip-label">Take this further</span>
      <div className="tool-related-links">
        {links.map((l) => (
          <button key={l.label} className="btn btn-ghost btn-sm" onClick={l.onClick}>
            {l.label} &#8594;
          </button>
        ))}
      </div>
    </div>
  );
}
