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

//import {makeSearchRegex} from '../workers/equiv'
import {assert} from './common'

export class SearchForm {
  static #singleton :SearchForm|null = null
  doSearch :((what :string)=>void)|null = null
  protected readonly search_form :HTMLFormElement
  protected readonly search_term :HTMLInputElement
  protected readonly adv_search :HTMLElement
  protected readonly search_regex :HTMLInputElement
  protected readonly btn_reset_regex :HTMLButtonElement
  protected readonly cb_limit_noun :HTMLInputElement
  protected readonly cb_limit_verb :HTMLInputElement
  protected readonly cb_limit_adj :HTMLInputElement
  protected readonly btn_do_search :HTMLButtonElement
  protected _disabled :boolean = true

  constructor() {
    if (SearchForm.#singleton)
      throw new Error('Only one object of this class allowed')
    SearchForm.#singleton = this

    const search_form = document.getElementById('search-form')
    const search_term = document.getElementById('search-term')
    const adv_search = document.getElementById('adv-search')
    const search_regex = document.getElementById('search-regex')
    const reset_regex = document.getElementById('reset-regex')
    const limit_noun = document.getElementById('limit-noun')
    const limit_verb = document.getElementById('limit-verb')
    const limit_adj = document.getElementById('limit-adj')
    const btn_adv_search = document.getElementById('btn-adv-search')
    assert( search_form instanceof HTMLFormElement && search_term instanceof HTMLInputElement && adv_search instanceof HTMLElement
      && search_regex instanceof HTMLInputElement && reset_regex instanceof HTMLButtonElement && limit_noun instanceof HTMLInputElement
      && limit_verb instanceof HTMLInputElement && limit_adj instanceof HTMLInputElement && btn_adv_search instanceof HTMLButtonElement )
    this.search_form = search_form
    this.search_term = search_term
    //TODO: add functionality to all of the "Advanced Search" stuff!
    this.adv_search = adv_search
    this.search_regex = search_regex
    this.btn_reset_regex = reset_regex
    this.cb_limit_noun = limit_noun
    this.cb_limit_verb = limit_verb
    this.cb_limit_adj = limit_adj
    this.btn_do_search = btn_adv_search

    search_form.addEventListener('submit', event => {
      event.preventDefault()
      event.stopPropagation()
      return false
    })

    /* After the user enters something in the input box and presses Enter, a `change` event
       will happen when the focus leaves the input box, so we need to prevent that here. */
    let prevSearchTerm = 'something the user is unlikely to enter ⨕⨴⨵∭𝕱'
    const doIt = (src :string) => {
      if (search_term.value === prevSearchTerm) return
      prevSearchTerm = search_term.value
      console.debug(`Search from ${src} event for '${search_term.value}'`)
      if (this.doSearch) this.doSearch(search_term.value)
    }
    search_term.addEventListener('change', () => doIt('input field change'))
    search_term.addEventListener('keyup', event => {
      // Escape key clears input
      if (event.key=='Escape') {
        search_term.value = ''
      }
      // Enter key triggers search
      else if (event.key=='Enter') {
        event.preventDefault()
        event.stopPropagation()
        doIt('keyboard Enter')
      }
    })
    /* 'Enter' is handled in keyup above, but we still need to prevent all of its default
    * behavior here so it doesn't fire the "change" event and cause the search to run twice. */
    search_term.addEventListener('keydown', event => {
      if (event.key=='Enter') {
        event.preventDefault()
        event.stopPropagation()
      }
    })
    // keypress is deprecated, we'll include it anyway for now
    search_term.addEventListener('keypress', event => {
      if (event.key=='Enter') {
        event.preventDefault()
        event.stopPropagation()
      }
    })

  }

  set disabled(disabled :boolean) {
    this._disabled = disabled
    this.updateState()
  }
  get disabled() {
    return this._disabled
  }

  protected updateState() {
    if (this._disabled) {
      /* DON'T use `disabled`, because in the case where this code is going to the state `Searching` due to a search,
       * setting that attribute causes a recursive `change` event and search to be fired here! (Chrome and Edge) */
      this.search_term.setAttribute('readonly','readonly')
      this.search_regex.setAttribute('readonly','readonly')
      this.btn_reset_regex.setAttribute('disabled','disabled')
      this.cb_limit_noun.setAttribute('disabled','disabled')
      this.cb_limit_verb.setAttribute('disabled','disabled')
      this.cb_limit_adj.setAttribute('disabled','disabled')
      this.btn_do_search.setAttribute('disabled','disabled')
    }
    else {
      this.search_term.removeAttribute('readonly')
      this.search_regex.removeAttribute('readonly')
      this.btn_reset_regex.removeAttribute('disabled')
      this.cb_limit_noun.removeAttribute('disabled')
      this.cb_limit_verb.removeAttribute('disabled')
      this.cb_limit_adj.removeAttribute('disabled')
      this.btn_do_search.removeAttribute('disabled')
    }
  }

  get value() {
    return this.search_term.value
  }
  set value(what :string) {
    this.search_term.value = what
  }
  focus() {
    this.search_term.focus()
  }
}
