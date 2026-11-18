import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { IconAlertTriangle, IconCheck, IconMapPin, IconPlus, IconTrophy, IconUsers, IconMessageCircle } from '@tabler/icons-react';
import type { DashboardData } from '@/hooks/useDashboardData';
import { useEntityCrud } from '@/components/EntityCrud';
import { flowActionFor } from '@/config/plan';
import type { Umfragen } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import { lookupKey } from '@/lib/formatters';
import { useClock, gruss, namen } from '@/lib/polish';
import { tx, appLabel, dateFnsLocale } from '@/i18n';
import { submissionsOf, topOne } from '@/lib/journey';
import { DashboardGrid } from '@/components/DashboardGrid';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { RecordDoorLink } from '@/components/widgets/RecordDoorLink';
import { Button } from '@/components/ui/button';

type Filter = 'all' | 'open' | 'new' | 'closed';

export default function DashboardOverview({ data }: { data: DashboardData }) {
  const { umfragen, terminvorschlaege, antworten } = data;
  const crud = useEntityCrud(data);
  const clock = useClock();
  const [filter, setFilter] = useState<Filter>('open');

  const weekAgo = clock.getTime() - 7 * 24 * 3600 * 1000;
  const nowKey = format(clock, "yyyy-MM-dd'T'HH:mm");

  const rows = useMemo(() => {
    return umfragen.map(u => {
      const termine = terminvorschlaege
        .filter(t => extractRecordId(t.fields.umfrage) === u.record_id)
        .sort((a, b) => (a.fields.beginn ?? '').localeCompare(b.fields.beginn ?? ''));
      const answers = antworten.filter(a => extractRecordId(a.fields.umfrage) === u.record_id);
      const subs = submissionsOf(answers, { key: 'zeilen_kennung', names: ['vorname', 'nachname'] });
      const counts = (tid: string) => {
        const own = answers.filter(a => extractRecordId(a.fields.terminvorschlag) === tid);
        return {
          ja: own.filter(a => lookupKey(a.fields.antwort) === 'ja').length,
          vielleicht: own.filter(a => lookupKey(a.fields.antwort) === 'vielleicht').length,
        };
      };
      const top = topOne(termine, [t => counts(t.record_id).ja, t => counts(t.record_id).vielleicht], t => t.fields.beginn);
      const newSubs = subs.filter(s => s.createdAt && new Date(s.createdAt).getTime() >= weekAgo);
      const isOpen = lookupKey(u.fields.status) !== 'geschlossen';
      const lastEnd = termine.reduce((m, t) => ((t.fields.ende ?? t.fields.beginn ?? '') > m ? (t.fields.ende ?? t.fields.beginn ?? '') : m), '');
      const overdue = isOpen && termine.length > 0 && lastEnd !== '' && lastEnd < nowKey;
      return { u, termine, subs, newSubs, counts, top, isOpen, overdue };
    }).sort((a, b) => Number(b.isOpen) - Number(a.isOpen) || (b.u.created_at ?? '').localeCompare(a.u.created_at ?? ''));
  }, [umfragen, terminvorschlaege, antworten, weekAgo, nowKey]);

  const open = rows.filter(r => r.isOpen);
  const withNew = rows.filter(r => r.newSubs.length > 0);
  const overdue = rows.filter(r => r.overdue);
  const closed = rows.filter(r => !r.isOpen);

  const visible = rows.filter(r =>
    filter === 'open' ? r.isOpen : filter === 'new' ? r.newSubs.length > 0 : filter === 'closed' ? !r.isOpen : true);

  const recent = rows
    .flatMap(r => r.newSubs.map(s => ({ r, s })))
    .sort((a, b) => new Date(b.s.createdAt ?? 0).getTime() - new Date(a.s.createdAt ?? 0).getTime());

  const fmtRange = (b?: string, e?: string) => {
    if (!b) return '—';
    const loc = { locale: dateFnsLocale() };
    const bd = new Date(b);
    const s = format(bd, 'EEE dd.MM. HH:mm', loc);
    if (!e) return s;
    const ed = new Date(e);
    return format(bd, 'yyyy-MM-dd') === format(ed, 'yyyy-MM-dd') ? `${s}–${format(ed, 'HH:mm')}` : `${s} – ${format(ed, 'EEE dd.MM. HH:mm', loc)}`;
  };

  const closeAction = (u: Umfragen) => {
    const go = flowActionFor('umfragen', 'status', u.record_id, 'geschlossen');
    return go ? { label: tx('Schließen'), onClick: go } : undefined;
  };

  const context = (() => {
    if (rows.length === 0) return tx('Lege deine erste Umfrage an und teile den Link.');
    if (overdue.length > 0) return tx`${namen(overdue.map(r => r.u.fields.titel ?? ''))} wartet auf die Entscheidung.`;
    if (recent.length > 0) return tx`Neu abgestimmt: ${namen(recent.map(x => x.s.name))}.`;
    if (open.length > 0) return tx`Offen: ${namen(open.map(r => r.u.fields.titel ?? ''))}.`;
    return tx('Alle Umfragen sind abgeschlossen.');
  })();

  const hero = overdue.length > 0 ? (() => {
    const first = overdue[0];
    const act = closeAction(first.u);
    return (
      <HeroBanner
        icon={<IconAlertTriangle size={18} />}
        tone="warning"
        action={act ?? { label: tx('Öffnen'), onClick: () => crud.umfragen.openDetail(first.u) }}
      >
        <b>{namen(overdue.map(r => r.u.fields.titel ?? ''))}</b> {tx('— alle Terminvorschläge liegen in der Vergangenheit, die Umfrage ist noch offen.')}
      </HeroBanner>
    );
  })() : undefined;

  const primary = rows.length === 0 ? (
    <div className="rounded-xl border bg-card p-8 text-center overflow-hidden">
      <IconUsers size={48} className="mx-auto text-muted-foreground" />
      <p className="mt-3 text-sm text-muted-foreground">{tx('Noch keine Umfrage. Lege eine an und verschicke den Link oder QR-Code.')}</p>
      {crud.umfragen.canWrite && (
        <Button className="mt-4" onClick={() => crud.umfragen.openCreate({ status: 'offen' })}>
          <IconPlus size={16} className="mr-1 shrink-0" />{tx('Erste Umfrage anlegen')}
        </Button>
      )}
    </div>
  ) : (
    <div className="space-y-4">
      {visible.length === 0 && (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">{tx('Keine Umfrage in dieser Ansicht.')}</div>
      )}
      {visible.map(({ u, termine, subs, newSubs, counts, top, isOpen }) => {
        const act = isOpen ? closeAction(u) : undefined;
        return (
          <div key={u.record_id} className="rounded-xl border bg-card p-4 overflow-hidden space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <button type="button" className="min-w-0 text-left" onClick={() => crud.umfragen.openDetail(u)}>
                <h3 className="font-semibold truncate">{u.fields.titel}</h3>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                  <span className={isOpen ? 'font-medium text-emerald-600' : 'font-medium'}>{u.fields.status?.label}</span>
                  {u.fields.ort && <span className="inline-flex items-center gap-1 min-w-0"><IconMapPin size={12} className="shrink-0" /><span className="truncate">{u.fields.ort}</span></span>}
                  <span className="inline-flex items-center gap-1"><IconUsers size={12} className="shrink-0" />{subs.length} {subs.length === 1 ? tx('Teilnehmende/r') : tx('Teilnehmende')}</span>
                  {newSubs.length > 0 && <span className="inline-flex items-center gap-1 text-primary"><IconMessageCircle size={12} className="shrink-0" />{tx`${newSubs.length} neu`}</span>}
                </div>
              </button>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => crud.umfragen.openDetail(u)}>{tx('Antworten ansehen')}</Button>
                {act && <Button size="sm" onClick={act.onClick}><IconCheck size={14} className="mr-1 shrink-0" />{act.label}</Button>}
              </div>
            </div>

            {termine.length === 0 ? (
              <p className="text-sm text-muted-foreground">{tx('Noch keine Terminvorschläge.')}</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {termine.map(t => {
                  const c = counts(t.record_id);
                  const isTop = top?.record_id === t.record_id;
                  return (
                    <li key={t.record_id} className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${isTop ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : ''}`}>
                      <span className="min-w-0 truncate">
                        {isTop && <IconTrophy size={14} className="mr-1 inline text-emerald-600" />}
                        {fmtRange(t.fields.beginn, t.fields.ende)}
                      </span>
                      <span className="shrink-0 text-xs whitespace-nowrap">
                        <b className="text-emerald-600">{c.ja}</b> {tx('Ja')} · <b className="text-amber-600">{c.vielleicht}</b> {tx('Vielleicht')}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            <RecordDoorLink page="termin-abstimmen" recordId={u.record_id} />
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{gruss(clock)}</h1>
          <p className="text-sm text-muted-foreground">{context}</p>
        </div>
        {crud.umfragen.canWrite && rows.length > 0 && (
          <Button onClick={() => crud.umfragen.openCreate({ status: 'offen' })}>
            <IconPlus size={16} className="mr-1 shrink-0" />{tx('Neue Umfrage')}
          </Button>
        )}
      </div>
      <DashboardGrid
        variant="split"
        hero={hero}
        kpis={rows.length > 0 ? (
          <StatStrip>
            <StatStripItem
              title={tx('Offene Umfragen')}
              value={open.length}
              icon={<IconUsers size={16} />}
              onClick={() => setFilter(f => (f === 'open' ? 'all' : 'open'))}
              active={filter === 'open'}
            />
            <StatStripItem
              title={tx('Neue Antworten (7 Tage)')}
              value={withNew.length}
              tone={withNew.length > 0 ? 'primary' : 'default'}
              icon={<IconMessageCircle size={16} />}
              onClick={() => setFilter(f => (f === 'new' ? 'all' : 'new'))}
              active={filter === 'new'}
            />
            <StatStripItem
              title={tx('Geschlossen')}
              value={closed.length}
              icon={<IconCheck size={16} />}
              onClick={() => setFilter(f => (f === 'closed' ? 'all' : 'closed'))}
              active={filter === 'closed'}
            />
          </StatStrip>
        ) : undefined}
        aside={rows.length > 0 ? (
          <WorkList
            title={tx('Neue Antworten')}
            items={recent.map(({ r, s }) => ({
              id: `${r.u.record_id}:${s.key}`,
              title: s.name,
              secondLine: <span className="text-muted-foreground">{r.u.fields.titel}</span>,
            }))}
            onItemClick={id => {
              const rec = umfragen.find(u => u.record_id === id.split(':')[0]);
              if (rec) crud.umfragen.openDetail(rec);
            }}
            empty={{ text: tx('Keine neuen Antworten in den letzten 7 Tagen.') }}
          />
        ) : undefined}
        primary={primary}
      />
      {crud.surfaces}
    </div>
  );
}
