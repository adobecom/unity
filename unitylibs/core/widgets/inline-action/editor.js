import { createTag, loadStyle, getUnityLibs, getUnityPromptConfigsBaseUrl } from '../../../scripts/utils.js';

const MIN_PCT = 10;
const IDLE_MS = 5000;
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const HANDLE_EDGES = {
  nw: ['left', 'top'],
  n: ['top'],
  ne: ['right', 'top'],
  e: ['right'],
  se: ['right', 'bottom'],
  s: ['bottom'],
  sw: ['left', 'bottom'],
  w: ['left'],
};

const clamp = (val, min, max) => Math.min(max, Math.max(min, val));
export const zoomScale = (zoom) => 1 + (zoom / 100);

// Aspect-ratio presets (crop pills, resize Standard/Social) are authored the same way
// as model-picker.json: one flat sheet with a `module` column (crop/resize), fetched
// once and filtered client-side to this page's own operation — see createModelMap()
// in prompt-bar-style.js for the same module-column convention. `group` buckets each
// row (crop's inline pills vs. its "More" overflow; resize's Custom/Standard/Social
// tabs); `platform` only applies to Social rows. `name` is NOT unique across the whole
// sheet (e.g. "Landscape" repeats under Standard, Instagram and Youtube with different
// values each time), so it must never be used alone as a lookup/identity key.
async function loadAspectRatios(operation) {
  try {
    const url = `${getUnityPromptConfigsBaseUrl()}/unity/configs/prompt/cropandresize.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch aspect ratios: ${res.status}`);
    const { content } = await res.json();
    const rows = content?.data;
    return Array.isArray(rows) ? rows.filter((row) => row.module === operation) : [];
  } catch (e) {
    window.lana?.log(`Message: Error loading aspect ratios, Error: ${e}`);
    return [];
  }
}

function parseRatioString(ratio) {
  const [w, h] = ratio.split(':').map(Number);
  return h ? w / h : null;
}

// Standard/crop rows carry a ratio; Social rows carry literal pixel targets instead
// (used as-is for the real resize output, not just a display ratio) — derive a
// numeric ratio from whichever is present. Bare trigger rows (Freeform, Custom) have
// neither and resolve to null (freeform).
function aspectRatioValue(row) {
  if (row.ratio) return parseRatioString(row.ratio);
  if (row.width && row.height) return row.width / row.height;
  return null;
}

// Matches the two label formats already confirmed in design: "{name} {ratio}" for
// ratio-only rows (crop pills, Standard), "{name} {width} x {height}" for Social's
// pixel targets. `suppressName` is used for crop's "More" overflow rows, whose shared
// `name` is the dropdown trigger's own label, not each individual option's — pass it
// there so an option reads "4:3", not "{localized More} 4:3".
function composeAspectLabel(row, suppressName = false) {
  const name = suppressName ? '' : (row.name || row.group || '');
  if (row.width && row.height) return `${name} ${row.width} x ${row.height}`.trim();
  if (row.ratio) return `${name} ${row.ratio}`.trim();
  return name;
}

// `name` is localized, so it can't be compared against a literal "More" — instead, the
// overflow bucket is whichever `name` value repeats across more than one row (every
// standalone pill's name is unique; only the overflow rows share one, translated,
// value). That shared value is also the dropdown trigger's own label — read from the
// sheet, never hardcoded — see buildCropAspectSection.
function groupCropRows(rows) {
  const counts = new Map();
  rows.forEach((r) => counts.set(r.name, (counts.get(r.name) || 0) + 1));
  return {
    pillRows: rows.filter((r) => counts.get(r.name) === 1),
    moreRows: rows.filter((r) => counts.get(r.name) > 1),
  };
}

// `group` is localized (it's resize's Custom/Standard/Social tab label, shown as-is),
// so a row's kind can't be inferred by comparing `group` to a literal English string —
// instead it's inferred from which structural (non-localized) columns are populated:
// Social rows carry a `platform`; Standard rows carry a `ratio` but no `platform`;
// Custom carries neither (just the bare trigger, no preset data at all).
function resizeRowKind(row) {
  if (row.platform) return 'social';
  if (row.ratio) return 'standard';
  return 'custom';
}

// Buckets resize rows by their (localized) `group` value — rows sharing an identical
// group belong to the same tab, and that value is the tab's own displayed label.
// Bucket order follows first-appearance in the authored rows.
function groupResizeRows(rows) {
  const buckets = [];
  const byGroup = new Map();
  rows.forEach((row) => {
    if (!byGroup.has(row.group)) {
      const bucket = { group: row.group, kind: resizeRowKind(row), rows: [] };
      byGroup.set(row.group, bucket);
      buckets.push(bucket);
    }
    byGroup.get(row.group).rows.push(row);
  });
  return buckets;
}

// Pixel-space stays the single source of truth for the actual rect/frame math — units
// only matter for how the Custom fields are typed into and displayed. 300px = 1in
// (300 DPI, the standard print-resolution basis); cm/mm are derived from that.
const UNIT_OPTIONS = ['px', 'in', 'cm', 'mm'];
const DPI = 300;
const PX_PER_UNIT = { px: 1, in: DPI, cm: DPI / 2.54, mm: DPI / 25.4 };
const unitToPx = (value, unit) => value * PX_PER_UNIT[unit];
const pxToUnit = (px, unit) => {
  const value = px / PX_PER_UNIT[unit];
  return unit === 'px' ? Math.round(value) : Math.round(value * 100) / 100;
};

export function containBox(naturalW, naturalH, viewportW, viewportH) {
  const cs = Math.min(viewportW / naturalW, viewportH / naturalH);
  return { cs, w: naturalW * cs, h: naturalH * cs };
}

export function centeredRect(ratio, naturalW, naturalH, viewportW, viewportH) {
  const effectiveRatio = ratio || (naturalW / naturalH);
  const { w: boxW, h: boxH } = containBox(naturalW, naturalH, viewportW, viewportH);
  let fitW = boxW;
  let fitH = boxW / effectiveRatio;
  if (fitH > boxH) {
    fitH = boxH;
    fitW = boxH * effectiveRatio;
  }
  const offsetX = (viewportW - boxW) / 2;
  const offsetY = (viewportH - boxH) / 2;
  const x = offsetX + ((boxW - fitW) / 2);
  const y = offsetY + ((boxH - fitH) / 2);
  return {
    x: (x / viewportW) * 100,
    y: (y / viewportH) * 100,
    w: (fitW / viewportW) * 100,
    h: (fitH / viewportH) * 100,
  };
}

// Resize's frame comes from an explicit width/height (px) rather than a ratio — at
// natural size the frame exactly hugs the displayed image (iw/ih below); growing past
// natural size grows the frame toward the full container, per the same object-contain
// fraction the image itself is displayed at.
// `anchorRect`, if given, keeps the new box centered on wherever that rect's own
// center currently is (e.g. the box the user last dragged to) instead of recentering
// in the viewport — clamped so a larger new size can't push it out of bounds.
// Omitting it (viewport-center) is only meaningful before any selection exists.
export function frameFromDimensions(width, height, naturalW, naturalH, viewportW, viewportH, anchorRect = null) {
  const { cs } = containBox(naturalW, naturalH, viewportW, viewportH);
  const iw = (naturalW * cs) / viewportW;
  const ih = (naturalH * cs) / viewportH;
  const wPct = clamp((width / naturalW) * iw * 100, MIN_PCT, 100);
  const hPct = clamp((height / naturalH) * ih * 100, MIN_PCT, 100);
  const centerX = anchorRect ? anchorRect.x + (anchorRect.w / 2) : 50;
  const centerY = anchorRect ? anchorRect.y + (anchorRect.h / 2) : 50;
  return {
    x: clamp(centerX - (wPct / 2), 0, 100 - wPct),
    y: clamp(centerY - (hPct / 2), 0, 100 - hPct),
    w: wPct,
    h: hPct,
  };
}

