#!/usr/bin/env bash
# Installs fastlane for .github/workflows/store-text.yml (run from store/), every gem exactly as
# Gemfile.lock pins it; with a lock file, a Gemfile that doesn't match it stops the run. With no
# Gemfile.lock (after changing fastlane's version in Gemfile), it makes one for GitHub's Linux and
# Mac machines, and the workflow keeps it as the "gemfile-lock" artifact to commit.
set -euo pipefail

if [ -f Gemfile.lock ]; then
  bundle config set --local frozen true
else
  echo "::warning::store/Gemfile.lock is missing, so this run makes one: download \"gemfile-lock\" from the run's artifacts and commit it as store/Gemfile.lock"
  bundle lock --add-platform x86_64-linux --add-platform arm64-darwin
  echo "made_lock=true" >> "${GITHUB_OUTPUT:-/dev/null}"
fi
bundle install
