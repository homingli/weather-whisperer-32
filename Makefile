# Weather Whisperer — Android APK build & release shortcuts (mobile branch)
#
#   make apk          debug APK (fast, debug-signed)
#   make apk-release  release APK, signed via android/keystore.properties
#   make upload       upload the release APK to a GitHub prerelease (apk-v<VERSION>)
#   make release      apk-release + upload
#   make icons        regenerate launcher icons from assets/
#   make clean        clean gradle build outputs
#
# VERSION comes from versionName in android/app/build.gradle; override inline:
#   make upload VERSION=1.1

JAVA_HOME ?= $(shell /usr/libexec/java_home 2>/dev/null || echo /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home)
export JAVA_HOME

APK_DEBUG   := android/app/build/outputs/apk/debug/app-debug.apk
APK_RELEASE := android/app/build/outputs/apk/release/app-release.apk
VERSION     ?= $(shell sed -n 's/.*versionName "\([^"]*\)".*/\1/p' android/app/build.gradle | head -1)
TAG         := apk-v$(VERSION)

.PHONY: apk apk-release upload release icons clean

apk:
	pnpm run apk

apk-release:
	pnpm run apk:release

# Creates the prerelease on first run, clobbers the APK on re-runs.
upload:
	@test -n "$(VERSION)" || { echo "versionName not found in android/app/build.gradle; pass VERSION=x.y"; exit 1; }
	@test -f "$(APK_RELEASE)" || { echo "no release APK — run make apk-release first"; exit 1; }
	@gh release view "$(TAG)" >/dev/null 2>&1 \
		&& gh release upload "$(TAG)" "$(APK_RELEASE)" --clobber \
		|| gh release create "$(TAG)" "$(APK_RELEASE)" \
			--target mobile --prerelease \
			--title "Weather Whisperer v$(VERSION) (Android)" \
			--notes "Debug-tier Android build of the mobile branch. Uninstall any previously sideloaded build signed with a different key before installing."
	@echo "----"
	@echo "Reminder: bump versionCode/versionName in android/app/build.gradle before shipping an update."

release: apk-release upload

icons:
	pnpm run icons

clean:
	cd android && ./gradlew --no-daemon clean
