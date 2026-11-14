import React, { useRef, useState } from 'react';
import { Database, Download, ShieldCheck, Upload } from 'lucide-react';
import type { Employee, HRPolicy, LeavePlan, PlannerSettings } from '../types';
import type { DataSnapshot, DataStore, StoreBackend } from '../data/DataStore';
import {
  createSnapshot,
  parseSnapshot,
  snapshotFileName,
  snapshotToJson,
} from '../data/snapshot';
import { Callout } from './Callout';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * The Admin snapshot card: what this browser holds, and the one file that moves it.
 *
 * This component is deliberately presentational-plus-intents, like every other
 * section: the parent owns the datasets, and the only side effects here are the
 * export download and the `store.importSnapshot` call the user confirmed. The
 * export serialises the datasets the parent handed over - the live truth this
 * session renders - rather than re-reading the store, so a lagging store or a
 * fallback session can never write a file that disagrees with the screen. The
 * raw import file is parsed with `parseSnapshot` BEFORE anything is written, so
 * the store never sees an unvalidated snapshot and a malformed file can never
 * half-apply (the store re-validates at its own boundary too; neither half of
 * that contract is trusted by the other).
 *
 * When no `store` is supplied import is disabled: replacing every dataset has
 * to go through the store's atomic import, and inventing a second write path
 * here would bypass that guarantee. Export still works - the datasets in hand
 * are the whole truth.
 */

const SNAPSHOT_META_KEY = 'omnihr_snapshot_meta';

/**
 * Device metadata about the last exchange, NOT business data: it records when
 * this browser last exported or imported, so the card can show it without
 * rereading the store. That is why it lives in localStorage directly - the
 * DataStore seam deliberately excludes it from `DataSnapshot` (a snapshot that
 * carries "when was I last exported" would poison its own round-trip).
 */
interface SnapshotMeta {
  lastExportedAt?: string;
  lastImportedAt?: string;
}

/** Reads the meta key defensively: an unreadable value is "no metadata", never a crash. */
function readSnapshotMeta(): SnapshotMeta {
  try {
    const raw = globalThis.localStorage?.getItem(SNAPSHOT_META_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const meta: SnapshotMeta = {};
    const candidate = parsed as Record<string, unknown>;
    if (typeof candidate.lastExportedAt === 'string') meta.lastExportedAt = candidate.lastExportedAt;
    if (typeof candidate.lastImportedAt === 'string') meta.lastImportedAt = candidate.lastImportedAt;
    return meta;
  } catch {
    return {};
  }
}

/** Merges a patch into the meta key. Advisory only - never blocks the flow it belongs to. */
function writeSnapshotMeta(patch: SnapshotMeta): void {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    storage.setItem(
      SNAPSHOT_META_KEY,
      JSON.stringify({ ...readSnapshotMeta(), ...patch }),
    );
  } catch {
    /* a denied write costs the user one timestamp, not their data */
  }
}

const BACKEND_LABEL: Record<StoreBackend, string> = {
  indexeddb: 'IndexedDB (this browser)',
  localstorage: 'localStorage fallback',
  memory: 'In-memory store',
};

const TIMESTAMP_LABEL = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const formatTimestamp = (iso: string): string => {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? iso : TIMESTAMP_LABEL.format(time);
};

interface AdminSectionProps {
  /** The FULL register - snapshot counts describe the store, not the current filter. */
  employees: Employee[];
  policies: HRPolicy[];
  leavePlans: LeavePlan[];
  settings: PlannerSettings;
  /**
   * The store every read and write goes through. Optional only because the
   * legacy synchronous path has none; see the disabled import below.
   */
  store?: DataStore;
  /** Where business data lives in this session, reported verbatim on the card. */
  backend: StoreBackend;
  /** True when the one-time migration found and kept the legacy localStorage copy. */
  legacyBackup: boolean;
  /** Called after a confirmed, successful import. The parent reloads its data. */
  onImported: () => void;
}

