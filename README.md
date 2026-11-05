## Table of Contents
- [Installation](#installation)
- [Architecture](#architecture)
- [Places to look](#placesToLook)
- [Consumption](#consumption)
- [Contributing](#contributing)


## Installation

Unity is a Milo bootstrap project.
1. Install the [aem CLI](https://www.npmjs.com/package/@adobe/aem-cli): `sudo npm install -g @adobe/aem-cli`
1. Run `aem up` this repo's folder. (opens your browser at `http://localhost:3000`)
1. Open this repo's folder in your favorite editor and start coding.

## Architecture
Unity UI will be connected to Unity Service for most of the operation. Below are some of the operations by unity service

1. Remove background
1. Change Background
1. Redirect to Acrobat

Apart from this some operations can be performed in client side for better user experience like: image filters, crop, ans resize etc.

[Unity UI architecture](https://wiki.corp.adobe.com/display/adobedotcom/Unity+Architecture)

[Unity Service architecture](https://wiki.corp.adobe.com/display/~shasmish/SAPS+Unity+Service)


## Places to look
All the Unity assets resides at [folder](https://adobe.sharepoint.com/:f:/r/sites/adobecom/Shared%20Documents/unity/unity/assets). This will be accessible from [https://adobe.com/unity/assets](https://adobe.com/unity/assets)


All the Unity configs resides at [folder](https://adobe.sharepoint.com/:f:/r/sites/adobecom/Shared%20Documents/unity/unity/configs). This will be accessible from [https://adobe.com/unity/configs](https://adobe.com/unity/configs)


All the Unity code can be acesses from [https://adobe.com/unity/unitylibs](https://adobe.com/unity/unitylibs)

A specific version of Unity branch can be loaded by passing ```?unitylibs=<branch_name>``` as query paramter.

## Consumption

### Milo consumption
All the Milo consuming projects will get the Unity blocks OOTB.
All though the core Unity functionality resides in this repo, Milo has a light weight unity block whose repsonsibility is to load the unity core functionality. Unity block is not a visual block and works as a metadata block for other blocks(e.g Marquee, Aside) where we need unity features to be enabled.

### Unity with Custom Block
Unity block can be added after any other block to take the effect. We need to pass a target element(selector) where we need unity feature/ 

### Music prompt bar

The Firefly prompt bar supports a `music` verb. Use the existing verb authoring
pattern with `:icon-verb-music:` and a linked feature icon labelled `audio` (or its
localized equivalent). The visible label is independent of the `music` identifier.

Author the following rows in the Unity block:

| Row | Content |
| --- | --- |
| `:icon-placeholder-prompt-label:` | Enter prompt |
| `:icon-placeholder-input:` | Describe the audio you want to generate |
| `:icon-generate:` | Generate icon and localized Generate audio label |
| `:icon-shuffle:` (optional) | Shuffle icon image and localized Shuffle label |
| `:icon-music-prompt:` (repeat for each suggestion) | Plain-text music prompt |
| `:icon-placeholder-character-count-label:` (optional) | Localized Characters label for assistive technology |

Music suggestions come only from the authored rows, not the remote prompt
catalog. The existing `:icon-placeholder-prompt:` and
`:icon-placeholder-suggestions:` rows are not needed for music.
Music reuses the existing prompt-bar action containers: optional Shuffle is
prepended to the left-side actions, while the counter sits beside Generate.
Authored feature and model selectors keep their existing behaviour and placement;
switching features does not move Generate into a separate toolbar.
Keep the usual localized `:icon-error-empty:`, `:icon-error-max-length:` and
`:icon-error-request:` rows, with music's maximum-length message matching the
configured limit.

Music's maximum is defined only by `limits.music-max-char-limit` in the Firefly
target config (currently 500). It must be a positive integer; there is no
hardcoded fallback. The native input maximum, live counter, authored suggestion
validation and submission validation all use this setting. Empty or
overlong authored suggestions are excluded and logged. Shuffle is disabled and
logs a diagnostic when authored without valid suggestions. Each randomized cycle
uses every distinct suggestion before repeating, without an immediate repeat
between cycles when multiple suggestions exist.

Shuffled text can be submitted directly, or edited by clicking into it. A click
at a collapsed caret position of zero clears a still-pending suggestion; after
editing starts, clicks at zero no longer clear the input. Keyboard focus alone
does not clear a suggestion, and typing edits it at the current caret position.
Shuffle replaces the current text. The counter includes pending suggestions.
Existing text is preserved when switching features; text already exceeding the
configured limit must be shortened before music generation.

Generation submits the displayed text as `query` with workflow `text-to-music`,
not as a catalog asset ID. The other features' limits and sound previews are
unchanged.

### IMS guest token
Unity Service depends on IMS guest token for logged out user. So IMS client id should be onboarded with IMS guest token [wiki](https://wiki.corp.adobe.com/pages/viewpage.action?spaceKey=~nzotta&title=Guest+Sessions+-+Identity+components+delivery+schedules%2C+integration+and+testing).


## Contributing

### Submitting PR

1. PR needs at least two approvals.
1. Approvals & changes can come from anyone.
1. Unity Contributors can send PRs from forks.
1. Unity Committers can merge approved PRs into any branch besides stage or main.
1. Unity Admins can merge approved PRs into stage and main.
1. We recommend the following title format for PR:
    ```bash
    MWPW-xxxx - Summarize changes in 50 characters or less
    ```

### Nala E2E UI Testing
-----

#### 1. Running Nala Tests
- Make sure you ran `npm install` in the project root.
- You might need also to run `npx playwright install` to install all playwright browsers
- Nala tests are run using the `npm run nala <env> [options]` command:

```sh
npm run nala <env> [options]
```
```sh
# env: [main | stage | etc ]

# options:
  - browser=<chrome|firefox|webkit>    # Browser to use (default: chrome)
  - device=<desktop|mobile>            # Device (default: desktop)
  - test=<.test.js>                    # Specific test file to run (runs all tests in the file)
  - -g, --g=<@tag>                     # Tag to filter tests by annotations ex: @test1 @accordion @marquee
  - mode=<headless|ui|debug|headed>    # Mode (default: headless)
  - config=<config-file>               # Configuration file (default: Playwright default)
  - project=<project-name>             # Project configuration (default: milo-live-chromium)
  - unitylibs=<local|prod|feature|any|> # Milolibs?=<env> 
```

Examples:
```
npm run nala stage @compress-pdf unitylibs=<feature-branch>  # Run compress-pdf test on DC stage env with unity feature branch.

```

#### 2. Nala Help Command:
To view examples of how to use Nala commands with various options, you can run
```sh
npm run nala help
```

#### ⚠️ Important Note
- **Debug and UI Mode Caution**: When using `debug` or `ui` mode, it is recommended to run only a single test using annotations (e.g., `@test1`). Running multiple tests in these modes (e.g., `npm run nala local mode=debug` or `mode=ui`) will launch a separate browser or debugger window for each test, which can quickly become resource-intensive and challenging to manage.

- **Tip**: To effectively watch or debug, focus on one test at a time to avoid opening excessive browser instances or debugger windows.

#### 3. Nala Documentation
For detailed guides and documentation on Nala, please visit the [Nala GitHub Wiki](https://github.com/adobecom/milo/wiki/Nala#nala-introduction).