function edgeDelta(movesNeg, movesPos, delta) {
  if (movesNeg) return -delta;
  if (movesPos) return delta;
  return 0;
}

// Resizes from a fixed anchor (the corner/edge opposite whichever the handle drags).
// When ratioLock is set, viewport-bounds overflow is resolved by scaling BOTH
// dimensions down together (from whichever axis is more constrained), so the ratio
// stays exact even when a side hits the viewport edge — clamping w/h independently
// would otherwise silently break the locked ratio right at the boundary.
export function resizeRect(base, handle, dxPct, dyPct, ratioLock) {
  const edges = HANDLE_EDGES[handle] || [];
  const movesLeft = edges.includes('left');
  const movesRight = edges.includes('right');
  const movesTop = edges.includes('top');
  const movesBottom = edges.includes('bottom');

  const anchorX = movesLeft ? base.x + base.w : base.x;
  const anchorY = movesTop ? base.y + base.h : base.y;

  let newW = Math.max(base.w + edgeDelta(movesLeft, movesRight, dxPct), MIN_PCT);
  let newH = Math.max(base.h + edgeDelta(movesTop, movesBottom, dyPct), MIN_PCT);

  if (ratioLock) {
    if (movesLeft || movesRight) newH = newW / ratioLock;
    else if (movesTop || movesBottom) newW = newH * ratioLock;
  }

  const maxW = movesLeft ? anchorX : 100 - anchorX;
  const maxH = movesTop ? anchorY : 100 - anchorY;
  if (newW > maxW || newH > maxH) {
    if (ratioLock) {
      const scale = Math.min(maxW / newW, maxH / newH);
      newW *= scale;
      newH *= scale;
    } else {
      newW = Math.min(newW, maxW);
      newH = Math.min(newH, maxH);
    }
  }
  newW = Math.max(newW, MIN_PCT);
  newH = Math.max(newH, MIN_PCT);

  const left = movesLeft ? anchorX - newW : anchorX;
  const top = movesTop ? anchorY - newH : anchorY;
  return {
    x: clamp(left, 0, 100 - newW),
    y: clamp(top, 0, 100 - newH),
    w: newW,
    h: newH,
  };
}

// Converts the frame's viewport-% rect into source-image pixel bounds — this is what
// actually feeds edits.document.crop.bounds. Folds in zoom: the image is scaled around
// the viewport's own center (transform-origin: center) while the frame stays fixed in
// viewport-space, so a zoomed-in image maps a fixed on-screen frame to a smaller,
// centered source region. Un-scaling each edge around the viewport center before the
// existing offset/cs conversion recovers that region exactly (zoom=0 reduces to the
// original unscaled math). Rotation isn't in scope right now (removed — see
// crop-rotation-and-quality.md), so it isn't folded in here.
export function rectPctToSourceBounds(rect, naturalW, naturalH, viewportW, viewportH, zoom = 0) {
  const { cs, w: dispW, h: dispH } = containBox(naturalW, naturalH, viewportW, viewportH);
  const offsetX = (viewportW - dispW) / 2;
  const offsetY = (viewportH - dispH) / 2;
  const scale = zoomScale(zoom);
  const unscale = (px, size) => (size / 2) + ((px - (size / 2)) / scale);

  const leftPx = unscale((rect.x / 100) * viewportW, viewportW);
  const topPx = unscale((rect.y / 100) * viewportH, viewportH);
  const rightPx = unscale(((rect.x + rect.w) / 100) * viewportW, viewportW);
  const bottomPx = unscale(((rect.y + rect.h) / 100) * viewportH, viewportH);

  const left = clamp(Math.round((leftPx - offsetX) / cs), 0, naturalW);
  const top = clamp(Math.round((topPx - offsetY) / cs), 0, naturalH);
  const right = clamp(Math.round((rightPx - offsetX) / cs), left, naturalW);
  const bottom = clamp(Math.round((bottomPx - offsetY) / cs), top, naturalH);
  return { left, top, right, bottom };
}

function buildFrame() {
  const frame = createTag('div', { class: 'ia-frame' });
  ['v1', 'v2', 'h1', 'h2'].forEach((k) => frame.append(createTag('div', { class: `ia-grid ia-grid--${k}` })));
  HANDLES.forEach((h) => frame.append(createTag('div', {
    class: `ia-handle ia-handle--${h}`,
    'data-handle': h,
    tabindex: '0',
    role: 'presentation',
  })));
  return frame;
}

// Only 'zoom' and 'quality' are functionally wired (EditorEngine has real state and
// slider behavior for exactly those two) — an authored icon-placeholder-slider-* with
// any other suffix renders a real toggle button, but clicking it and moving the slider
// won't actually change anything, since there's no matching state field to write to.
const KNOWN_SLIDER_MODES = new Set(['zoom', 'quality']);

// Icon-only until this button becomes the active mode, at which point its label
// appears beside the icon (see .ia-toggle-label / .is-active in editor.css) — the
// active button is whichever one setMode() last marked, same mechanism already used
// elsewhere in this file, no extra state needed here.
function buildToggleButton(mode, label, iconHref, isActive) {
  const btn = createTag('button', {
    type: 'button',
    class: `ia-toggle__btn${isActive ? ' is-active' : ''}`,
    'data-mode': mode,
    'aria-label': label,
  });
  if (iconHref) btn.append(createTag('img', { src: iconHref, alt: '', loading: 'lazy', class: 'ia-btn-icon' }));
  btn.append(createTag('span', { class: 'ia-toggle-label' }, label));
  return btn;
}

// Only called when parsedData.sliderModes is non-empty (see buildEditorStage) — no
// fallback to hardcoded modes: an unauthored page simply gets no adjust bar at all.
function buildAdjustBar(parsedData) {
  const bar = createTag('div', { class: 'ia-adjust-bar' });
  const toggle = createTag('div', { class: 'ia-toggle' });
  const { sliderModes } = parsedData;
  sliderModes.forEach(({ mode, label, iconHref }, i) => toggle.append(buildToggleButton(mode, label, iconHref, i === 0)));
  const startMode = sliderModes[0]?.mode;
  const slider = createTag('input', {
    type: 'range',
    class: 'ia-slider',
    autocomplete: 'off',
    min: '0',
    max: '100',
    // Just the first paint's placeholder — EditorEngine's constructor immediately
    // overwrites this via setMode() once real state (this.zoom/this.quality) exists.
    value: startMode === 'quality' ? '100' : '0',
  });
  const val = createTag('span', { class: 'ia-val' }, startMode === 'quality' ? '100%' : '0%');
  bar.append(toggle, slider, val);
  return bar;
}

export function buildEditorStage(parsedData) {
  const stage = createTag('div', { class: 'ia-editor-stage' });
  const viewport = createTag('div', { class: 'ia-viewport' });
  const blurImg = createTag('img', { class: 'ia-img', alt: '', draggable: 'false' });
  const sharpImg = createTag('img', { class: 'ia-img', alt: '', draggable: 'false' });
  viewport.append(
    createTag('div', { class: 'ia-imglayer ia-imglayer--blur' }, blurImg),
    createTag('div', { class: 'ia-imglayer ia-imglayer--sharp' }, sharpImg),
    buildFrame(),
  );
  stage.append(viewport);
  // No icon-placeholder-slider-* authored at all — no adjust bar, not a fallback one.
  if (parsedData.sliderModes.length) stage.append(buildAdjustBar(parsedData));
  return stage;
}

