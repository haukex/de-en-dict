German-English Dictionary
=========================

**<https://dict.zero-g.net>**

This is a browser-based client for the database of the discontinued
["Beolingus"](https://dict.tu-chemnitz.de) German-English Dictionary.
It can be used in any modern browser with modern JavaScript support,
and it can be installed for offline use as a "Progressive Web App".

Please note the word list itself is not part of this repository.
Please send suggestions for the word list to beolingus@tu-chemnitz.de

Technical Overview
------------------

The main part of this project is written in [TypeScript](https://www.typescriptlang.org/), which is
called from an HTML file. The [Parcel](https://parceljs.org/) tool is used to compile TypeScript
to JavaScript and bundle everything (HTML, CSS, JS, images). The result is currently hosted on
GitHub Pages, using a GitHub Action to produce the aforementioned bundle. The dictionary data is
fetched as a gzipped text file from a remote server, which must send an `Access-Control-Allow-Origin`
header to allow the JS code to fetch the file. The dictionary file is explicitly cached using the
JS Cache API to limit the load on the origin server as much as possible. Installation as a
"Progressive Web App" is made possible by a corresponding manifest file, and offline use is made
possible by a corresponding JS Service Worker that caches the app. The entered search term is
turned into a regular expression, which is used to search the dictionary data, and results are
sorted by a score determined by a set of regular expressions and rendered into an HTML table.

Development Environment
-----------------------

- Prerequisites:
  - Linux (Windows may work, I haven't checked)
  - Node.js with `npm` ([my installation notes](https://github.com/haukex/toolshed/blob/main/notes/JavaScript.md))
  - GNU `make`
  - Run `make installdeps` to install the dependencies via `npm`
  - Or [![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/haukex/de-en-dict)
- Run `make clean all` for a full rebuild with linting
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

### Used Libraries

This project makes use of the following libraries:

- [{} Simple.css](https://simplecss.org/),
  Copyright © 2020 Simple.css (Kev Quirk),
  [MIT License](https://github.com/kevquirk/simple.css/blob/main/LICENSE)
- [escape-string-regexp](https://www.npmjs.com/package/escape-string-regexp),
  Copyright © Sindre Sorhus \<sindresorhus@gmail.com\> (https://sindresorhus.com),
  [MIT License](https://github.com/sindresorhus/escape-string-regexp/blob/main/license)
