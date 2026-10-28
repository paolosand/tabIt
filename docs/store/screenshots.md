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

It crops the top 110 px and resizes to 1280x800 with `sips`. Check the result with `sips -g pixelWidth -g pixelHeight out.png`. If the source is not 1280:800 after the crop, the result is stretched slightly; capture at a window size of 1280x910 for an exact fit.
