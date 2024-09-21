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

import {WorkerMessageType, isMainMessage, WorkerState, assert} from '../js/common'
import {searchDict} from './dict-search'
import {loadDict} from './dict-load'

if (module.hot) module.hot.accept()  // for the parcel development environment

let state :WorkerState = WorkerState.LoadingDict
const dictLines :string[] = []
let dictError :Error|unknown = null

const sendMyState = () => {
  const m :WorkerMessageType = { type: 'worker-status', state: state, dictLinesLen: dictLines.length, error: dictError }
  postMessage(m)
}

self.addEventListener('message', event => {
  if (!isMainMessage(event.data)) return
  // the main thread asked to know our status
  if ( event.data.type === 'status-req' )
    sendMyState()
  // the user initiated a search
  else if ( event.data.type === 'search' ) {
    if ( state === WorkerState.Ready ) {
      // searchDict sends its own progress reports
      const [whatPat, matches] = searchDict(dictLines, event.data.what)
      const m :WorkerMessageType = { type: 'results', what :event.data.what, whatPat: whatPat, matches: matches }
      postMessage(m)
    } else console.warn(`Ignoring search request in state ${WorkerState[state]}`)
  }
  // the user requested a random entry
  else if ( event.data.type === 'get-rand' ) {
    if ( state === WorkerState.Ready ) {
      const randLine = dictLines[Math.floor(Math.random()*dictLines.length)]
      assert(randLine)
      const m :WorkerMessageType = { type: 'rand-line', line: randLine }
      postMessage(m)
    } else console.warn(`Ignoring random line request in state ${WorkerState[state]}`)
  }
})

// loadDict sends its own progress reports
loadDict(dictLines)
  .then(() => {
    state = WorkerState.Ready
  }, error => {
    dictError = error ? error : 'unknown error'
    state = WorkerState.Error
  }).finally(sendMyState)
