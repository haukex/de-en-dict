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

/* Handles the "Selection Tools" popup and the "Annotation Tooltips".
 * The former is currently abbreviated "popup" and the second "tooltip".
 * That's probably too generic and confusing and I should rename them. */

let cleanupPopup :null|(()=>void) = null
let cleanupTooltip :null|(()=>void) = null
let currentTooltipElement :Node|null = null

function closeTooltip() {
  if (cleanupTooltip) {
    const abbr_tooltip = document.getElementById('abbr-tooltip') as HTMLElement
    abbr_tooltip.classList.add('d-none')
    cleanupTooltip()
    cleanupTooltip = null
    currentTooltipElement = null
  }
}

function closePopup() {
  if (cleanupPopup) {
    cleanupPopup()
    const sel_popup = document.getElementById('sel-popup') as HTMLElement
    sel_popup.classList.add('d-none')
    cleanupPopup = null
  }
}

export function closeAllPopups() {
  closePopup()
  closeTooltip()
}

export function initTooltips() {
  const abbr_tooltip = document.getElementById('abbr-tooltip') as HTMLElement
  document.addEventListener('click', (event) => {
    // clicking anywhere but the tooltip or the element that opened it closes it
    if ( !( abbr_tooltip.contains(event.target as Node) || currentTooltipElement && currentTooltipElement.contains(event.target as Node) ) )
      closeTooltip()
  })
}

export function addTooltips(element :HTMLElement) {
  // important: don't call this until the element is actually part of the document, otherwise event listeners won't register
  const abbr_tooltip = document.getElementById('abbr-tooltip') as HTMLElement
  element.querySelectorAll('abbr').forEach((el) => {
    const title = el.getAttribute('title')
    if (!title) return
    el.addEventListener('click', (event) => {
      if (event.detail>1 ) return  // not on double clicks (those would select the text)
      closeAllPopups()
      abbr_tooltip.innerText = title
      abbr_tooltip.classList.remove('d-none')
      if (cleanupTooltip) cleanupTooltip()
      cleanupTooltip = autoUpdate( el, abbr_tooltip, () => {
        computePosition( el, abbr_tooltip, {
          placement: 'bottom-start',
          middleware: [ offset(3), flip(), shift({ padding: 5, limiter: limitShift() }) ],
        } ).then( ({x,y}) => {
          Object.assign( abbr_tooltip.style, { left: `${x}px`, top: `${y}px` } )
        } )
      } )
      currentTooltipElement = el
    } )
  })
}

export function initPopup() {
  const sel_popup = document.getElementById('sel-popup') as HTMLElement
  const popup_search = document.getElementById('popup-search') as HTMLElement
  const popup_feedback = document.getElementById('popup-feedback') as HTMLElement
  const result_table = document.getElementById('result-table') as HTMLElement
  const popup_close = document.getElementById('popup-close') as HTMLElement

  popup_close.addEventListener('click', closePopup)
  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection()
    closeAllPopups()
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
        sel_popup.classList.remove('d-none')
        // use Floating UI for placement
        cleanupPopup = autoUpdate( range, sel_popup, () => {
          computePosition( range, sel_popup, {
            placement: 'bottom-start',
            middleware: [ offset(5), flip(), shift({ padding: 5, limiter: limitShift() }) ],
          } ).then( ({x,y}) => {
            Object.assign( sel_popup.style, { left: `${x}px`, top: `${y}px` } )
          } )
        })
      }
    }
  })
}