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

import {makeSearchPattern} from './equiv'

/** This function actually performs the dictionary search.
 *
 * @param what The search term.
 * @returns A tuple consisting of the search pattern turned into a regex (string, via `makeSearchPattern`),
 *  and an array of indices pointing into the matches in the `dictLines` array.
 */
export function searchDict(dictLines :string[], what :string): [string, number[]] {
  // if the search term or dictionary are empty, don't produce any results
  if (!what.length || !dictLines.length) return ['', []]

  // turn the search term into a regex
  // NOTE `whatPat` must not contain anchors or capturing groups, so it can be used in `wrapTextNodeMatches`
  const [whatPatStricter, whatPat] = makeSearchPattern(what)

  // compile the regex that matches the search term
  const whatRe = new RegExp(whatPat, 'ig')

  /* The following code generates a set of regular expressions used for scoring the matches.
    * For each regex that matches, one point is awarded. */
  const scoreRes :RegExp[] = [
    '(?:^|::\\s*)',           // term is at the very beginning of an entry (German at beginning of line or English after "::")
    '(?:^|::\\s*)',           // in fact, this is important enough to give it double points
    '(?:^|::\\s*|\\|\\s*)',   // +or term is at beginning of a sub-entry (after "|")
    '::\\s*to\\s+',           // term is an English verb (":: to sprint")
    '\\b' ]                   // term is at the beginning of a word
    .flatMap((re)=>[re+whatPat, re+whatPatStricter]) // apply all of the above to the search pattern and its "stricter version"
    .flatMap((re)=>[re, // for all of the above:
      re+'\\b', re+'\\b',     // term is at the end of a word - in combination with the above, this means whole words, so double points
      // term is followed by braces/brackets/parens followed by the end of that entry, sub-entry, or list item
      // https://regex101.com/r/7tBMul
      re+'(?:\\s*\\{[^}|]*\\}|\\s*\\[[^\\]|]*\\]|\\s*\\([^)|]*\\))*\\s*(?:$|::|\\||;)'])
    // create case-sensitive and case-insensitive regex versions of all of the above
    .flatMap((re)=>[new RegExp(re), new RegExp(re, 'i')])
  //console.debug(scoreRes)

  const searchStartMs = new Date().getTime()

  // this code actually performs the search
  // first build an array of tuples, each element being the matching line's index and its score
  const scoredMatches :[number,number][] = (
    // apply the regex to each dictionary line, returning the line's index if it matches
    dictLines.flatMap((line, i) => line.match(whatRe) ? [i] : [])
      // for each match, store the line's index...
      .map(li => [li,
        // ... and match it against each scoring regex, giving one point per match, and summing the scores
        scoreRes.map((re):number=>dictLines[li]?.match(re)?1:0).reduce((a,b)=>a+b,0) ]) )
  // sort the scored matches (note sort should be stable in modern JS)
  scoredMatches.sort((a,b) => b[1]-a[1])
  //console.debug(scoredMatches)
  // now that we've sorted, we can strip the scores out of the returned values
  // so the `matches` array stores indices into the `dictLines` array for each matching line
  const matches :number[] = scoredMatches.map(([li, _score]) => li)

  console.debug(`Search for ${whatRe} found ${matches.length} matches in ${new Date().getTime()-searchStartMs}ms.`)

  return [whatPat, matches]
}