// Shared by every authored icon+label button/pill (reset, reupload, the two CTAs,
// each NBA pill) — iconHref is optional (undefined when not authored), so this works
// identically whether or not a given row actually has an icon.
function buildIconButton(tag, attrs, iconHref, label) {
  const el = createTag(tag, attrs);
  if (iconHref) el.append(createTag('img', { src: iconHref, alt: '', loading: 'lazy', class: 'ia-btn-icon' }));
  el.append(createTag('span', {}, label));
  return el;
}

// Shared by every dropdown menu (crop's More, resize's Social, the unit picker) — an
// explicit close affordance inside the menu itself, in addition to the existing
// outside-click handling in each bind*Events method. Click binding happens there too
// (not here), since this is a pure DOM builder with no EditorEngine instance yet.
function buildDropdownCloseButton() {
  return createTag('button', { type: 'button', class: 'ia-dropdown-close', 'aria-label': 'Close' }, '×');
}

// Takes the row directly (rather than pre-extracted fields) so it can stamp both the
// composed display label AND the row's raw, authored ratio string onto the pill as two
// separate attributes — `data-label` (shown in the UI, e.g. "Square 1:1") is NOT the
// same thing as `data-ratio-text` (the clean ratio identity, e.g. "1:1", that the
// EditInFirefly contract's cropAspectRatioLock wants). Only rows with a literal
// `ratio` column (crop pills, Standard) get data-ratio-text; Social rows carry
// width/height instead — stamped on when present so selecting one can set the resize
// output to those exact authored pixels, rather than recomputing an approximation from
// the crop rect (which would round to whatever the frame's own pixel math produces,
// not necessarily the literal "1080x1920" the row promised).
function buildAspectPill(row, isActive = false) {
  const label = composeAspectLabel(row);
  const attrs = {
    type: 'button',
    class: `ia-aspect-pill${isActive ? ' is-active' : ''}`,
    'data-ratio': aspectRatioValue(row) ?? '',
    'data-label': label,
  };
  if (row.ratio) attrs['data-ratio-text'] = row.ratio;
  if (row.width && row.height) {
    attrs['data-width'] = row.width;
    attrs['data-height'] = row.height;
  }
  return buildIconButton('button', attrs, row.icon, label);
}

// downloadLabel/editLabel come from the authored config list (the same icon-download/
// icon-aiPhotoEditor rows rbg's buildResultSection/buildEditInFireflyButton read) —
// undefined when not authored, so falls back to the crop/resize-specific defaults
// below rather than rbg's generic "Download"/"Edit in Firefly" wording.
function buildCtaRow(isCrop, parsedData) {
  const row = createTag('div', { class: 'ia-cta-row' });
  const downloadLabel = parsedData.downloadLabel || (isCrop ? 'Crop and download' : 'Resize and download');
  const editLabel = parsedData.editLabel || 'Open in Firefly';
  row.append(
    buildIconButton('button', { type: 'button', class: 'ia-cta-accent' }, parsedData.downloadIconHref, downloadLabel),
    buildIconButton('button', { type: 'button', class: 'ia-cta-outline' }, parsedData.editIconHref, editLabel),
  );
  return row;
}

// No fallback to hardcoded pills — an unauthored crop page (aspectRows empty) simply
// gets an empty aspect row, same "authored or nothing" rule already applied to the
// adjust bar's slider modes.
function buildCropAspectSection(parsedData) {
  const section = createTag('div', { class: 'ia-aspect-section' });
  section.append(createTag('p', { class: 'ia-aspect-heading' }, parsedData.aspectRatioLabel || 'Aspect ratio'));
  const row = createTag('div', { class: 'ia-aspect-row' });
  const { pillRows, moreRows } = groupCropRows(parsedData.aspectRows || []);
  pillRows.forEach((r, i) => row.append(buildAspectPill(r, i === 0)));
  if (moreRows.length) {
    const more = createTag('div', { class: 'ia-more' });
    const moreMenu = createTag('div', { class: 'ia-more-menu hide' });
    moreMenu.append(buildDropdownCloseButton());
    moreRows.forEach((r) => {
      const label = composeAspectLabel(r, true);
      moreMenu.append(buildIconButton('button', {
        type: 'button',
        class: 'ia-more-opt',
        'data-ratio': aspectRatioValue(r) ?? '',
        'data-label': label,
        ...(r.ratio && { 'data-ratio-text': r.ratio }),
      }, r.icon, label));
    });
    // moreRows share one repeated, localized `name` (see groupCropRows) — that's the
    // dropdown trigger's own default label, never a hardcoded "More".
    const moreTrigger = createTag('button', {
      type: 'button',
      class: 'ia-aspect-pill ia-more-trigger',
      'aria-haspopup': 'true',
      'aria-expanded': 'false',
    }, moreRows[0].name);
    more.append(moreTrigger, moreMenu);
    row.append(more);
  }
  section.append(row, buildCtaRow(true, parsedData));
  return section;
}

function buildDimensionField(labelText, className) {
  const field = createTag('div', { class: 'ia-dim-field' });
  field.append(
    createTag('label', { class: 'ia-dim-label' }, labelText),
    createTag('input', { type: 'number', class: className, min: '0', step: 'any', inputmode: 'decimal' }),
  );
  return field;
}

// Same dropdown pattern as Crop's More / Resize's Social — a plain trigger + option
// list, distinct classes so it doesn't get picked up by that unrelated wiring.
function buildUnitPicker() {
  const wrap = createTag('div', { class: 'ia-more' });
  const menu = createTag('div', { class: 'ia-unit-menu hide' });
  menu.append(buildDropdownCloseButton());
  UNIT_OPTIONS.forEach((unit) => {
    menu.append(createTag('button', { type: 'button', class: 'ia-unit-opt', 'data-unit': unit }, unit));
  });
  const trigger = createTag('button', {
    type: 'button',
    class: 'ia-dim-unit ia-unit-trigger',
    'data-unit': 'px',
    'aria-haspopup': 'true',
    'aria-expanded': 'false',
  });
  trigger.append(
    createTag('span', { class: 'ia-unit-label' }, 'px'),
    createTag('span', { class: 'ia-unit-chevron', 'aria-hidden': 'true' }, '⌄'),
  );
  wrap.append(trigger, menu);
  return wrap;
}

function buildCustomDetail(parsedData) {
  const detail = createTag('div', { class: 'ia-resize-detail-panel', 'data-tab': 'custom' });
  const fields = createTag('div', { class: 'ia-dim-fields' });
  fields.append(
    buildDimensionField(parsedData.widthLabel || 'Width', 'ia-width-input'),
    createTag('button', { type: 'button', class: 'ia-dim-lock is-active', 'aria-label': 'Lock aspect ratio', 'aria-pressed': 'true' }, '🔒'),
    buildDimensionField(parsedData.heightLabel || 'Height', 'ia-height-input'),
    buildUnitPicker(),
  );
  detail.append(fields);
  return detail;
}

function buildStandardDetail(standardRows) {
  const detail = createTag('div', { class: 'ia-resize-detail-panel hide', 'data-tab': 'standard' });
  const grid = createTag('div', { class: 'ia-aspect-row' });
  standardRows.forEach((r) => grid.append(buildAspectPill(r)));
  detail.append(grid);
  return detail;
}

// Social's detail is just the per-platform ratio grids — the platform picker itself
// lives in the pill row (see buildResizeAspectSection), same as Crop's More trigger.
// Platform order follows first-appearance in the authored rows, not alphabetical.
function buildSocialDetail(socialRows, platforms) {
  const detail = createTag('div', { class: 'ia-resize-detail-panel hide', 'data-tab': 'social' });
  const grids = createTag('div', { class: 'ia-social-grids' });
  platforms.forEach((platform) => {
    const grid = createTag('div', { class: 'ia-aspect-row ia-social-grid hide', 'data-platform': platform });
    socialRows
      .filter((r) => r.platform === platform)
      .forEach((r) => grid.append(buildAspectPill(r)));
    grids.append(grid);
  });
  detail.append(grids);
  return detail;
}

