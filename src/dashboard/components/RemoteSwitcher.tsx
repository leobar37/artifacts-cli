import { Server } from 'lucide-react';
import type { RemoteSummary } from '../../types/artifact.js';
import { remoteUrl } from '../lib/project.js';
import { ScopeSwitcher } from './ScopeSwitcher.js';

interface RemoteSwitcherProps {
  /** Omitted on a local daemon: show the current machine, not a fictitious remote. */
  remoteId?: string;
  remotes?: RemoteSummary[];
}

export function RemoteSwitcher({ remoteId, remotes = [] }: RemoteSwitcherProps) {
  const local = remoteId === undefined;
  return (
    <ScopeSwitcher
      label="Remote"
      title="Switch remote"
      icon={Server}
      currentId={local ? '__local__' : remoteId}
      options={local ? [{
        id: '__local__',
        name: 'This machine',
        description: 'Local artifact daemon',
      }] : [...remotes].sort((a, b) => a.name.localeCompare(b.name)).map((remote) => ({
        id: remote.remoteId,
        name: remote.name,
        status: remote.status,
        description: `${remote.projectCount} project${remote.projectCount !== 1 ? 's' : ''} · ${remote.artifactCount} artifact${remote.artifactCount !== 1 ? 's' : ''}`,
      }))}
      onSelect={(id) => { window.location.href = remoteUrl(id); }}
      placeholder="Search remotes…"
      overviewHref={local ? undefined : '/'}
      overviewLabel="All remotes"
      hint={local ? 'Local mode · Open the broker dashboard to browse and switch between remote machines.' : undefined}
    />
  );
}