type SnapshotNotice =
  | { tone: 'success'; text: string }
  | { tone: 'info'; text: string }
  | { tone: 'danger'; text: string };

export const AdminSection: React.FC<AdminSectionProps> = ({
  employees,
  policies,
  leavePlans,
  settings,
  store,
  backend,
  legacyBackup,
  onImported,
}) => {
  // Captured once per mount, then updated through the same helper that writes it,
  // so the card reflects an exchange without remounting and can never show a
  // timestamp it did not record.
  const [meta, setMeta] = useState<SnapshotMeta>(readSnapshotMeta);
  const persistMeta = (patch: SnapshotMeta) => {
    writeSnapshotMeta(patch);
    setMeta((prev) => ({ ...prev, ...patch }));
  };
  const [notice, setNotice] = useState<SnapshotNotice | null>(null);
  // The snapshot is only WRITTEN once the user has answered the question in the
  // ConfirmDialog, exactly like the Excel Hub's roster replacement: holding a
  // parsed file is not the same as having applied it.
  const [pending, setPending] = useState<DataSnapshot | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    // The file is built from the LIVE datasets the parent handed over, never by
    // re-reading the store: the download must agree with what this session is
    // showing, which a lagging store or a fallback session could not promise.
    // The whole flow is all-or-nothing - any failure leaves the meta timestamps
    // untouched and reports itself in a danger notice instead of a success.
    try {
      const snapshot = createSnapshot({ employees, policies, leavePlans, settings });
      const fileName = snapshotFileName();
      const blob = new Blob([snapshotToJson(snapshot)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      persistMeta({ lastExportedAt: new Date().toISOString() });
      setNotice({
        tone: 'info',
        text: `Snapshot exported as ${fileName}. Save it to Google Drive, OneDrive or another shared drive - it is your backup.`,
      });
    } catch {
      setNotice({
        tone: 'danger',
        text: 'The snapshot could not be downloaded in this browser. Try again, or use a different browser.',
      });
    }
  };

  const handleFileChosen = async (file: File) => {
    setNotice(null);

    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      setNotice({
        tone: 'danger',
        text: 'That file is not valid JSON, so it cannot be an OmniHR snapshot. Nothing was changed.',
      });
      return;
    }

    const parsed = parseSnapshot(raw);
    if (!parsed.ok) {
      setNotice({
        tone: 'danger',
        text:
          parsed.reason === 'version'
            ? 'That snapshot was made by a different version of OmniHR, so this build cannot safely apply it. Nothing was changed.'
            : 'That file does not hold a valid OmniHR snapshot - a dataset is missing or a record is malformed. Nothing was changed.',
      });
      return;
    }

    setPending(parsed.snapshot);
  };

  const handleConfirmImport = async () => {
    if (!pending || !store) return;
    setIsImporting(true);
    const result = await store.importSnapshot(pending);
    setIsImporting(false);
    setPending(null);

    if (!result.ok) {
      setNotice({
        tone: 'danger',
        text:
          result.reason === 'quota'
            ? 'The snapshot could not be saved: this browser has run out of storage space. Free up space (or remove staff), then import again. Your current data is untouched.'
            : 'The snapshot could not be saved: storage refused the write. Your current data is untouched.',
      });
      return;
    }

    persistMeta({ lastImportedAt: new Date().toISOString() });
    setNotice({
      tone: 'success',
      text: 'Snapshot imported. The console below now shows the data from the file.',
    });
    onImported();
  };

  return (
    <div className="section-stack">
      <section className="omni-card admin-snapshot" aria-labelledby="admin-snapshot-title">
        <div className="admin-snapshot__head">
          <span className="admin-snapshot__icon" aria-hidden="true">
            <Database size={20} />
          </span>
          <div>
            <h3 id="admin-snapshot-title" className="omni-card-title">
              Data snapshot
            </h3>
            <p className="omni-card-sub">
              One JSON file with every business dataset. Export it as a backup, or load a copy on
              another machine.
            </p>
          </div>
        </div>

        <dl className="admin-snapshot__counts">
          <div className="admin-snapshot__count">
            <dt>Employees</dt>
            <dd>{employees.length}</dd>
          </div>
          <div className="admin-snapshot__count">
            <dt>Policies</dt>
            <dd>{policies.length}</dd>
          </div>
          <div className="admin-snapshot__count">
            <dt>Leave plans</dt>
            <dd>{leavePlans.length}</dd>
          </div>
          <div className="admin-snapshot__count">
            <dt>Peak threshold</dt>
            <dd>{settings.maxConcurrentLeave}</dd>
          </div>
        </dl>

        <dl className="admin-snapshot__facts">
          <div className="admin-fact">
            <dt>Storage</dt>
            <dd>{BACKEND_LABEL[backend]}</dd>
          </div>
          <div className="admin-fact">
            {/* On the fallback the legacy copy IS the store this browser writes
                to, not a frozen backup of one - the label and the copy must not
                pretend otherwise. `legacyBackup` is always false there (the store
                has no separate copy), so the sentence is keyed off the backend. */}
            <dt>{backend === 'localstorage' ? 'Legacy copy' : 'Legacy backup'}</dt>
            <dd>
              {backend === 'localstorage'
                ? 'Active store - this browser is running on the localStorage fallback. The legacy copy is the active store, not a separate frozen backup.'
                : backend === 'indexeddb' && legacyBackup
                  ? 'Kept - the old localStorage copy from before IndexedDB is preserved read-only.'
                  : 'None'}
            </dd>
          </div>
          <div className="admin-fact">
            <dt>Last exported</dt>
            <dd>{meta.lastExportedAt ? formatTimestamp(meta.lastExportedAt) : 'Never in this browser'}</dd>
          </div>
          <div className="admin-fact">
            <dt>Last imported</dt>
            <dd>{meta.lastImportedAt ? formatTimestamp(meta.lastImportedAt) : 'Never in this browser'}</dd>
          </div>
        </dl>

        <div className="admin-snapshot__actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleExport}
            disabled={isImporting}
          >
            <Download size={15} aria-hidden="true" /> Export snapshot
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={!store || isImporting}
            title={
              store
                ? 'Load a snapshot file and replace the data in this browser'
                : 'Snapshot import needs the app\u2019s data store, which this session does not have'
            }
          >
            <Upload size={15} aria-hidden="true" /> Import snapshot
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            aria-label="Choose snapshot file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileChosen(file);
              // Allow choosing the SAME file twice in a row to re-open the question.
              e.target.value = '';
            }}
          />
        </div>

        <p className="admin-snapshot__note">
          <ShieldCheck size={14} aria-hidden="true" /> Snapshots are the backup: save each exported
          file to Google Drive, OneDrive or any shared drive. An imported snapshot is a local copy
          for this browser - changes made from it do not propagate back to HR.
        </p>
      </section>

      {notice && (
        <Callout tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Callout>
      )}

      {/*
        Asked last, and rendered last, so it stacks above the other modals - the same
        placement rule App's reset dialog follows. The message states BOTH sides of the
        replacement: what the file holds and what it is about to overwrite.
      */}
      <ConfirmDialog
        isOpen={pending !== null}
        title="Replace the data in this browser with the snapshot?"
        message={
          pending
            ? `The file holds ${pending.employees.length} employee records, ${pending.policies.length} policy records and ${pending.leavePlans.length} leave records. Importing replaces ALL business data stored here - currently ${employees.length} employee records, ${policies.length} policy records and ${leavePlans.length} leave records - with the file's contents. This cannot be undone.`
            : ''
        }
        confirmLabel="Replace data"
        onConfirm={() => void handleConfirmImport()}
        onCancel={() => setPending(null)}
      />
    </div>
  );
};
