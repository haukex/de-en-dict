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
import {ANNOTATION_PAT} from './global'
import {assert} from './utils'

/* Handles the "Selection Tools" Popup and Tooltips for Elements with "title"s (such as <abbr>). */

let cleanupSelectionTools :null|(()=>void) = null
let cleanupTitleTooltip :null|(()=>void) = null
let titleTooltipSource :Node|null = null

const canSpeak = 'speechSynthesis' in window
const ANNOTATION_RE = new RegExp(ANNOTATION_PAT, 'g')

function closeTitleTooltip() {
  if (cleanupTitleTooltip) {
    const title_tooltip = document.getElementById('title-tooltip')
    if (title_tooltip) {
      title_tooltip.classList.add('d-none')
      cleanupTitleTooltip()
      cleanupTitleTooltip = null
      titleTooltipSource = null
    }
  }
}

function closeSelectionTools() {
  if (cleanupSelectionTools) {
    cleanupSelectionTools()
    const sel_tools = document.getElementById('sel-tools')
    if (sel_tools) {
      sel_tools.classList.add('d-none')
      cleanupSelectionTools = null
    }
  }
}

function initTitleTooltips() {
  const title_tooltip = document.getElementById('title-tooltip')
  assert(title_tooltip)
  document.addEventListener('click', (event) => {
    // clicking anywhere but the tooltip or the element that opened it closes it
    if ( !( title_tooltip.contains(event.target as Node) || titleTooltipSource && titleTooltipSource.contains(event.target as Node) ) )
      closeTitleTooltip()
  })
}

/** Add title tooltips to all of the given elements. Don't call this until after `initTitleTooltips`. */
export function addTitleTooltips(elements :NodeListOf<HTMLElement>) {
  // important: don't call this until the element is actually part of the document, otherwise event listeners won't register
  const title_tooltip = document.getElementById('title-tooltip')
  assert(title_tooltip)
  elements.forEach((el) => {
    const title = el.getAttribute('title')
    if (!title) return
    el.addEventListener('click', (event) => {
      if (event.detail>1 ) return  // not on double clicks (those would select the text)
      closeAllPopups()
      title_tooltip.innerText = title
      title_tooltip.classList.remove('d-none')
      cleanupTitleTooltip = autoUpdate( el, title_tooltip, () => {
        computePosition( el, title_tooltip, {
          placement: 'bottom-start',
          middleware: [ offset(3), flip(), shift({ padding: 5, limiter: limitShift() }) ],
        } ).then( ({x,y}) => {
          Object.assign( title_tooltip.style, { left: `${x}px`, top: `${y}px` } )
        } )
      } )
      titleTooltipSource = el
    } )
  })
}

function initSelectionTools() {
  const sel_tools = document.getElementById('sel-tools')
  const sel_tools_search = document.getElementById('sel-tools-search')
  const sel_tools_feedback = document.getElementById('sel-tools-feedback')
  const sel_tools_speak = document.getElementById('sel-tools-speak')
  const sel_tools_close = document.getElementById('sel-tools-close')
  const result_table = document.getElementById('result-table')
  assert( sel_tools && sel_tools_search && sel_tools_feedback && sel_tools_speak && sel_tools_close && result_table )

  let utterance = new SpeechSynthesisUtterance('This is an example of speech synthesis.')
  utterance.lang = 'en'
  sel_tools_speak.addEventListener('click', event => {
    event.preventDefault()
    if (!canSpeak) return  // this shouldn't happen
    // if paused (which I'm not sure is possible here?), cancel whatever was paused
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.cancel()
      // it's unclear to me from the documentation whether cancel() unpauses, so let's be explicit:
      window.speechSynthesis.resume()
    }
    // if the speech synthesis is currently not busy, speak
    if (!( window.speechSynthesis.speaking && !window.speechSynthesis.paused || window.speechSynthesis.pending )) {
      window.speechSynthesis.speak(utterance)
      sel_tools_speak.classList.add('busy-link')
    }
  })

  sel_tools_close.addEventListener('click', closeSelectionTools)
  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection()
    /* NOTE: Clicking inside the selection tools popup changes the selection and therefore closes it,
     * unlike the title tooltips. Is this desirable behavior? It also means that providing the "x" to
     * close the selection tools and explicitly adding a click listener is a little redundant. */
    closeSelectionTools()
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
        sel_tools_feedback.classList.add('d-none')  // hide by default (gets shown below if applicable)
        sel_tools_speak.classList.add('d-none')
        // figure out if the selection spans only one row
        if ( parent_elem ) {
          // at this point we know parent_elem must be an HTMLElement
          // find the closest result tbody
          const tb = parent_elem.closest('#result-table tbody.result')
          if (tb) {
            // get href for the feedback link that should be stored here for us
            const fb = tb.getAttribute('data-feedback-href')
            if (fb) {
              sel_tools_feedback.setAttribute('href', fb)
              sel_tools_feedback.classList.remove('d-none')
            }
          }
          if (canSpeak) {
            // find the closest td
            const td = parent_elem.closest('#result-table tbody.result td')
            if (td) {
              const lang = td.getAttribute('lang')
              if (lang) {
                sel_tools_speak.classList.remove('d-none')
                utterance = new SpeechSynthesisUtterance(text.replaceAll(ANNOTATION_RE, ''))
                utterance.lang = lang
                utterance.addEventListener('end',   () => sel_tools_speak.classList.remove('busy-link') )
                utterance.addEventListener('error', () => sel_tools_speak.classList.remove('busy-link') )
              }
            }
          }
        }
        // set the search link href and show the div
        sel_tools_search.setAttribute('href', `#q=${encodeURIComponent(text)}`)
        sel_tools.classList.remove('d-none')
        // use Floating UI for placement
        closeTitleTooltip()
        cleanupSelectionTools = autoUpdate( range, sel_tools, () => {
          computePosition( range, sel_tools, {
            placement: 'bottom-start',
            middleware: [ offset(5), flip(), shift({ padding: 5, limiter: limitShift() }) ],
          } ).then( ({x,y}) => {
            Object.assign( sel_tools.style, { left: `${x}px`, top: `${y}px` } )
          } )
        })
      }
    }
  })
}

/** Initialize the popups. Don't call this until the document is loaded. */
export function initPopups() {
  initSelectionTools()
  initTitleTooltips()
}

export function closeAllPopups() {
  closeSelectionTools()
  closeTitleTooltip()
}
