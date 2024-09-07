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

export {}  // this dummy is needed as long as there are no `import`s

if (module.hot) module.hot.accept()  // for the parcel development environment

self.addEventListener('message', event => {
  //TODO: this is just a dummy
  console.debug(`Worker Rx: ${event.data}`)
  postMessage(`Replying to ${event.data}`)
})
