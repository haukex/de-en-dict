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

/** Adds keyboard handlers to the search field.
 *
 * Note that after the user enters something in the search box and presses Enter, an additional
 * `change` event will happen when the focus leaves the search box, but our caller is responsible
 * for filtering that (see #41 for why we don't do it here: searches from the search box intermixed
 * with searches from URL, e.g. via selection popup, were causing some searches to be ignored).
*/
export function initSearchBoxChange(search_box :HTMLInputElement, onChange :()=>void) {
  search_box.addEventListener('change', () => {
    console.debug(`Search from input field change event for '${search_box.value}'`)
    onChange()
  })
  search_box.addEventListener('keyup', event => {
    // Escape key clears input
    if (event.key=='Escape') {
      search_box.value = ''
    }
    // Enter key triggers search
    else if (event.key=='Enter') {
      event.preventDefault()
      event.stopPropagation()
      console.debug(`Search from keyboard Enter event for '${search_box.value}'`)
      onChange()
    }
  })
  /* 'Enter' is handled in keyup above, but we still need to prevent all of its default
   * behavior here so it doesn't fire the "change" event and cause the search to run twice. */
  search_box.addEventListener('keydown', event => {
    if (event.key=='Enter') {
      event.preventDefault()
      event.stopPropagation()
    }
  })
  // keypress is deprecated, we'll include it anyway for now
  search_box.addEventListener('keypress', event => {
    if (event.key=='Enter') {
      event.preventDefault()
      event.stopPropagation()
    }
  })
}
