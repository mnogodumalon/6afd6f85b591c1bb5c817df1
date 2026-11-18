import type { Antworten, Terminvorschlaege } from './app';

export type EnrichedTerminvorschlaege = Terminvorschlaege & {
  umfrageName: string;
};

export type EnrichedAntworten = Antworten & {
  umfrageName: string;
  terminvorschlagName: string;
};
