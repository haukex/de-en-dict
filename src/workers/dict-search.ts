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
import {MessageType} from '../js/common'

/* Let's say a slow search is 10s to search 200,000 lines, that means 20,000 lines/s.
 * A report every 100ms would means that we should send a report every 2000 lines.
 * Decreasing this value means more progress reports for *really* slow searches,
 * so more user-friendly in that way, but it also means slower searches overall. */
const CHECK_INTERVAL_LINES = 500

const INITIAL_REPORT_MS = 500
const REPORT_INTERVAL_MS = 100

/** This function actually performs the dictionary search.
 *
 * @param what The search term.
 * @returns A tuple consisting of the search pattern turned into a regex (string, via `makeSearchPattern`),
 *  and an array of matches from the `dictLines` array.
 */
export function searchDict(dictLines :string[], what :string): [string, string[]] {
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
  let linesUntilCheck = CHECK_INTERVAL_LINES
  let searchNextReportMs = searchStartMs + INITIAL_REPORT_MS
  let sentLt100Report = false

  // this code actually performs the search
  // first build an array of tuples, each element being the matching line and its score
  const scoredMatches :[string,number][] = []
  dictLines.forEach( (line, li) => {
    // apply the regex to each dictionary line
    if (line.match(whatRe))
      // for each match, store the line...
      scoredMatches.push( [line,
        // ... and match it against each scoring regex, giving one point per match, and summing the scores
        scoreRes.map((re):number=>line.match(re)?1:0).reduce((a,b)=>a+b,0) ])

    // see if it's time to check how long we've been searching
    // (I assume a subtraction every iteration is faster than getting the current time each iteration)
    if ( ! --linesUntilCheck ) {
      linesUntilCheck = CHECK_INTERVAL_LINES
      // check how long we've been searching
      const nowMs = new Date().getTime()
      if ( nowMs >= searchNextReportMs ) {
        searchNextReportMs = nowMs + REPORT_INTERVAL_MS
        // interval has passed, fire off a progress report
        const percent = 100*(li+1)/dictLines.length
        const m :MessageType = { type: 'search-prog', percent: percent }
        postMessage(m)
        sentLt100Report = percent<100
      }
    }
  })
  // sort the scored matches (note sort should be stable in modern JS)
  scoredMatches.sort((a,b) => b[1]-a[1])
  //console.debug(scoredMatches)
  // now that we've sorted, we can strip the scores out of the returned values
  const matches :string[] = scoredMatches.map(([line, _score]) => line)

  console.debug(`Search for ${whatRe} found ${matches.length} matches in ${new Date().getTime()-searchStartMs}ms.`)
  // if we sent a progress report <100% previously, make sure to send a 100% one
  if (sentLt100Report) {
    const m :MessageType = { type: 'search-prog', percent: 100 }
    postMessage(m)
  }

  return [whatPat, matches]
}
