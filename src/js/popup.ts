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

import {computePosition, autoUpdate, shift, flip, limitShift, offset} from '@floating-ui/dom'

/* Handles the "Selection Tools" popup and the "Annotation Tooltips". */

let currentTooltip :Node|null = null

export function initTooltips() {
  const abbr_tooltip = document.getElementById('abbr-tooltip') as HTMLElement
  document.addEventListener('click', (event) => {
    if ( !( abbr_tooltip.contains(event.target as Node) || currentTooltip && currentTooltip.contains(event.target as Node) ) )
      abbr_tooltip.classList.add('d-none')
  })
}

export function addTooltips(element :HTMLElement) {
  // important: don't call this until the element is actually part of the document, otherwise event listeners won't register
  const abbr_tooltip = document.getElementById('abbr-tooltip') as HTMLElement
  element.querySelectorAll('abbr').forEach((el) => {
    const show = () => {
      abbr_tooltip.innerText = ''+el.getAttribute('title')
      abbr_tooltip.classList.remove('d-none')
      computePosition( el, abbr_tooltip, {
        placement: 'bottom-start',
        middleware: [ offset(5), flip(), shift({ padding: 5, limiter: limitShift() }) ],
      } ).then( ({x,y}) => {
        Object.assign( abbr_tooltip.style, { left: `${x}px`, top: `${y}px` } )
      } )
      currentTooltip = el
    }
    el.addEventListener('click', show )
    // the mouseover stuff is a little too intrusive IMHO (and doesn't work on mobile anyway)
    //el.addEventListener('mouseover', show )
    //el.addEventListener('mouseout', () => abbr_tooltip.classList.add('d-none') )
  })
}

export function initPopup() {
  const sel_popup = document.getElementById('sel-popup') as HTMLElement
  const popup_search = document.getElementById('popup-search') as HTMLElement
  const popup_feedback = document.getElementById('popup-feedback') as HTMLElement
  const result_table = document.getElementById('result-table') as HTMLElement
  const popup_close = document.getElementById('popup-close') as HTMLElement

  let cleanup :null|(()=>void) = null  // holds state for later cleanup of autoUpdate
  const doHide = () => {
    sel_popup.classList.add('d-none')
    if (cleanup) cleanup()
    cleanup = null
  }
  popup_close.addEventListener('click', doHide)
  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection()
    let hide :boolean = true  // we need to do several checks before we can show, so hide by default
    // something was selected (we only handle simple selections with one range)
    if ( selection && selection.rangeCount==1 ) {
      const text = selection.toString()
        // remove the feedback icon in case the user selected it
        .replaceAll(/[\uFE0F\u2709]/g,'')
        // normalize whitespace
        .replaceAll(/\s+/g,' ').trim()
      const range = selection.getRangeAt(0)
      // only handle selections of text inside the results table
      if ( text.length && result_table.contains(range.commonAncestorContainer) ) {
        // figure out the common ancestor HTMLElement of the selection
        let parent_elem :Node|null = range.commonAncestorContainer
        while ( parent_elem && !(parent_elem instanceof HTMLElement) )
          parent_elem = parent_elem.parentNode
        popup_feedback.classList.add('d-none')  // hide by default (gets shown below if applicable)
        // figure out if the selection spans only one row
        if ( parent_elem ) {
          // at this point we know parent_elem must be an HTMLElement
          // find the closest result tbody
          const tb = (parent_elem as HTMLElement).closest('#result-table tbody.result')
          if (tb) {
            // get href for the feedback link that should be stored here for us
            const fb = tb.getAttribute('data-feedback-href')
            if (fb) {
              popup_feedback.setAttribute('href', fb)
              popup_feedback.classList.remove('d-none')
            }
          }
        }
        // set the search link href and show the div
        popup_search.setAttribute('href', `#q=${encodeURIComponent(text)}`)
        hide = false
        sel_popup.classList.remove('d-none')
        // use Floating UI for placement
        if (cleanup) cleanup()
        cleanup = autoUpdate( range, sel_popup, () => {
          computePosition( range, sel_popup, {
            placement: 'bottom-start',
            middleware: [ offset(5), flip(), shift({ padding: 5, limiter: limitShift() }) ],
          } ).then( ({x,y}) => {
            Object.assign( sel_popup.style, { left: `${x}px`, top: `${y}px` } )
          } )
        })
      }
    }
    if (hide) doHide()
  })
  return doHide
}