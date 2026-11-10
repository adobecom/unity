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

### Photoshop file uploads
The Photoshop `workflow-upload` supports JPEG, JPG, PNG, and PSD for both file-picker and drag-and-drop uploads. Its [target configuration](unitylibs/core/workflow/workflow-upload/target-config.json) allows one file per upload, up to 8,000 pixels in each dimension.

- JPEG/JPG/PNG: up to 40,000,000 bytes (40 MB).
- PSD: up to 1,000,000,000 bytes (1 GB), using `maxFileSizeByType` to override the default size limit for `image/vnd.adobe.photoshop`.

PSD extensions are recognized case-insensitively and normalized to the Photoshop MIME type. Header validation rejects invalid PSD headers and PSB documents; the original document bytes are uploaded without flattening or converting layers. This is header validation, not full-document decoding.

Photoshop PSD multipart uploads use a [bounded scheduler](unitylibs/utils/executeInBatches.js): 10 concurrent chunks on devices reporting at least four logical cores (or no core count), and 6 on smaller devices. Each chunk has up to four attempts with 1/2/4-second backoff for HTTP 429/5xx, network errors, and a working 60-second per-attempt timeout. Permanent failure cancels outstanding chunks and stops queued work. Slow connections may exceed this timeout even while transferring data. Other formats/products, single-PUT fallback, finalization, and progress behavior are unchanged.

Unity sets the consuming upload block's file-picker filter, including `.psd`; no da-cc upload-block JavaScript change is required. Authored format guidance and error messages must reflect the separate PSD and JPEG/PNG size limits.

Before rollout, verify that Unity asset creation, finalization/safety scanning, and the Photoshop connector support PSD documents up to these limits and preserve layers through app handoff. Frontend support alone does not establish backend compatibility.

See [PSD upload support](PSD_UPLOAD_SUPPORT.md) for the implementation summary, validation results, pending rollout work, and remaining upload limitations.

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
