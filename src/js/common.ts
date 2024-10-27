/**
 * German-English Dictionary
 * =========================
 *
 * Copyright © 2024 Hauke Dämpfling, haukex@zero-g.net
 *
 * Source code: https://github.com/haukex/de-en-dict
 *
 * This project is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This project is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this project; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */

/* Utility functions and types common to both the main thread and the web workers */

/** A regexp pattern for annotations like `{f}` or `[...]` */
// NOTE this is used in wrapTextNodeMatches, see that function for restrictions on the regexp!
export const ANNOTATION_PAT = '\\{[^}]+\\}|\\[[^\\]]+\\]'

export function assert(condition: unknown, msg?: string): asserts condition {
  if (!condition) throw new Error(msg)
}

export enum MainState {
  Init,
  AwaitingDict,
  Error,
  Ready,
  Searching,
}

export enum WorkerState {
  LoadingDict,
  Error,
  Ready,
}

export interface IDictStats {
  lines :number
  entries :number
  oneToOne :number
}

/// Messages from the worker
export type WorkerMessageType =
    { type: 'dict-prog', percent :number }
  | { type: 'dict-upd', status :'loading'|'done'|'error', dictStats :IDictStats }
  | { type: 'worker-status', state :WorkerState, dictStats :IDictStats, error ?:Error|unknown }
  | { type: 'search-prog', percent :number }
  | { type: 'results', what :string, whatPat :string, matches :string[] }
  | { type: 'rand-line', line :string }

/// Messages from the main thread
export type MainMessageType =
    { type: 'status-req' }
  | { type: 'search', what :string }
  | { type: 'get-rand' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isWorkerMessage(obj :any): obj is WorkerMessageType {
  return 'type' in obj && ['dict-prog','dict-upd','worker-status','search-prog','results',
    'rand-line'].includes(obj.type)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isMainMessage(obj :any): obj is MainMessageType {
  return 'type' in obj && ['status-req','search','get-rand'].includes(obj.type)
}

interface ITransPair { de: string, en: string }

export function splitDictLine(dictLine :string) :ITransPair[] {
  // note the following formatting is validated by `dict-check.pl`
  // split the dictionary lines into "German :: English"
  const trans = dictLine.split(/::/)
  if (trans.length!=2)
    throw new Error(`unexpected database format on line ${dictLine}`)
  // split each entry on "|"s, should have the same number of entries on each side
  const des = (trans[0] as string).split(/\|/)
  const ens = (trans[1] as string).split(/\|/)
  if (des.length!=ens.length)
    throw new Error(`unexpected database format on line ${dictLine}`)
  return des.map((de, i) => ({ 'de': de, 'en': ens[i] as string }) )
}
