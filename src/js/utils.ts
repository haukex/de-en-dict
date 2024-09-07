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

export function walkTextNodes(node :Node, callback :(txt:Text)=>Node) {
  if (node.nodeType==Node.TEXT_NODE)
    node.parentNode?.replaceChild(callback(node as Text), node)
  else  // text nodes shouldn't have children, but play it safe anyway
    node.childNodes.forEach((child) => walkTextNodes(child, callback))
}

/** This function walks the DOM tree, looking for matches of a regular expression in all
 * found text nodes, and calling a function for all matches that should wrap them in an HTML element.
 *
 * @param node The node/element at which to begin the search for text nodes.
 *  Note `Node.normalize()` is called on it.
 * @param searchPat The pattern for which to search in the text.
 *  May **NOT** contain anchors or capturing groups!
 * @param wrapper A function that takes a string and wraps it in a new HTML element,
 *  the return value is inserted in the DOM tree instead of the text.
 * @param flags Any regex flags like `i`, but *don't* use any of `mgy`!
 */
export function wrapTextNodeMatches(node :Node, searchPat :string, wrapper :(match:string)=>HTMLElement, flags :string = '') {
  const splitRe = RegExp('('+searchPat+')','g'+flags)
  const matchRe = RegExp('^(?:'+searchPat+')$',flags)
  node.normalize()
  walkTextNodes(node, (txt) => {
    if ( txt.data.search(splitRe)<0 )
      return txt
    const df = document.createDocumentFragment()
    for ( const part of txt.data.split(splitRe) )
      df.appendChild( part.match(matchRe) ? wrapper(part) : document.createTextNode(part) )
    return df
  })
}

export function cleanSearchTerm(what :string) {
  // Note it's important that we can call this function twice on the same string and get the same output.
  return what.replaceAll(/\s+/g, ' ').trim()
}
