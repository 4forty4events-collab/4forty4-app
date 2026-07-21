// Standard Expo Metro config. Kept explicit so the transformer/resolver defaults are
// pinned to Expo's (avoids surprises if a tool expects the file to exist).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// This machine has 4 cores / 8GB. Metro defaults to (cores - 1) transform workers,
// each a separate Node process with its own heap — on 8GB that competes with the
// bundler's own heap and is a big part of why it OOMs. Two workers still parallelise
// the transform step but leave real headroom. Raise this on a bigger machine, or
// override per-run with `expo start --max-workers <n>`.
config.maxWorkers = 2;

module.exports = config;