// Custom is always available (typing width/height doesn't depend on authoring).
// Standard/Social only render at all if the sheet actually authored rows for them —
// same "authored or nothing" rule as the adjust bar and crop's pills — so an
// unauthored resize page falls back to Custom-only rather than showing an empty tab.
function buildResizeAspectSection(parsedData) {
  const section = createTag('div', { class: 'ia-aspect-section' });
  section.append(createTag('p', { class: 'ia-aspect-heading' }, parsedData.aspectRatioLabel || 'Aspect ratio'));
  const row = createTag('div', { class: 'ia-aspect-row' });
  const buckets = groupResizeRows(parsedData.aspectRows || []);
  const customBucket = buckets.find((b) => b.kind === 'custom');
  const standardBucket = buckets.find((b) => b.kind === 'standard');
  const socialBucket = buckets.find((b) => b.kind === 'social');
  // platform is NOT localized (brand names are stable across locales), so it's used
  // directly as both the grid key and the dropdown option's own display text.
  const platforms = socialBucket ? [...new Set(socialBucket.rows.map((r) => r.platform))] : [];
  // These are deliberately NOT .ia-aspect-pill — that class is reserved for actual
  // ratio-selecting pills (Standard's presets, Social's per-platform grids), which
  // already go through bindAspectEvents()/selectAspect(). Custom/Standard/Social
  // switch tabs or open a dropdown instead, so they get their own class + CSS that
  // matches .ia-aspect-pill visually without being picked up by that generic wiring.
  // Each tab's label is its bucket's own (localized) `group` value — Custom falls back
  // to the English default only when truly unauthored, same as every other label here.
  row.append(createTag('button', {
    type: 'button',
    class: 'ia-resize-tab is-active',
    'data-tab': 'custom',
  }, customBucket?.group || 'Custom'));
  if (standardBucket) {
    row.append(createTag('button', { type: 'button', class: 'ia-resize-tab', 'data-tab': 'standard' }, standardBucket.group));
  }
  if (socialBucket) {
    const social = createTag('div', { class: 'ia-more' });
    const socialMenu = createTag('div', { class: 'ia-social-menu hide' });
    socialMenu.append(buildDropdownCloseButton());
    platforms.forEach((platform) => {
      socialMenu.append(createTag('button', { type: 'button', class: 'ia-social-opt', 'data-platform': platform }, platform));
    });
    const socialTrigger = createTag('button', {
      type: 'button',
      class: 'ia-resize-tab ia-social-trigger',
      'data-tab': 'social',
      'aria-haspopup': 'true',
      'aria-expanded': 'false',
    }, socialBucket.group);
    social.append(socialTrigger, socialMenu);
    row.append(social);
  }
  const originalSizeLabel = parsedData.originalSizeLabel || 'Original size';
  const newSizeLabel = parsedData.newSizeLabel || 'New size';
  const readout = createTag('p', { class: 'ia-size-readout' }, `${originalSizeLabel}: -- ${newSizeLabel}: --`);
  const details = [buildCustomDetail(parsedData)];
  if (standardBucket) details.push(buildStandardDetail(standardBucket.rows));
  if (socialBucket) details.push(buildSocialDetail(socialBucket.rows, platforms));
  section.append(row, ...details, readout, buildCtaRow(false, parsedData));
  return section;
}

// Crop/Resize's "take it further" pills come from the same authored NBA rows rbg's
// cards use (icon-nba-* rows), just read via parsedData.nbaPills — the simpler
// icon+label shape, not rbg's image-card shape (see parseInlineAuthoring). One page
// only ever authors one operation, so there's no separate crop-vs-resize content to
// pick between here — whatever's authored applies to this page's operation directly.
function buildFurtherSection(parsedData) {
  const section = createTag('div', { class: 'ia-further-section' });
  section.append(createTag('p', { class: 'ia-further-heading' }, parsedData.nbaHeading || 'Take your image further'));
  const grid = createTag('div', { class: 'ia-further-grid' });
  parsedData.nbaPills.forEach(({ nba, label, iconHref }) => {
    grid.append(buildIconButton('button', { type: 'button', class: 'ia-further-pill', 'data-nba': nba }, iconHref, label));
  });
  section.append(grid);
  return section;
}

export function buildEditorPanel(parsedData) {
  const isCrop = parsedData.operation === 'crop';
  const panel = createTag('div', { class: 'ia-editor-panel' });
  const header = createTag('div', { class: 'ia-editor-header' });
  const actions = createTag('div', { class: 'ia-editor-header-actions' });
  actions.append(buildIconButton(
    'button',
    { type: 'button', class: 'ia-editor-reset' },
    parsedData.resetIconHref,
    parsedData.resetLabel || 'Reset',
  ));
  if (!isCrop) {
    actions.append(createTag('button', {
      type: 'button',
      class: 'ia-editor-quality',
      'aria-pressed': 'false',
    }, 'Quality'));
  }
  actions.append(buildIconButton(
    'button',
    {
      type: 'button',
      class: 'ia-editor-reupload ia-reupload-btn',
      'aria-label': parsedData.reuploadLabel || 'Upload another image',
    },
    parsedData.reuploadIconHref,
    parsedData.reuploadLabel || 'Upload',
  ));
  header.append(
    createTag('span', { class: 'ia-editor-title' }, parsedData.editorTitle || (isCrop ? 'Crop your image' : 'Resize your image')),
    actions,
  );
  panel.append(header);
  const aspectSection = isCrop ? buildCropAspectSection(parsedData) : buildResizeAspectSection(parsedData);
  panel.append(aspectSection, buildFurtherSection(parsedData));
  return panel;
}

