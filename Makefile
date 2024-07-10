
# Run `npm start` for the dev server

.PHONY: all
all: dist/index.html

dist/index.html: test src/index.html src/*/*.ts package*.json src/*/tsconfig.json .parcelrc
	npx parcel build

.PHONY: test
test:
	cd src/js && npx tsc --noEmit
	cd src/sw && npx tsc --noEmit
	npx eslint src/*/*.ts

.PHONY: clean
clean:
	rm -rf dist .parcel-cache

.PHONY: installdeps
# First you need to install Node/npm, for example as per https://github.com/haukex/toolshed/blob/main/notes/JavaScript.md
installdeps:
	npm ci
