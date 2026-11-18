/**
 * Umfrage schließen — 3-Schritt-Wizard.
 * Steps: 1) Offene Umfrage wählen → 2) Terminvorschläge und Antworten ansehen → 3) Prüfen & schließen.
 * Reads: umfragen, terminvorschlaege, antworten. Writes: umfragen (status=geschlossen, via useUmfrageSchliessenFlow).
 * Composes: IntentWizardShell, EntitySelectStep, StepNav, SummaryStep, SuccessStep.
 */
import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { IntentWizardShell, WizardStep } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StepNav } from '@/components/blocks/StepNav';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import {
  fieldText,
  fieldLookup,
  fieldDate,
  fieldRef,
  refFilter,
  useLiveList,
} from '@/lib/journey';
import { useUmfrageSchliessenFlow } from '@/lib/journey/flows/UmfrageSchliessen';
import { tx } from '@/i18n';

function dateText(iso: string | null): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'dd.MM.yyyy HH:mm');
  } catch {
    return iso;
  }
}

export default function UmfrageSchliessenPage() {
  const [step, setStep] = useState(1);
  const flow = useUmfrageSchliessenFlow({
    steps: { umfragen: 1 },
    items: {
      umfragen: r => ({
        id: r.id,
        title: fieldText(r, 'titel'),
        subtitle: fieldText(r, 'ort') || undefined,
        status: fieldLookup(r, 'status') ?? undefined,
      }),
    },
    where: {
      umfragen: r => fieldLookup(r, 'status')?.key === 'offen',
    },
  });

  const umfrageId = (flow.pick('umfragen').selectedId as string | null | undefined) ?? null;

  const termine = useLiveList(flow.port, 'terminvorschlaege', {
    intervalMs: 0,
    enabled: Boolean(umfrageId),
    list: umfrageId ? { filter: refFilter('umfrage', umfrageId), limit: 200 } : undefined,
  });
  const antworten = useLiveList(flow.port, 'antworten', {
    intervalMs: 0,
    enabled: Boolean(umfrageId),
    list: umfrageId ? { filter: refFilter('umfrage', umfrageId), limit: 500 } : undefined,
  });

  const rows = useMemo(() => {
    const sorted = [...termine.records].sort((a, b) =>
      (fieldDate(a, 'beginn') ?? '').localeCompare(fieldDate(b, 'beginn') ?? ''),
    );
    return sorted.map(t => {
      const mine = antworten.records.filter(a => fieldRef(a, 'terminvorschlag') === t.id);
      const count = (key: string) => mine.filter(a => fieldLookup(a, 'antwort')?.key === key).length;
      return {
        id: t.id,
        von: dateText(fieldDate(t, 'beginn')),
        bis: dateText(fieldDate(t, 'ende')),
        ja: count('ja'),
        vielleicht: count('vielleicht'),
        nein: count('nein'),
        people: mine.map(a => ({
          id: a.id,
          name: `${fieldText(a, 'vorname')} ${fieldText(a, 'nachname')}`.trim(),
          answer: fieldLookup(a, 'antwort')?.label ?? '',
        })),
      };
    });
  }, [termine.records, antworten.records]);

  const loading = termine.loading || antworten.loading;

  return (
    <IntentWizardShell
      title={tx('Umfrage schließen')}
      currentStep={step}
      onStepChange={setStep}
      forms={flow.formList}
      draftKey={flow.draftKey}
      intro={{ description: tx('Schau dir die Antworten an und beende die Abstimmung.'), needs: [tx('Eine offene Umfrage')] }}
    >
      <WizardStep label={tx('Umfrage')} description={tx('Welche offene Umfrage soll geschlossen werden?')}>
        <EntitySelectStep
          {...flow.picks.umfragen.select}
          {...flow.pick('umfragen')}
          searchPlaceholder={tx('Titel oder Ort …')}
          emptyText={tx('Es gibt keine offene Umfrage.')}
        />
      </WizardStep>

      <WizardStep label={tx('Antworten')} description={tx('So haben die Teilnehmenden bisher abgestimmt.')}>
        {!umfrageId ? (
          <StepNav onBack={() => setStep(1)} nextDisabled>
            {tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}
          </StepNav>
        ) : (
          <div className="space-y-4">
            {loading && <p className="text-sm text-muted-foreground">{tx('Antworten werden geladen …')}</p>}
            {!loading && rows.length === 0 && (
              <p className="text-sm text-muted-foreground">{tx('Für diese Umfrage gibt es noch keine Terminvorschläge.')}</p>
            )}
            {rows.map(r => (
              <div key={r.id} className="rounded-2xl border bg-card p-4 overflow-hidden">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium min-w-0 truncate">
                    {r.von}
                    {r.bis ? ` – ${r.bis}` : ''}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {tx`${r.ja} Ja · ${r.vielleicht} Vielleicht · ${r.nein} Nein`}
                  </p>
                </div>
                {r.people.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {r.people.map(p => (
                      <li key={p.id} className="rounded-full bg-secondary px-3 py-1 text-xs">
                        {p.name} · {p.answer}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">{tx('Noch keine Antworten.')}</p>
                )}
              </div>
            ))}
            <StepNav onBack={() => setStep(1)} onNext={() => flow.validateStep(2)} nextStepLabel={tx('Prüfen')} />
          </div>
        )}
      </WizardStep>

      <WizardStep label={tx('Prüfen')} description={tx('Danach ist das Abstimmen nicht mehr möglich.')}>
        {!flow.submit.done && (
          <SummaryStep
            forms={flow.formList}
            submit={flow.submit}
            items={[{ key: 'status', label: tx('Neuer Status'), value: tx('Geschlossen') }]}
            whatHappensNext={tx('Die Umfrage wird geschlossen. Du kannst sie danach wieder öffnen.')}
          />
        )}
      </WizardStep>

      {flow.submit.result && (
        <SuccessStep
          result={flow.submit.result}
          forms={flow.formList}
          submit={flow.submit}
          undo={flow.undo}
          facts={[
            { label: tx('Titel'), value: fieldText(flow.submit.result.primary, 'titel') },
            {
              label: tx('Status'),
              value: fieldLookup(flow.submit.result.primary, 'status')?.label ?? tx('Geschlossen'),
            },
          ]}
          next={[
            { label: tx('Umfrage anlegen'), href: '#/intents/umfrage-anlegen' },
            { label: tx('Zum Dashboard'), href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
