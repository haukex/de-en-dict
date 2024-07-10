
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
installdeps:
	npm ci
