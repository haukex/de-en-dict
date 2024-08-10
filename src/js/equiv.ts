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
  // greek letters
  [ ['alpha'],                ['α']      ],
  [ ['lambda', 'lamda'],      ['λ']      ],
  [ ['omega', 'ohm'],         ['Ω']      ],
  // special chars
  [ ['\'', '’'],              []         ],
  [ ['-', '–'],               []         ],
  [ ['...', '…'],             []         ],
  [ ['"', '“', '”', '„'],     []         ],
  // other special sequences
  [ ['^2'],                   ['²']      ],
  [ ['^3'],                   ['³']      ],
  [ ['m2'],                   ['m²']     ],
  [ ['m3'],                   ['m³']     ],
  [ ['1/2'],                  ['½']      ],
  [ ['*', 'x'],               ['×']      ],
  [ ['(R)'],                  ['®']      ],
  [ ['(c)', '(C)'],           ['©']      ],
]

function assert(condition: unknown, msg?: string): asserts condition {
  if (!condition) throw new Error(msg)
}

interface IStringSetHash {
  [details: string] : Set<string>;
}
interface IStringHash {
  [details: string]: string;
}

// this code builds the set of patterns to match and each of their replacements
const _pat_dict :IStringSetHash = {}
for (const [l,r] of EQUIV) {
  assert(l && r)
  for (const k of l) {
    for (const v of (r.length ? [k].concat(r) : l) ) {
      if (!(k in _pat_dict))
        _pat_dict[k] = new Set()
      assert(_pat_dict[k] instanceof Set)
      _pat_dict[k].add(v)
    }
  }
}
const _pats = Object.keys(_pat_dict).sort().sort((a,b) => b.length-a.length)
const EQUIV_PAT = new RegExp( '(' + _pats.map(escapeStringRegexp).join('|') + ')', 'g')
const EQUIV_REPL :IStringHash = {}
for (const pat of _pats) {
  const s = _pat_dict[pat]
  assert(s)
  const repl = Array.from(s.values()).sort().sort((a,b) => b.length-a.length)
  EQUIV_REPL[pat] = (
    repl.length == 1
      ? escapeStringRegexp(repl[0] as string)
      : repl.every((r)=>r.length==1)
        ? '[' + repl.map(escapeStringRegexp).join('') + ']'
        : '(?:' + repl.map(escapeStringRegexp).join('|') + ')'
  )
}
//console.debug(EQUIV_PAT, EQUIV_REPL)

/**
 * This function takes a search word and turns it into a string suitable for use in a regular expression.
 * Two strings are returned: The first is the search word simply turned into a regular expression
 * (a stricter version, intended for use in giving exact matches a higher score), while the second string
 * contains mappings for the character equivalents (a looser pattern that will result in more matches).
 *
 * Callers are expected to have cleaned the search term with `cleanSearchTerm`.
 */
export function makeSearchPattern(what :string) : [string, string] {
  let withEquiv = ''
  for (const part of what.split(EQUIV_PAT) ) {
    if (part in EQUIV_REPL)
      withEquiv += EQUIV_REPL[part]  // special chars already escaped
    else
      withEquiv += escapeStringRegexp(part)
  }
  return [escapeStringRegexp(what), withEquiv]
}
