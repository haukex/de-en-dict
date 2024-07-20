German-English Dictionary
=========================

**<https://dict.zero-g.net>**

This is a browser-based client for the database of the discontinued
["Beolingus"](https://dict.tu-chemnitz.de) German-English Dictionary.
It can be used in any modern browser with modern JavaScript support,
and it can be installed for offline use as a "Progressive Web App".

Please note the word list itself is not part of this repository.
Please send suggestions for the word list to beolingus@tu-chemnitz.de

Development Environment
-----------------------

- Prerequisites:
  - Linux (Windows may work, I haven't checked)
  - Node.js with `npm` ([my installation notes](https://github.com/haukex/toolshed/blob/main/notes/JavaScript.md))
  - GNU `make`
  - Run `make installdeps` to install the dependencies via `npm`
  - Or [![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/haukex/de-en-dict)
- Run `make clean all` for a full rebuild with tests
- Run `npm start` to start up the local development server (with live refresh)

Thanks
------

- [@frituc (Frank Richter)](https://github.com/frituc)
  for the [German-English Dictionary](https://ftp.tu-chemnitz.de/pub/Local/urz/ding/de-en-devel/)
  and [several suggestions](https://github.com/haukex/de-en-dict/issues?q=author%3Afrituc)
- [@orrc (Christopher Orr)](https://github.com/orrc)
  for [implementing searching via URL hash](https://github.com/haukex/de-en-dict/pull/1)
- [@Tekl (Wolfgang Kreutz)](https://github.com/Tekl), author of the
  [macOS Beolingus German-English Dictionary Plugin](https://tekl.de/lexikon-plug-ins/beolingus-deutsch-englisch-lexikon-plugin),
  for [suggesting searching via URL query](https://github.com/haukex/de-en-dict/issues/7)
- [@sindresorhus (Sindre Sorhus)](https://github.com/sindresorhus)
  for [escape-string-regexp](https://github.com/sindresorhus/escape-string-regexp),
  from which I've borrowed a line of code

Author, Copyright, and License
------------------------------

Dictionary data from [dict.tu-chemnitz.de](https://dict.tu-chemnitz.de) is
Copyright © 1995-2024 [Frank Richter](https://www-user.tu-chemnitz.de/~fri/).

This page/app is Copyright © 2024 [Hauke Dämpfling](https://www.zero-g.net/).

This project is free software; you can redistribute it and/or
modify it under the terms of the GNU General Public License
as published by the Free Software Foundation; either version 2
of the License, or (at your option) any later version.

This project is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this project; if not, write to the Free Software
Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
