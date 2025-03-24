/**
 * German-English Dictionary
 * =========================
 *
 * Copyright © 2024-2025 Hauke Dämpfling, haukex@zero-g.net
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

/** Set up a "scroll to top button". Don't call this util the document is loaded. */
export function initScrollTop() {
  const btnScrollTop = document.createElement('button')
  btnScrollTop.setAttribute('id','btn-scroll-top')
  btnScrollTop.setAttribute('title','Scroll to top of page')
  btnScrollTop.innerText = 'Top ↑'
  btnScrollTop.addEventListener('click', () => window.scrollTo(0,0) )
  //const searchBoxTop = search_term.getBoundingClientRect().y  // changes based on layout, I'll just use a fixed value
  const updateScrollBtnVis = () => btnScrollTop.classList.toggle('d-none', window.scrollY <= 60)
  window.addEventListener('scroll', updateScrollBtnVis)
  document.body?.appendChild(btnScrollTop)
  updateScrollBtnVis()
}
