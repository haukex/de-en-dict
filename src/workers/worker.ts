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

// We need to trick TypeScript into realizing that `self` isn't a `Window` in this file.
// eslint-disable-next-line no-var
declare var self: DedicatedWorkerGlobalScope

import {loadDict} from './dict-load'
import {searchDict} from './dict-search'
import {MessageType, isMessage, WorkerState, assert} from '../js/common'

if (module.hot) module.hot.accept()  // for the parcel development environment

let state :WorkerState = WorkerState.LoadingDict
const dictLines :string[] = []
let dictError :Error|unknown = null

self.addEventListener('message', event => {
  if (!isMessage(event.data)) return
  if ( event.data.type === 'status-req' ) {
    const m :MessageType = { type: 'worker-status', state: state, error: dictError }
    postMessage(m)
  }
  else if ( state === WorkerState.Ready && event.data.type === 'search' ) {
    const [whatPat, matches] = searchDict(dictLines, event.data.what)
    const m :MessageType = {
      type: 'results', whatPat: whatPat,
      matches: matches.map( i=>{
        assert(dictLines[i])
        return dictLines[i]
      }) }
    postMessage(m)
  }
})

try {
  await loadDict(dictLines)
  state = WorkerState.Ready
}
catch (error) {
  dictError = error ? error : 'unknown error'
  state = WorkerState.Error
}
