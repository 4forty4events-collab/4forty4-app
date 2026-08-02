# Expo HAS CHANGED

This project is on **Expo SDK 54** (`expo@54.0.36`, `react-native@0.81.5`). `app.json`
does not pin `sdkVersion`, so `package.json` is the source of truth — check it before
trusting this line.

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing
any code. Do not rely on remembered API shapes; Expo changes them between SDKs.

When the SDK is upgraded, update this heading in the same commit.

# Design Bible

`docs/design-bible.md` is the standing reference for how Purday is built — product
philosophy, trust rules, motion, type, colour, tokens, accessibility, privacy,
performance. Read it before designing or building any feature, and check the
"Definition of done" in §18 before calling one finished.

The rule it exists to protect: **nothing displayed may be fabricated.** No invented
progression currencies, no progress steps describing work the system isn't doing, no
stat that isn't derived from a real row. If a request would require inventing one, say
so and propose the honest version.
