
# Run `npm start` for the dev server

.PHONY: all
all: dist/index.html

dist/index.html: test src/index.html src/main.ts sw/sw.ts package.json package-lock.json src/tsconfig.json sw/tsconfig.json .parcelrc
	npx parcel build

.PHONY: test
test:
	cd src && npx tsc --noEmit
	cd sw && npx tsc --noEmit
	npx eslint */*.ts

.PHONY: clean
clean:
	rm -rf dist .parcel-cache

.PHONY: installdeps
# First you need to install Node/npm, for example as per https://github.com/haukex/toolshed/blob/main/notes/JavaScript.md
installdeps:
	npm ci
