# Store screenshots

- Required: at least 1, up to 5, each exactly 1280x800 PNG (a 640x400 size is also accepted by the Store). Source: Chrome Web Store dashboard listing docs.
- Own footage only: capture YouTube videos you have the right to show (your own recordings, or your own demo). Do not use other people's artwork or thumbnails in a way that implies endorsement.
- Do not include the YouTube header (search bar, account menu). Crop it out.
- Do not describe or mock up visual design that is not in the shipped build.
- No images are committed to the repository.

Workflow: take a full-window screenshot in Chrome (window about 1280 px wide), then run

```sh
packaging/store/crop-screenshot.sh in.png out.png
```

It removes the top 110 px (the YouTube header), then crops the rest to 16:10 without stretching: full width and the top of the picture if tall enough, otherwise a centred crop of the width. It then resizes to exactly 1280x800. (One bottom pixel is dropped to work around a `sips` quirk.) It refuses to overwrite the input. Check the result with `sips -g pixelWidth -g pixelHeight out.png`.