export class EditorEngine {
  constructor(stageEl, panelEl, parsedData) {
    this.isCrop = parsedData.operation === 'crop';
    this.viewport = stageEl.querySelector('.ia-viewport');
    this.blurImg = stageEl.querySelector('.ia-imglayer--blur .ia-img');
    // clip-path lives on this wrapper, not on sharpImg itself — see render()'s comment.
    this.sharpLayer = stageEl.querySelector('.ia-imglayer--sharp');
    this.sharpImg = this.sharpLayer.querySelector('.ia-img');
    this.frame = stageEl.querySelector('.ia-frame');
    this.slider = stageEl.querySelector('.ia-slider');
    this.valEl = stageEl.querySelector('.ia-val');
    this.toggleBtns = [...stageEl.querySelectorAll('.ia-toggle__btn')];
    this.panel = panelEl;
    this.resetBtn = panelEl.querySelector('.ia-editor-reset');
    this.qualityBtn = panelEl.querySelector('.ia-editor-quality');
    this.qualityPreviewActive = false;
    this.qualityPreviewUrl = null;
    this.originalUrl = '';
    this.sourceImg = null;
    this.aspectPills = [...panelEl.querySelectorAll('.ia-aspect-pill')];
    this.moreTrigger = panelEl.querySelector('.ia-more-trigger');
    this.moreMenu = panelEl.querySelector('.ia-more-menu');
    // .ia-more is reused by resize's Social/unit-picker wrappers too (see buildUnitPicker/
    // buildResizeAspectSection), so this must be derived from the specific trigger via
    // closest(), never a fresh panel-wide querySelector('.ia-more') — that would be
    // ambiguous whenever more than one such wrapper exists in the same panel.
    this.moreWrap = this.moreTrigger?.closest('.ia-more');
    // First authored, real ratio-selecting pill (never the More trigger itself) — used
    // by reset() so crop always returns to whatever the sheet's own first row was,
    // instead of assuming a hardcoded "Freeform" pill exists.
    const firstPill = this.aspectPills.find((p) => p !== this.moreTrigger);
    this.defaultAspectRatio = firstPill?.dataset.ratio ? Number(firstPill.dataset.ratio) : null;
    this.defaultAspectLabel = firstPill?.dataset.label || 'Freeform';
    // The clean, authored ratio string (e.g. "16:9") — distinct from defaultAspectLabel
    // above, which is the composed DISPLAY text (e.g. "Landscape 16:9"). This is what
    // the EditInFirefly contract's cropAspectRatioLock actually wants; null when the
    // default pill has no literal ratio column (Freeform, or a Social preset).
    this.defaultAspectRatioText = firstPill?.dataset.ratioText || null;
    // Captured once, at build time, before any click can overwrite it — the sheet's own
    // (localized) label, never a hardcoded "More" (see groupCropRows/buildCropAspectSection).
    this.moreDefaultLabel = this.moreTrigger?.textContent || 'More';
    this.resizeTabs = [...panelEl.querySelectorAll('.ia-resize-tab')];
    this.resizeDetails = [...panelEl.querySelectorAll('.ia-resize-detail-panel')];
    this.widthInput = panelEl.querySelector('.ia-width-input');
    this.heightInput = panelEl.querySelector('.ia-height-input');
    this.lockBtn = panelEl.querySelector('.ia-dim-lock');
    this.unitTrigger = panelEl.querySelector('.ia-unit-trigger');
    this.unitLabel = panelEl.querySelector('.ia-unit-label');
    this.unitMenu = panelEl.querySelector('.ia-unit-menu');
    this.unitWrap = this.unitTrigger?.closest('.ia-more');
    this.unit = 'px';
    this.socialTrigger = panelEl.querySelector('.ia-social-trigger');
    // Same as moreDefaultLabel above — the bucket's own (localized) group value, not a
    // hardcoded "Social".
    this.socialDefaultLabel = this.socialTrigger?.textContent || 'Social';
    this.socialMenu = panelEl.querySelector('.ia-social-menu');
    this.socialWrap = this.socialTrigger?.closest('.ia-more');
    this.socialGrids = [...panelEl.querySelectorAll('.ia-social-grid')];
    this.sizeReadout = panelEl.querySelector('.ia-size-readout');
    // Same fallback pattern as the readout's initial text in buildResizeAspectSection —
    // duplicated rather than shared, since that's a standalone builder function with no
    // access to `this`, and this is the only other place these labels are needed.
    this.originalSizeLabel = parsedData.originalSizeLabel || 'Original size';
    this.newSizeLabel = parsedData.newSizeLabel || 'New size';
    this.originalSize = 0;
    this.sizeReadoutTimer = null;
    this.sizeReadoutSeq = 0;
    this.hasInteracted = false;
    this.locked = true;
    this.resizeTab = 'custom';
    this.rect = {
      x: 0,
      y: 0,
      w: 100,
      h: 100,
    };
    this.naturalW = 0;
    this.naturalH = 0;
    // Custom tab's independent output size — decoupled from `rect` while locked (see
    // onDimensionCommit/startDrag). Only collapses back into `rect` when unlocked.
    this.targetW = 0;
    this.targetH = 0;
    this.selectedRatio = null;
    // selectedRatioLabel is the composed DISPLAY text (e.g. "Landscape 16:9"), used only
    // for the More trigger's text and pill highlighting. selectedRatioText is the clean,
    // authored ratio string (e.g. "16:9") the EditInFirefly contract's cropAspectRatioLock
    // actually wants — null for Freeform/Custom/Social selections, which have no literal
    // ratio column (see buildAspectPill).
    this.selectedRatioLabel = 'Freeform';
    this.selectedRatioText = null;
    // Matches whichever mode buildAdjustBar picked as the first/active toggle button
    // (or null if none were authored — no adjust bar exists in that case, see
    // buildEditorStage), so DOM (.is-active) and state start in sync. Stored so
    // reset() can return to it without re-deriving the same lookup.
    this.defaultMode = parsedData.sliderModes[0]?.mode || null;
    this.mode = this.defaultMode;
    this.zoom = 0;
    this.quality = 100;
    this.idleTimer = null;
    this.bindEvents();
  }

  viewportSize() {
    const { width, height } = this.viewport.getBoundingClientRect();
    return [width, height];
  }

  async setImage(url, originalSize = 0) {
    this.originalSize = originalSize;
    this.hasInteracted = false;
    if (this.qualityPreviewUrl) URL.revokeObjectURL(this.qualityPreviewUrl);
    this.qualityPreviewUrl = null;
    this.qualityPreviewActive = false;
    this.updateQualityBtnState();
    this.originalUrl = url;
    this.blurImg.src = url;
    this.sharpImg.src = url;
    if (!(this.sharpImg.complete && this.sharpImg.naturalWidth)) {
      await new Promise((resolve) => {
        this.sharpImg.addEventListener('load', resolve, { once: true });
      });
    }
    this.naturalW = this.sharpImg.naturalWidth;
    this.naturalH = this.sharpImg.naturalHeight;
    this.targetW = this.naturalW;
    this.targetH = this.naturalH;
    // Dedicated, never-swapped source element for pixel operations (size estimate,
    // quality preview) so toggling the quality preview on/off can't compound
    // re-encoding against an already-degraded image.
    this.sourceImg = new Image();
    this.sourceImg.src = url;
    const [vpW, vpH] = this.viewportSize();
    this.rect = centeredRect(null, this.naturalW, this.naturalH, vpW, vpH);
    this.render();
  }

  render() {
    const { x, y, w, h } = this.rect;
    this.frame.style.left = `${x}%`;
    this.frame.style.top = `${y}%`;
    this.frame.style.width = `${w}%`;
    this.frame.style.height = `${h}%`;
    // clip-path must live on sharpLayer (the untransformed wrapper), not sharpImg
    // itself — CSS clips an element's own box before applying its transform, so a
    // clip-path on the same element being scaled would visibly scale the "cut here"
    // window along with the zoom, drifting away from the static .ia-frame overlay
    // (which never gets a zoom transform). Clipping on the fixed wrapper keeps the
    // visible sharp window pinned to the frame regardless of zoom.
    this.sharpLayer.style.clipPath = `inset(${y}% ${100 - (x + w)}% ${100 - (y + h)}% ${x}%)`;
    const transform = `scale(${zoomScale(this.zoom)})`;
    this.blurImg.style.transform = transform;
    this.sharpImg.style.transform = transform;
    if (!this.isCrop) this.syncDimensionFields();
  }

  // Pure display of `targetW`/`targetH` — the Custom tab's independent output size.
  // Never reads `rect`: while locked, dragging never touches targetW/targetH (see
  // startDrag), so this must not resync from the frame on every render or it would
  // silently undo that decoupling.
  syncDimensionFields() {
    if (!this.widthInput || !this.naturalW) return;
    if (document.activeElement !== this.widthInput) this.widthInput.value = pxToUnit(this.targetW, this.unit);
    if (document.activeElement !== this.heightInput) this.heightInput.value = pxToUnit(this.targetH, this.unit);
    this.scheduleSizeReadout();
  }

  static formatBytes(bytes) {
    if (!bytes) return '--';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // Real byte size via the browser's own JPEG encoder — not the w*h*3 heuristic the
  // prototype used. Draws the full source image (not just the crop region — Resize's
  // size estimate is about output pixel count + quality, independent of the frame) at
  // the current target dimensions and reads the actual compressed blob size.
  computeNewSize(width, height) {
    return new Promise((resolve) => {
      if (!width || !height || !this.sourceImg) { resolve(null); return; }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(this.sourceImg, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob?.size ?? null), 'image/jpeg', this.quality / 100);
    });
  }

