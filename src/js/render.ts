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

import {default as abbreviations} from './abbreviations.json'
import {wrapTextNodeMatches} from './utils'
import {ANNOTATION_PAT} from './common'

// a couple of user-settable variables
const FEEDBACK_URL = 'mailto:beolingus@tu-chemnitz.de'  // as requested by Frank Richter
const FEEDBACK_SUBJECT = 'De-En Word List Suggestion'
const FEEDBACK_BODY = 'Hello, Hallo,\n\n'
    +'I would like to make a suggestion about the following dictionary entry. [Please do not edit the following entry!]\n'
    +'Ich möchte einen Vorschlag zu dem folgenden Wörterbucheintrag machen. [Bitte den folgenden Eintrag nicht bearbeiten!]\n'
    +'\n$LINE\n'  // the code below replaces this with the dictionary line
    +'\nMy suggestion is:\nMein Vorschlag ist:\n'
const ENABLE_FEEDBACK = true

// function to turn a dictionary line into a rendered <tbody>
export function result2tbody (dictLine :string) {
  // split the dictionary lines into "German :: English"
  const trans = dictLine.split(/::/)
  if (trans.length!=2)
    throw new Error(`unexpected database format on line ${dictLine}`)
  // split each entry on "|"s, should have the same number of entries on each side
  const des = (trans[0] as string).split(/\|/)
  const ens = (trans[1] as string).split(/\|/)
  if (des.length!=ens.length)
    throw new Error(`unexpected database format on line ${dictLine}`)

  // generate "mailto:" link with predefined subject and body (used below)
  const fbHref = FEEDBACK_URL
    + '?subject=' + encodeURIComponent(FEEDBACK_SUBJECT)
    + '&body=' + encodeURIComponent(FEEDBACK_BODY.replace('$LINE', dictLine))

  // function for generating the feedback link HTML
  const fbIcon = document.createElement('div')
  fbIcon.classList.add('feedback-thing')
  const fbLink = document.createElement('a')
  fbLink.setAttribute('title', 'Send Feedback Email')
  fbLink.setAttribute('href', fbHref)
  fbLink.appendChild(document.createElement('span'))  // icon is injected by CSS here
  fbIcon.appendChild(fbLink)

  // each result is contained in a <tbody>
  const tbody = document.createElement('tbody')
  tbody.classList.add('result')
  tbody.setAttribute('data-feedback-href', fbHref)  // for later use by the popup code

  // generate the HTML for each (sub-)result
  des.forEach((de, i) => {
    // generate the <tr> with the two <td> children
    const tr = document.createElement('tr');
    [de, ens[i] as string].forEach((ent, li) => {
      const td = document.createElement('td')
      td.setAttribute('lang', li?'en':'de')  // note this is also used by the selection popup
      td.innerText = ent.trim()
      // we want to display annotations in different formatting
      wrapTextNodeMatches(td, ANNOTATION_PAT, (match) => {
        if (Object.hasOwn(abbreviations, match)) {
          const abb = abbreviations[match as keyof typeof abbreviations]
          const e = document.createElement('abbr')
          e.classList.add('annotation')
          e.setAttribute('title', `🇩🇪 ${abb['de']} • 🇺🇸 ${abb['en']}`)
          e.innerText = match
          return e
        }
        const e = document.createElement('span')
        e.classList.add('annotation')
        e.innerText = match
        return e
      })
      // words in angle brackets are common misspellings or other cross-references that should be hidden from view
      wrapTextNodeMatches(td, '<.+?>', (match) => {
        const e = document.createElement('span')
        e.classList.add('hidden')
        e.innerText = match
        return e
      })
      tr.appendChild(td)
    })
    // add the "feedback" button to the first <tr>
    if (!i && ENABLE_FEEDBACK)
      // prepend to the right <td> (<div> is floated right)
      tr.lastElementChild?.prepend(fbIcon)
    tbody.appendChild(tr)
  }) // end of loop over each (sub-)result
  return tbody
}
