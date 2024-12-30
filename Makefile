
.PHONY: all
all: dist/index.html

dist/index.html: lint src/index.html src/*/*.ts package*.json src/*/tsconfig.json .parcelrc
	npx parcel build --public-url=https://dict.zero-g.net/

.PHONY: lint
lint:
	cd src/js && npx tsc --noEmit
	cd src/workers && npx tsc --noEmit
	npx eslint src/*/*.ts

.PHONY: clean
clean:
	rm -rf dist .parcel-cache

.PHONY: installdeps
installdeps:
	npm ci
	git config set --local filter.git_commit.clean "\$$PWD/git_commit_filter.pl clean"
	git config set --local filter.git_commit.smudge "\$$PWD/git_commit_filter.pl smudge"

# This upgrades dependencies to their latest version.
# Run `npm outdated` or `npx ncu` to just see a report without modifying versions.
.PHONY: upgrade
upgrade:
	npx ncu -u
