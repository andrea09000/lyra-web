# Lyra

## What it is
Lyra is a mobile-first music PWA: search and play YouTube music in the browser, keep going with the screen off, save playlists and tastes on device.

## Who it is for
People who want Spotify-like listening without installing a native store app — mostly on phone, often with headphones, often late.

## Primary job
Tap a song → sound starts immediately. Everything else (library, import, settings) supports that.

## Constraints
- Expo / React Native Web (not Next, not Tailwind)
- Audio via HTML5 + scrape proxies; offline file downloads are soft-cache only on web
- Italian UI copy

## Brand commitments
- Name: **Lyra** (lyre strings under tension — see `constants/appNames.ts` for rename shortlist)
- Look: charcoal + acid lime, Unbounded + Sora — taut, not soft blue glass
- Do not impersonate Spotify chrome 1:1; feel like a listening companion, not a dashboard
