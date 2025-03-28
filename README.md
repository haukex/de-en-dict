German-English Dictionary
=========================

**<https://dict.zero-g.net>**

This is a browser-based client for the database of the discontinued
["Beolingus"](https://dict.tu-chemnitz.de) German-English Dictionary.
It can be used in any up-to-date browser with modern JavaScript support,
and it can be installed for offline use as a "Progressive Web App".

Please note the word list itself is not part of this repository.
Please send suggestions for the word list to beolingus@tu-chemnitz.de

Troubleshooting
---------------

1. Please make sure you're using the *latest version* of a modern browser with modern JavaScript support,
  such as Firefox, Chrome, Edge, or Safari (but please note the latter requires a *current* version of macOS).
   - If you are using any browser plug-ins that may block JavaScript (e.g. NoScript, JShelter, LibreJS, ...),
     then make sure to whitelist `dict.zero-g.net`.
3. To make sure you're seeing the latest version of the page/app, please try clearing your browser's cache
  as well as all saved data for the site "zero-g.net".
4. Try accessing this link: <https://ftp.tu-chemnitz.de/pub/Local/urz/ding/de-en-devel/>, if you have trouble
  doing so, then the dictionary server may be offline or possibly blocked by a firewall from your location.
   - If you are using any browser plug-ins that block requests to "third-party" sites, then make sure to
     allow access to `ftp.tu-chemnitz.de`, or whitelist `dict.zero-g.net`.

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
The dictionary loading and search is handled in the background by a Web Worker.

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

Thanks ❤️
--------

- [@frituc (Frank Richter)](https://github.com/frituc)
  for the [German-English Dictionary](https://ftp.tu-chemnitz.de/pub/Local/urz/ding/de-en-devel/)
  and [several suggestions](https://github.com/haukex/de-en-dict/issues?q=author%3Afrituc)
- [@orrc (Christopher Orr)](https://github.com/orrc)
  for [implementing searching via URL hash](https://github.com/haukex/de-en-dict/pull/1)
- [@Tekl (Wolfgang Kreutz)](https://github.com/Tekl), author of the
  [macOS Beolingus German-English Dictionary Plugin](https://tekl.de/lexikon-plug-ins/beolingus-deutsch-englisch-lexikon-plugin),
  for [suggesting searching via URL query](https://github.com/haukex/de-en-dict/issues/7)
- [@darmuent (Helmut)](https://github.com/darmuent), for a
  [correction](https://github.com/haukex/de-en-dict/issues/27)
- [@christophfriedrich (Christoph Friedrich)](https://github.com/christophfriedrich)
  for [several suggestions](https://github.com/haukex/de-en-dict/issues?q=author%3Achristophfriedrich)
- [@rmetzler (Richard Metzler)](https://github.com/rmetzler)
  for [suggesting OpenSearch support](https://github.com/haukex/de-en-dict/issues/39)
- Several (anonymous) people who sent bug reports and suggestions,
  and several people who emailed me expressing their thanks!

It is all much appreciated!

Author, Copyright, and License
------------------------------

Dictionary data from [dict.tu-chemnitz.de](https://dict.tu-chemnitz.de) is
Copyright © 1995-2025 [Frank Richter](https://www-user.tu-chemnitz.de/~fri/).

This page/app is Copyright © 2024-2025 [Hauke Dämpfling](https://www.zero-g.net/).

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

### Used Libraries ❤️

This project makes use of the following libraries:

- [{} Simple.css](https://simplecss.org/),
  Copyright © 2020 Simple.css (Kev Quirk),
  [MIT License](https://github.com/kevquirk/simple.css/blob/main/LICENSE).
- [escape-string-regexp](https://www.npmjs.com/package/escape-string-regexp),
  Copyright © Sindre Sorhus \<sindresorhus@gmail.com\> (https://sindresorhus.com),
  [MIT License](https://github.com/sindresorhus/escape-string-regexp/blob/main/license).
- [Floating UI](https://floating-ui.com/),
  Copyright © 2021 Floating UI contributors,
  [MIT License](https://github.com/floating-ui/floating-ui/blob/master/LICENSE).
- Some content (abbreviation list) is taken from
  [Beolingus Deutsch-Englisch Lexikon-Plug-in](https://tekl.de/lexikon-plug-ins/beolingus-deutsch-englisch-lexikon-plugin),
  Copyright © 2025 Wolfgang Kreutz and TU Chemnitz,
  [GNU GPL 3.0+](https://github.com/Tekl/beolingus-deutsch-englisch/blob/master/LICENSE).
- An LRU class was adapted from
  [this StackOverflow answer](https://stackoverflow.com/a/46432113)
  by user [odinho - Velmont](https://github.com/Velmont).