  scheduleSizeReadout() {
    if (!this.sizeReadout) return;
    clearTimeout(this.sizeReadoutTimer);
    this.sizeReadoutTimer = setTimeout(() => this.updateSizeReadout(), 150);
  }

  async updateSizeReadout() {
    const original = EditorEngine.formatBytes(this.originalSize);
    if (!this.hasInteracted) {
      this.sizeReadout.textContent = `${this.originalSizeLabel}: ${original} ${this.newSizeLabel}: --`;
      return;
    }
    this.sizeReadoutSeq += 1;
    const seq = this.sizeReadoutSeq;
    const { width, height } = this.getResizeDimensions();
    const newSize = await this.computeNewSize(width, height);
    if (seq !== this.sizeReadoutSeq) return; // a newer update superseded this one
    const updated = EditorEngine.formatBytes(newSize);
    this.sizeReadout.textContent = `${this.originalSizeLabel}: ${original} ${this.newSizeLabel}: ${updated}`;
  }

  // Resize-only "Quality" button: an explicit, on-demand visual preview of what the
  // current quality slider value actually does to the image, since (unlike rotation)
  // there's no free CSS shortcut for real compression artifacts. Re-encodes the full
  // source at its natural resolution (no crop/resample) so the swapped-in image keeps
  // the exact same dimensions as the original and never disturbs the frame/viewport
  // layout. Always draws from `this.sourceImg` (never the currently-displayed
  // `sharpImg`/`blurImg`) so repeated toggles can't compound re-encoding loss.
  applyQualityPreview() {
    if (!this.sourceImg || !this.naturalW || !this.naturalH) return;
    const canvas = document.createElement('canvas');
    canvas.width = this.naturalW;
    canvas.height = this.naturalH;
    canvas.getContext('2d').drawImage(this.sourceImg, 0, 0, this.naturalW, this.naturalH);
    canvas.toBlob((blob) => {
      if (!blob) return;
      if (this.qualityPreviewUrl) URL.revokeObjectURL(this.qualityPreviewUrl);
      const url = URL.createObjectURL(blob);
      this.qualityPreviewUrl = url;
      this.blurImg.src = url;
      this.sharpImg.src = url;
      this.qualityPreviewActive = true;
      this.updateQualityBtnState();
    }, 'image/jpeg', this.quality / 100);
  }

  revertQualityPreview() {
    if (!this.qualityPreviewActive) return;
    this.blurImg.src = this.originalUrl;
    this.sharpImg.src = this.originalUrl;
    if (this.qualityPreviewUrl) URL.revokeObjectURL(this.qualityPreviewUrl);
    this.qualityPreviewUrl = null;
    this.qualityPreviewActive = false;
    this.updateQualityBtnState();
  }

  toggleQualityPreview() {
    if (this.qualityPreviewActive) this.revertQualityPreview();
    else this.applyQualityPreview();
  }

  updateQualityBtnState() {
    if (!this.qualityBtn) return;
    this.qualityBtn.classList.toggle('is-active', this.qualityPreviewActive);
    this.qualityBtn.setAttribute('aria-pressed', String(this.qualityPreviewActive));
    this.qualityBtn.textContent = this.qualityPreviewActive ? 'Original' : 'Quality';
  }

