
.PHONY: all
all: dist/index.html

dist/index.html: lint src/index.html src/*/*.ts package*.json src/*/tsconfig.json .parcelrc
	npx parcel build

.PHONY: lint
lint:
	cd src/js && npx tsc --noEmit
	cd src/sw && npx tsc --noEmit
	npx eslint src/*/*.ts

.PHONY: clean
clean:
	rm -rf dist .parcel-cache

.PHONY: installdeps
installdeps:
	npm ci

# This upgrades dependencies to their latest version.
# Run `npm outdated` or `npx ncu` to just see a report without modifying versions.
.PHONY: upgrade
upgrade:
	npx ncu -u
