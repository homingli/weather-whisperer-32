# Weather Whisperer — Android APK build & release shortcuts (mobile branch)
#
#   make help         list targets (this is also the default)
#   make bump         bump version + commit & push — patch default; MINOR=1, MAJOR=1, VERSION=x.y[.z]
#   make apk          debug APK (fast, debug-signed)
#   make apk-release  release APK, signed via android/keystore.properties
#   make upload       upload the release APK to a GitHub prerelease (apk-v<VERSION>)
#   make release      apk-release + upload
#   make icons        regenerate launcher icons from assets/
#   make clean        clean gradle build outputs
#
# VERSION comes from versionName in android/app/build.gradle; override inline:
#   make upload VERSION=1.1
# Gradle names the artifact weather-whisperer-v<VERSION>.apk (see the
# applicationVariants block in android/app/build.gradle), so the GitHub
# release asset carries that name too.

JAVA_HOME ?= $(shell /usr/libexec/java_home 2>/dev/null || echo /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home)
export JAVA_HOME

VERSION     ?= $(shell sed -n 's/.*versionName "\([^"]*\)".*/\1/p' android/app/build.gradle | head -1)
TAG         := apk-v$(VERSION)
APK_DEBUG   := android/app/build/outputs/apk/debug/weather-whisperer-v$(VERSION).apk
APK_RELEASE := android/app/build/outputs/apk/release/weather-whisperer-v$(VERSION).apk

# `make bump VERSION=x.y.z` treats VERSION as an explicit set only when it came
# from the command line — otherwise it's the current value read from build.gradle.
BUMP_FLAGS =
ifeq ($(origin VERSION),command line)
BUMP_FLAGS += --set $(VERSION)
endif
ifneq ($(filter 1,$(MINOR)),)
BUMP_FLAGS += --minor
endif
ifneq ($(filter 1,$(MAJOR)),)
BUMP_FLAGS += --major
endif

.PHONY: help bump apk apk-release upload release icons clean

help: ## list targets
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) \
		| awk '{ i = index($$0, "## "); printf "  \033[36m%-14s\033[0m %s\n", substr($$1, 1, length($$1) - 1), substr($$0, i + 3) }'

bump: ## bump version, commit & push (patch default; MINOR=1, MAJOR=1, VERSION=x.y[.z])
	@node scripts/bump-version.mjs $(BUMP_FLAGS)
	@git add android/app/build.gradle package.json
	@git commit -m "chore(release): v$$(sed -n 's/.*versionName \"\([^\"]*\)\".*/\1/p' android/app/build.gradle | head -1)"
	@git push origin mobile

apk: ## build debug APK (debug-signed)
	pnpm run apk

apk-release: ## build release APK (signed via android/keystore.properties)
	pnpm run apk:release

# Creates the prerelease on first run, clobbers the APK on re-runs.
upload: ## upload release APK to GitHub prerelease apk-v<VERSION>
	@git fetch origin mobile
	@test "$$(git rev-parse mobile)" = "$$(git rev-parse origin/mobile)" \
		|| { echo "local mobile != origin/mobile — push or pull first so the apk-v tag lands on what you upload"; exit 1; }
	@test -n "$(VERSION)" || { echo "versionName not found in android/app/build.gradle; pass VERSION=x.y"; exit 1; }
	@test -f "$(APK_RELEASE)" || { echo "no release APK — run make apk-release first"; exit 1; }
	@gh release view "$(TAG)" >/dev/null 2>&1 \
		&& gh release upload "$(TAG)" "$(APK_RELEASE)" --clobber \
		|| gh release create "$(TAG)" "$(APK_RELEASE)" \
			--target mobile --prerelease \
			--title "Weather Whisperer v$(VERSION) (Android)" \
			--notes "Debug-tier Android build of the mobile branch. Uninstall any previously sideloaded build signed with a different key before installing."
	@echo "----"
	@echo "Reminder: next release starts with make bump (patch) / make bump MINOR=1."

release: apk-release upload ## apk-release + upload

icons: ## regenerate launcher icons from assets/
	pnpm run icons

clean: ## remove gradle build outputs
	cd android && ./gradlew --no-daemon clean