  bindEvents() {
    this.frame.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.ia-handle')) return;
      this.startDrag(e, 'move');
    });
    this.frame.querySelectorAll('.ia-handle').forEach((handle) => {
      handle.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        this.startDrag(e, handle.dataset.handle);
      });
    });
    this.slider?.addEventListener('input', () => this.onSlider());
    this.toggleBtns.forEach((btn) => {
      btn.addEventListener('click', () => this.setMode(btn.dataset.mode));
    });
    this.viewport.addEventListener('pointerdown', () => this.resetIdle());
    this.viewport.addEventListener('pointermove', () => this.resetIdle());
    this.setMode(this.mode);
    this.resetIdle();
    this.bindAspectEvents();
    this.bindResizeTabEvents();
    this.bindDimensionEvents();
    this.bindSocialEvents();
    this.bindUnitEvents();
    this.resetBtn?.addEventListener('click', () => this.reset());
    this.qualityBtn?.addEventListener('click', () => this.toggleQualityPreview());
  }

  bindResizeTabEvents() {
    this.resizeTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        // Social doesn't switch tabs on its own click — like Crop's More, it opens a
        // dropdown first; picking a platform is what actually switches to it (see
        // bindSocialEvents), same as picking a More option marks that pill active.
        if (tab.dataset.tab === 'social') {
          this.toggleSocialMenu();
          return;
        }
        this.selectResizeTab(tab);
      });
    });
  }

  selectResizeTab(tab) {
    this.resizeTab = tab.dataset.tab;
    this.resizeTabs.forEach((t) => t.classList.toggle('is-active', t === tab));
    this.resizeDetails.forEach((d) => d.classList.toggle('hide', d.dataset.tab !== tab.dataset.tab));
    // Same as Crop's More trigger reverting to its default label when a different pill
    // is picked (selectAspect's fromMore=false branch) — Social should only show a
    // platform name while it's actually the active tab, not linger after Custom/Standard
    // is chosen.
    if (tab !== this.socialTrigger && this.socialTrigger) this.socialTrigger.textContent = this.socialDefaultLabel;
  }

  bindDimensionEvents() {
    if (!this.widthInput) return;
    // Commit on blur/Enter for typed digits — partial input while composing a number
    // should never reshape the frame or recompute the size readout mid-edit. Arrow-key
    // stepping is different: each press is already a complete, atomic change (the
    // browser's native stepUp/stepDown), so it commits immediately, per tick.
    const commit = (axis) => () => this.onDimensionCommit(axis);
    this.widthInput.addEventListener('blur', commit('width'));
    this.heightInput.addEventListener('blur', commit('height'));
    [[this.widthInput, 'width'], [this.heightInput, 'height']].forEach(([input, axis]) => {
      let viaArrowKey = false;
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.onDimensionCommit(axis);
          input.blur();
          return;
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') viaArrowKey = true;
      });
      // The native step happens between keydown and input, so input.value already
      // reflects the new stepped value by the time this fires.
      input.addEventListener('input', () => {
        if (!viaArrowKey) return;
        viaArrowKey = false;
        this.onDimensionCommit(axis);
      });
    });
    this.lockBtn.addEventListener('click', () => {
      this.locked = !this.locked;
      this.lockBtn.classList.toggle('is-active', this.locked);
      this.lockBtn.setAttribute('aria-pressed', String(this.locked));
    });
  }

  // Locked: targetW/targetH are independent of the crop frame — updated here,
  // cross-computed from their own current ratio, `rect` is never touched. Unlocked:
  // targetW/targetH and `rect` collapse back into one thing — frameFromDimensions
  // rebuilds the box at the new size anchored on the current rect's own center (not
  // the viewport's), so typing/stepping a value resizes the box in place rather than
  // snapping it back to wherever a fresh, never-touched selection would start.
  onDimensionCommit(axis) {
    if (!this.naturalW) return;
    const raw = Number(axis === 'width' ? this.widthInput.value : this.heightInput.value);
    if (!raw || raw <= 0) return;
    const rawPx = unitToPx(raw, this.unit);
    if (this.locked) {
      const ratio = this.targetW / this.targetH;
      if (axis === 'width') {
        this.targetW = rawPx;
        this.targetH = Math.round(rawPx / ratio);
      } else {
        this.targetH = rawPx;
        this.targetW = Math.round(rawPx * ratio);
      }
    } else {
      if (axis === 'width') this.targetW = rawPx;
      else this.targetH = rawPx;
      const [vpW, vpH] = this.viewportSize();
      this.rect = frameFromDimensions(this.targetW, this.targetH, this.naturalW, this.naturalH, vpW, vpH, this.rect);
    }
    this.hasInteracted = true;
    this.render();
  }

  toggleSocialMenu() {
    const isOpen = !this.socialMenu.classList.contains('hide');
    this.socialMenu.classList.toggle('hide', isOpen);
    this.socialTrigger.setAttribute('aria-expanded', String(!isOpen));
  }

  closeSocialMenu() {
    this.socialMenu?.classList.add('hide');
    this.socialTrigger?.setAttribute('aria-expanded', 'false');
  }

  bindSocialEvents() {
    if (!this.socialTrigger) return;
    this.panel.querySelectorAll('.ia-social-opt').forEach((opt) => {
      opt.addEventListener('click', () => {
        const { platform } = opt.dataset;
        this.socialTrigger.textContent = platform;
        this.socialGrids.forEach((grid) => grid.classList.toggle('hide', grid.dataset.platform !== platform));
        this.closeSocialMenu();
        this.selectResizeTab(this.socialTrigger);
      });
    });
    this.socialMenu?.querySelector('.ia-dropdown-close')?.addEventListener('click', () => this.closeSocialMenu());
    // Scoped to the dropdown's own wrapper, not the whole panel — clicking elsewhere in
    // the panel (e.g. the CTA row, a Standard pill) should close this like any other
    // outside click, not just a click that lands entirely outside the panel.
    document.addEventListener('click', (e) => {
      if (!this.socialWrap?.contains(e.target)) this.closeSocialMenu();
    });
  }

  toggleUnitMenu() {
    const isOpen = !this.unitMenu.classList.contains('hide');
    this.unitMenu.classList.toggle('hide', isOpen);
    this.unitTrigger.setAttribute('aria-expanded', String(!isOpen));
  }

  closeUnitMenu() {
    this.unitMenu?.classList.add('hide');
    this.unitTrigger?.setAttribute('aria-expanded', 'false');
  }

  bindUnitEvents() {
    if (!this.unitTrigger) return;
    this.unitTrigger.addEventListener('click', () => this.toggleUnitMenu());
    this.panel.querySelectorAll('.ia-unit-opt').forEach((opt) => {
      opt.addEventListener('click', () => {
        this.unit = opt.dataset.unit;
        if (this.unitLabel) this.unitLabel.textContent = this.unit;
        this.closeUnitMenu();
        this.syncDimensionFields();
      });
    });
    this.unitMenu?.querySelector('.ia-dropdown-close')?.addEventListener('click', () => this.closeUnitMenu());
    // Scoped to the picker's own wrapper, not the whole panel — see bindSocialEvents.
    document.addEventListener('click', (e) => {
      if (!this.unitWrap?.contains(e.target)) this.closeUnitMenu();
    });
  }

  reset() {
    this.zoom = 0;
    this.quality = 100;
    this.revertQualityPreview();
    if (this.isCrop) {
      this.selectAspect(this.defaultAspectRatio, this.defaultAspectLabel, false, null, this.defaultAspectRatioText);
    } else {
      this.locked = true;
      this.resizeTab = 'custom';
      this.lockBtn?.classList.add('is-active');
      this.lockBtn?.setAttribute('aria-pressed', 'true');
      this.resizeTabs.forEach((t) => t.classList.toggle('is-active', t.dataset.tab === 'custom'));
      this.resizeDetails.forEach((d) => d.classList.toggle('hide', d.dataset.tab !== 'custom'));
      this.aspectPills.forEach((pill) => pill.classList.remove('is-active'));
      if (this.socialTrigger) this.socialTrigger.textContent = this.socialDefaultLabel;
      this.unit = 'px';
      if (this.unitLabel) this.unitLabel.textContent = 'px';
      if (this.naturalW) {
        const [vpW, vpH] = this.viewportSize();
        this.rect = centeredRect(null, this.naturalW, this.naturalH, vpW, vpH);
        this.targetW = this.naturalW;
        this.targetH = this.naturalH;
        this.render();
      }
    }
    this.hasInteracted = false;
    this.setMode(this.defaultMode);
    this.scheduleSizeReadout();
  }

  bindAspectEvents() {
    if (!this.aspectPills.length) return;
    this.aspectPills.forEach((pill) => {
      if (pill === this.moreTrigger) return;
      pill.addEventListener('click', () => {
        const { ratio, label, width, height, ratioText } = pill.dataset;
        const dimensions = width && height ? { width: Number(width), height: Number(height) } : null;
        this.selectAspect(ratio ? Number(ratio) : null, label, false, dimensions, ratioText || null);
        this.closeMore();
      });
    });
    this.moreTrigger?.addEventListener('click', () => this.toggleMore());
    // Double optional-chain: moreMenu is null when the sheet authored no "More" rows
    // for this operation (see buildCropAspectSection) — querySelectorAll on null would
    // throw without the first `?.`, and calling .forEach on that undefined result would
    // throw without the second.
    this.moreMenu?.querySelectorAll('.ia-more-opt')?.forEach((opt) => {
      opt.addEventListener('click', () => {
        const { ratio, label, ratioText } = opt.dataset;
        this.selectAspect(Number(ratio), label, true, null, ratioText || null);
        this.closeMore();
      });
    });
    this.moreMenu?.querySelector('.ia-dropdown-close')?.addEventListener('click', () => this.closeMore());
    // Guarded on moreTrigger existing at all (not just aspectPills.length, which can be
    // true from standalone pills alone) — no point registering a global listener for a
    // dropdown that was never authored. Scoped to the dropdown's own wrapper, not the
    // whole panel, once it does exist — see bindSocialEvents.
    if (this.moreTrigger) {
      document.addEventListener('click', (e) => {
        if (!this.moreWrap.contains(e.target)) this.closeMore();
      });
    }
  }

  toggleMore() {
    const isOpen = !this.moreMenu.classList.contains('hide');
    if (isOpen) this.closeMore();
    else {
      this.moreMenu.classList.remove('hide');
      this.moreTrigger.setAttribute('aria-expanded', 'true');
    }
  }

  closeMore() {
    this.moreMenu?.classList.add('hide');
    this.moreTrigger?.setAttribute('aria-expanded', 'false');
  }

  selectAspect(ratio, label, fromMore = false, dimensions = null, ratioText = null) {
    this.selectedRatio = ratio;
    this.selectedRatioLabel = label;
    this.selectedRatioText = ratioText;
    this.aspectPills.forEach((pill) => pill.classList.remove('is-active'));
    if (fromMore) {
      this.moreTrigger.textContent = label;
      this.moreTrigger.classList.add('is-active');
    } else {
      if (this.moreTrigger) this.moreTrigger.textContent = this.moreDefaultLabel;
      const match = this.aspectPills.find((pill) => pill.dataset.label === label);
      match?.classList.add('is-active');
    }
    if (this.naturalW) {
      const [vpW, vpH] = this.viewportSize();
      this.rect = centeredRect(ratio, this.naturalW, this.naturalH, vpW, vpH);
      if (!this.isCrop) {
        if (dimensions) {
          // Social rows carry a literal pixel target (e.g. "1080x1920") — use it
          // exactly, rather than rectPctToSourceBounds' rounded approximation of
          // whatever the frame's current on-screen pixel math happens to produce.
          this.targetW = dimensions.width;
          this.targetH = dimensions.height;
        } else {
          // Standard presets carry no literal target size, only a ratio — seed
          // targetW/targetH from the newly-shaped rect so the Custom tab shows
          // something coherent if the user switches back to it.
          const b = rectPctToSourceBounds(this.rect, this.naturalW, this.naturalH, vpW, vpH, 0);
          this.targetW = b.right - b.left;
          this.targetH = b.bottom - b.top;
        }
      }
      this.hasInteracted = true;
      this.render();
    }
  }

  getSourceBounds() {
    const [vpW, vpH] = this.viewportSize();
    return rectPctToSourceBounds(this.rect, this.naturalW, this.naturalH, vpW, vpH, this.zoom);
  }

  // Resize's target output size. Custom tab has its own independent targetW/targetH
  // (decoupled from the crop frame while locked — see onDimensionCommit/startDrag).
  // Standard/Social have no such concept — they only carry an aspect ratio, so their
  // output size is still whatever the selected rect's own natural footprint is.
  getResizeDimensions() {
    if (this.resizeTab === 'custom') return { width: this.targetW, height: this.targetH };
    const [vpW, vpH] = this.viewportSize();
    const b = rectPctToSourceBounds(this.rect, this.naturalW, this.naturalH, vpW, vpH, 0);
    return { width: b.right - b.left, height: b.bottom - b.top };
  }

  // For the outbound resize payload only — converts to whatever unit the user actually
  // selected in the Custom tab's unit dropdown (px/in/cm/mm), and reports that unit
  // alongside. getResizeDimensions() itself must stay in raw pixels regardless (the
  // canvas-based "New Size" byte estimate and computeNewSize() need real pixel counts,
  // not a unit-converted approximation). Standard/Social have no unit picker at all —
  // their output is always reported in px.
  getResizeOutputDimensions() {
    const { width, height } = this.getResizeDimensions();
    if (this.resizeTab !== 'custom') return { width, height, unit: 'px' };
    return { width: pxToUnit(width, this.unit), height: pxToUnit(height, this.unit), unit: this.unit };
  }

  // Crop and Resize's Standard/Social tabs lock drag-resize to whichever aspect pill
  // is selected (this.selectedRatio). Resize's Custom tab has no pill selected at
  // all — there, the lock toggle means "keep whatever ratio the box currently has"
  // (computed from the live rect, not a fixed preset), and unlocked means freeform.
  getDragRatioLock(rect) {
    if (this.isCrop || this.resizeTab !== 'custom') return this.selectedRatio;
    if (!this.locked) return null;
    // rect.w/rect.h are % of the same viewport, uniformly scaled by object-contain, so
    // the object-contain factor cancels out — this is the exact source-pixel ratio,
    // with none of the integer-pixel rounding rectPctToSourceBounds would introduce.
    const [vpW, vpH] = this.viewportSize();
    const w = rect.w * vpW;
    const h = rect.h * vpH;
    return h ? w / h : null;
  }

  startDrag(e, kind) {
    e.preventDefault();
    // preventDefault() above also suppresses pointerdown's native focus-shift, which is
    // normally what blurs a focused input when you click elsewhere (and is what commits
    // Width/Height's typed value). Without this, starting a drag while a dimension
    // field is focused would leave it focused — and never committed — unlike a real
    // click outside it. Blur explicitly to match that expected behavior.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.resetIdle();
    this.hasInteracted = true;
    const startX = e.clientX;
    const startY = e.clientY;
    const baseRect = { ...this.rect };
    const [vpW, vpH] = this.viewportSize();
    const trueRatioLock = this.getDragRatioLock(baseRect);
    // resizeRect operates purely on rect.w/rect.h percentages, each normalized by a
    // different axis (vpW vs vpH) — a true ratio (e.g. 16/9) only equals newW%/newH%
    // when vpW === vpH. Converting to percentage-space here keeps resizeRect's own
    // math axis-agnostic while still locking to the real, visual aspect ratio.
    const ratioLock = trueRatioLock ? trueRatioLock * (vpH / vpW) : null;
    const move = (ev) => {
      const dxPct = ((ev.clientX - startX) / vpW) * 100;
      const dyPct = ((ev.clientY - startY) / vpH) * 100;
      this.rect = kind === 'move'
        ? {
          ...baseRect,
          x: clamp(baseRect.x + dxPct, 0, 100 - baseRect.w),
          y: clamp(baseRect.y + dyPct, 0, 100 - baseRect.h),
        }
        : resizeRect(baseRect, kind, dxPct, dyPct, ratioLock);
      // Unlocked Custom-tab drag: rect and targetW/targetH are the same thing, so keep
      // the displayed width/height live during the drag itself, not just once it ends.
      // Locked: never touch targetW/targetH here — dragging only changes which pixels
      // get sampled, not the output size (see §3 of the design discussion this
      // implements). The expensive "New Size" estimate stays debounced regardless,
      // via scheduleSizeReadout() (called from render() -> syncDimensionFields()), so
      // it still only actually computes once the user pauses, not on every tick.
      if (!this.isCrop && this.resizeTab === 'custom' && !this.locked) {
        const b = rectPctToSourceBounds(this.rect, this.naturalW, this.naturalH, vpW, vpH, 0);
        this.targetW = b.right - b.left;
        this.targetH = b.bottom - b.top;
      }
      this.render();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  setMode(mode) {
    this.mode = mode;
    this.toggleBtns.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.mode === mode));
    // No slider exists at all when nothing was authored (see buildEditorStage) —
    // this.mode is still tracked for bookkeeping, but there's nothing left to update.
    if (!this.slider) return;
    this.slider.min = '0';
    this.slider.max = '100';
    // Unrecognized authored mode (see KNOWN_SLIDER_MODES) — the button and its label
    // still work, there's just no real state to reflect, so this is the safest inert
    // fallback rather than showing "undefined".
    const current = { zoom: this.zoom, quality: this.quality }[mode] ?? 0;
    this.slider.value = String(current);
    this.updateValLabel();
  }

  onSlider() {
    // Unrecognized authored mode (see KNOWN_SLIDER_MODES) — nothing to update.
    if (!KNOWN_SLIDER_MODES.has(this.mode)) return;
    const value = Number(this.slider.value);
    if (this.mode === 'zoom') this.zoom = value;
    else this.quality = value;
    this.hasInteracted = true;
    // Changing quality invalidates whatever preview is currently shown — revert so the
    // display never silently shows a stale quality level.
    if (this.mode === 'quality') this.revertQualityPreview();
    this.updateValLabel();
    this.render();
  }

  updateValLabel() {
    if (!this.valEl) return;
    if (this.mode === 'zoom') this.valEl.textContent = `${Math.round(this.zoom)}%`;
    else if (this.mode === 'quality') this.valEl.textContent = `${Math.round(this.quality)}%`;
    else this.valEl.textContent = '--';
  }

  resetIdle() {
    this.frame.classList.remove('ia-frame--idle');
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.frame.classList.add('ia-frame--idle'), IDLE_MS);
  }
}

// Builds a working editor and swaps it in for the given (already-in-document) slot
// elements — self-contained, so the caller (inline-action.js) only needs to decide
// *when* to call this and cache the result, never construct the DOM itself.
// Uses replaceWith(), not append(): the slots are plain unstyled placeholder divs, and
// .ia-panel-left/.ia-panel-right (their parent) is a flex container whose layout the
// real .ia-editor-stage/.ia-editor-panel depend on directly — an extra wrapper div left
// in place would sit between them and break that flex relationship (this was a real,
// reproduced regression, not just a theoretical one).
export async function initEditor(stageSlot, panelSlot, parsedData) {
  const [, aspectRows] = await Promise.all([
    new Promise((resolve) => { loadStyle(`${getUnityLibs()}/core/widgets/inline-action/editor.css`, resolve); }),
    loadAspectRatios(parsedData.operation),
  ]);
  const fullData = { ...parsedData, aspectRows };
  const stage = buildEditorStage(fullData);
  const panel = buildEditorPanel(fullData);
  stageSlot.replaceWith(stage);
  panelSlot.replaceWith(panel);
  return new EditorEngine(stage, panel, fullData);
}
