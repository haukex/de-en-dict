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

export type MessageType =
    { type: 'dict-load', percent :number, status ?:never }
  | { type: 'dict-upd',  percent ?:never, status :'loading'|'done' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isMessage(obj :any): obj is MessageType {
  return 'type' in obj && ( obj.type === 'dict-load' || obj.type === 'dict-upd' )
}
