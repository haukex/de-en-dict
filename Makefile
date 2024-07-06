
# Run `npm start` for the dev server

.PHONY: build
build: dist/index.html

dist/index.html: src/index.html src/main.ts test package.json package-lock.json tsconfig.json .parcelrc
	npm run build

.PHONY: test
test: eslint.config.js
	npm test

.PHONY: clean
clean:
	rm -rf dist

.PHONY: installdeps
# First you need to install Node/npm, for example as per https://github.com/haukex/toolshed/blob/main/notes/JavaScript.md
installdeps:
	npm ci
