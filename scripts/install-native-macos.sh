#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != Darwin ]]; then echo 'Use the Windows instructions in README.md.'; exit 1; fi
command -v brew >/dev/null || { echo 'Install Homebrew from https://brew.sh first.'; exit 1; }
if [[ ! -x /opt/homebrew/opt/node@24/bin/node && ! -x /usr/local/opt/node@24/bin/node ]]; then brew install node@24; fi
if [[ ! -x /opt/homebrew/opt/postgresql@17/bin/psql && ! -x /usr/local/opt/postgresql@17/bin/psql ]]; then brew install postgresql@17; fi
if ! command -v mongod >/dev/null && [[ ! -x .tools/mongodb/bin/mongod ]]; then
  arch="$(uname -m)"
  if [[ "$arch" == arm64 ]]; then platform=arm64; checksum=3255cbf2e70cc5de04220046e006067d20068656d1bfa674828768a51d20d5a6;
  else platform=x86_64; checksum=3d391b8c41df069671afaa88ca21def057178aecce1813437539143b71f28152; fi
  archive="$(mktemp -t saffron-mongodb).tgz"
  trap 'rm -f "$archive"' EXIT
  curl --fail --location "https://fastdl.mongodb.org/osx/mongodb-macos-${platform}-8.0.34.tgz" -o "$archive"
  echo "$checksum  $archive" | shasum -a 256 -c -
  mkdir -p .tools/mongodb
  tar -xzf "$archive" --strip-components=1 -C .tools/mongodb
fi
if ! command -v mongosh >/dev/null; then brew install --force-bottle mongosh; fi
echo 'Prerequisites installed. Select Node 24 in PATH as described in README.md, then npm install && npm run setup:local.'
