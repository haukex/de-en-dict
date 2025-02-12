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

import escapeStringRegexp from 'escape-string-regexp'
import {assert} from '../js/common'
//import {default as alphabet} from './alphabet.json'
//const WORD_RE = new RegExp(alphabet.re.word)

/**
 * The following is the list of character equivalencies.
 * If the user searches for any of the strings in the left list, then the search should
 * result in matches for what the user entered, plus the alternatives in the right list.
 * If the right list is empty, it is taken to be identical to the left list.
 * The idea is that users can enter search terms in ASCII and still find Unicode chars.
 * REMEMBER to keep this list in sync with the special characters in the grammar in dict-check.pl !
 */
const EQUIV :[string[], string[]][] = [
  // ä
  // searches for "a" should match "a" or "ä", and "A" matches "A" or "Ä"
  [ ['a'],                    ['ä']      ],
  [ ['A'],                    ['Ä']      ],
  // searches for "ae" or "ä" should both match either "ae" or "ä" (same for uppercase)
  [ ['ae', 'ä'],              []         ],
  [ ['AE', 'Ae', 'Ä'],        []         ],
  // ö
  [ ['o'],                    ['ö']      ],
  [ ['O'],                    ['Ö']      ],
  [ ['oe', 'ö'],              []         ],
  [ ['OE', 'Oe', 'Ö'],        []         ],
  // ü
  [ ['u'],                    ['ü']      ],
  [ ['U'],                    ['Ü']      ],
  [ ['ue', 'ü'],              []         ],
  [ ['UE', 'Ue', 'Ü'],        []         ],
  // ß
  [ ['ss', 'sz'],             ['ß']      ],
  [ ['ß'],                    ['ss']     ],
  // others
  [ ['e'],                    ['ë']      ],
  [ ['i'],                    ['ï']      ],
  [ ['A'],                    ['Á']      ],
  [ ['E'],                    ['É']      ],
  [ ['I'],                    ['Î']      ],
  [ ['a'],                    ['á']      ],
  [ ['e'],                    ['é']      ],
  [ ['i'],                    ['í']      ],
  [ ['o'],                    ['ó']      ],
  [ ['a'],                    ['à']      ],
  [ ['e'],                    ['è']      ],
  [ ['i'],                    ['ì']      ],
  [ ['o'],                    ['ò']      ],
  [ ['a'],                    ['â']      ],
  [ ['e'],                    ['ê']      ],
  [ ['i'],                    ['î']      ],
  [ ['o'],                    ['ô']      ],
  [ ['u'],                    ['û']      ],
  [ ['a'],                    ['ã']      ],
  [ ['n'],                    ['ñ']      ],
  [ ['i'],                    ['ī']      ],
  [ ['c'],                    ['ç']      ],
  [ ['S'],                    ['Š']      ],
  [ ['a'],                    ['å']      ],
  [ ['ae'],                   ['æ']      ],
  [ ['l'],                    ['ł']      ],
  // greek letters
  [ ['alpha'],                ['α']      ],
  [ ['lambda', 'lamda'],      ['λ']      ],
  [ ['omega', 'ohm'],         ['Ω']      ],
  // special chars
  [ ['\'', '’', 'ʽ'],         []         ],
  [ ['-', '–', '⁻'],          []         ],
  [ ['...', '…'],             []         ],
  [ ['"', '“', '”', '„'],     []         ],
  // other special sequences
  [ ['0'],                    ['₀','⁰']  ],
  [ ['1'],                    ['₁','¹']  ],
  [ ['2'],                    ['₂','²']  ],
  [ ['3'] ,                   ['₃','³']  ],
  [ ['4'],                    ['₄','⁴']  ],
  [ ['5'],                    ['₅','⁵']  ],
  [ ['6'],                    ['₆','⁶']  ],
  [ ['7'],                    ['₇','⁷']  ],
  [ ['8'],                    ['₈','⁸']  ],
  [ ['9'],                    ['₉','⁹']  ],
  [ ['1/2'],                  ['½']      ],
  [ ['x'],                    ['×']      ],
  [ ['(R)'],                  ['®']      ],
  [ ['(c)', '(C)'],           ['©']      ],
]

// this code builds the set of patterns to match and each of their replacements
const _pat_dict :Map<string, Set<string>> = new Map()
for (const [l,r] of EQUIV) {
  assert(l.length)
  for (const k of l) {
    assert(k.length)
    for (const v of (r.length ? [k].concat(r) : l) ) {
      assert(v.length)
      const s :Set<string> = _pat_dict.get(k) ?? new Set()
      s.add(v)
      _pat_dict.set(k, s)
    }
  }
}
const _pats = Array.from(_pat_dict.keys()).sort().sort((a,b) => b.length-a.length)
// add `*` to the following so we split on wildcards too (special treatment below)
const EQUIV_PAT = new RegExp( '(' + _pats.map(escapeStringRegexp).join('|') + '|\\*)', 'g')
const EQUIV_REPL :Map<string, string> = new Map()
for (const pat of _pats) {
  assert(pat.length)
  const s = _pat_dict.get(pat)
  assert(s)
  const repl = Array.from(s.values()).sort().sort((a,b) => b.length-a.length)
  assert(repl.length)
  EQUIV_REPL.set(pat,
    repl.length == 1
      ? escapeStringRegexp(repl[0] as string)
      : repl.every(r=>r.length==1)
        ? '[' + repl.map(escapeStringRegexp).join('') + ']'
        : '(?:' + repl.map(escapeStringRegexp).join('|') + ')'
  )
}
//console.debug(EQUIV_PAT, EQUIV_REPL)
// make sure `*` isn't in dict because it gets special treatment as a wildcard:
assert(!EQUIV_REPL.has('*'))

/**
 * This function takes a search word and turns it into a string suitable for use in a regular expression.
 * Two strings are returned: The first is the search word simply turned into a regular expression
 * (a stricter version, intended for use in giving exact matches a higher score), while the second string
 * contains mappings for the character equivalents (a looser pattern that will result in more matches).
 * The latter is what will actually be used in the search.
 *
 * Callers are expected to have cleaned the search term with `cleanSearchTerm`.
 *
 * **Internal Note:** Our caller expects us to return a pattern **WITHOUT** anchors or capturing groups!
 */
export function makeSearchPattern(what :string) : [string, string] {
  // `parts` is tuples of: [ 0. escaped string, 1. with replacements ]
  const parts :[string, string][] =
    what.split(EQUIV_PAT).filter(s => s.length)
      .flatMap( (v,i,arr) =>
        v==='*' && (
          i && arr[i-1]==='*'         // strip duplicate '*'
          // a search for "*blah*" is equivalent to a search for "blah" since there are no anchors, so:
          || i==0 || i==arr.length-1  // strip '*' at beginning or end
        ) ? [] : [v] )
      .map( v => {
        const replacement = v==='*' ? '.*?' : escapeStringRegexp(v)
        return [ replacement, EQUIV_REPL.get(v)??replacement ]
      } )
  //console.debug(parts)
  return [ parts.map(v=>v[0]).join(''), parts.map(v=>v[1]).join('') ]
}
