import { useEffect, useMemo, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import { OptionVote } from '@/components/blocks/OptionVote';
import { LoadProblem } from '@/components/blocks/LoadProblem';
import {
  loadPublicPagesConfig, getPublicRecord, PageUnavailableError,
  type PublicPagesConfig, type PublicPageConfig,
} from '@/lib/publicClient';
import { createPublicPort } from '@/lib/journey/publicPort';
import { ENTITIES, VOTES, type JourneyRecord } from '@/lib/journey';
import { tx } from '@/i18n';

const SLUG = 'termin-abstimmen';
// zeilen_kennung (derived:record_key): OptionVote mints it once per send and remembers the submission.

function linkedIdFromHash(): string | null {
  const id = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('umfrage');
  return id && /^[a-f0-9]{24}$/i.test(id) ? id : null;
}

export default function TerminAbstimmen() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [dead, setDead] = useState(false);
  const [problem, setProblem] = useState(false);
  const [umfrage, setUmfrage] = useState<JourneyRecord | null>(null);
  const [attempt, setAttempt] = useState(0);
  const linkedId = useMemo(() => linkedIdFromHash(), []);

  useEffect(() => {
    let cancelled = false;
    setProblem(false);
    loadPublicPagesConfig(SLUG)
      .then(async c => {
        if (cancelled) return;
        const p = c?.pages[SLUG] ?? null;
        setCfg(c);
        setPage(p);
        if (c && p && linkedId) {
          try {
            const r = await getPublicRecord(c, p, ENTITIES.umfragen.appId, linkedId);
            if (!cancelled) setUmfrage({ id: r.id, fields: r.fields, createdAt: r.created_at ?? null });
          } catch (e) {
            if (cancelled) return;
            if (e instanceof PageUnavailableError) setDead(true);
            else setProblem(true);
          }
        }
        if (!cancelled) setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [linkedId, attempt]);

  const port = useMemo(() => (cfg && page ? createPublicPort(cfg, page) : null), [cfg, page]);

  if (loading) return <PublicShell loading />;
  if (!cfg || !page) return <PublicShell unavailable />;

  if (!linkedId) {
    return (
      <PublicShell title={page.title} description={page.description}>
        <p className="text-sm text-muted-foreground">
          {tx('Dieser Link ist unvollständig. Bitte den Link oder QR-Code der Umfrage verwenden.')}
        </p>
      </PublicShell>
    );
  }

  if (dead) {
    return (
      <PublicShell title={page.title}>
        <p className="text-sm text-muted-foreground">
          {tx('Dieser Link ist nicht mehr gültig. Bitte den aktuellen Link oder QR-Code verwenden.')}
        </p>
      </PublicShell>
    );
  }

  if (problem || !umfrage) {
    return (
      <PublicShell title={page.title}>
        <LoadProblem onRetry={() => { setLoading(true); setAttempt(a => a + 1); }} />
      </PublicShell>
    );
  }

  const titel = typeof umfrage.fields.titel === 'string' ? umfrage.fields.titel : page.title;
  const beschreibung = typeof umfrage.fields.beschreibung === 'string' ? umfrage.fields.beschreibung : '';
  const ort = typeof umfrage.fields.ort === 'string' ? umfrage.fields.ort : '';

  return (
    <PublicShell title={titel} description={beschreibung || undefined}>
      <div className="space-y-4">
        {ort && (
          <p className="text-sm text-muted-foreground">
            {tx('Ort')}: <span className="font-medium text-foreground">{ort}</span>
          </p>
        )}
        <OptionVote port={port} vote={VOTES['termin-abstimmen']} parentId={linkedId} draftKey="termin-abstimmen" />
      </div>
    </PublicShell>
  );
}
