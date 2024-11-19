const MILO_TEMPLATES = [
  '404',
  'featured-story',
];

const AUTO_BLOCKS = [
  { faas: '/tools/faas' },
  { fragment: '/express/fragments/' },
];

const DO_NOT_INLINE = [
  'accordion',
  'columns',
  'z-pattern',
];

const cachedMetadata = [];

const ENVS = {
  stage: {
    name: 'stage',
    ims: 'stg1',
    adobeIO: 'cc-collab-stage.adobe.io',
    adminconsole: 'stage.adminconsole.adobe.com',
    account: 'stage.account.adobe.com',
    edgeConfigId: '8d2805dd-85bf-4748-82eb-f99fdad117a6',
    pdfViewerClientId: '600a4521c23d4c7eb9c7b039bee534a0',
  },
  prod: {
    name: 'prod',
    ims: 'prod',
    adobeIO: 'cc-collab.adobe.io',
    adminconsole: 'adminconsole.adobe.com',
    account: 'account.adobe.com',
    edgeConfigId: '2cba807b-7430-41ae-9aac-db2b0da742d5',
    pdfViewerClientId: '3c0a5ddf2cc04d3198d9e48efc390fa9',
  },
};
ENVS.local = {
  ...ENVS.stage,
  name: 'local',
};

export const MILO_EVENTS = { DEFERRED: 'milo:deferred' };

const LANGSTORE = 'langstore';

const PAGE_URL = new URL(window.location.href);

function sanitizeInput(input) {
  if (Number.isInteger(input)) return input;
  return input.replace(/[^a-zA-Z0-9-_]/g, ''); // Simple regex to strip out potentially dangerous characters
}

export function getMetadata(name) {
  const attr = name && name.includes(':') ? 'property' : 'name';
  const $meta = document.head.querySelector(`meta[${attr}="${name}"]`);
  return ($meta && $meta.content) || '';
}

const handleEntitlements = (() => {
  let entResolve;
  const entPromise = new Promise((resolve) => {
    entResolve = resolve;
  });

  return (resolveVal) => {
    if (resolveVal !== undefined) {
      entResolve(resolveVal);
    }
    return entPromise;
  };
})();
export function getCachedMetadata(name) {
  if (cachedMetadata[name] === undefined) cachedMetadata[name] = getMetadata(name);
  return cachedMetadata[name];
}

function getEnv(conf) {
  const { host } = window.location;
  const query = PAGE_URL.searchParams.get('env');

  if (query) return { ...ENVS[query], consumer: conf[query] };
  if (host.includes('localhost')) return { ...ENVS.local, consumer: conf.local };
  /* c8 ignore start */
  if (host.includes('hlx.page')
    || host.includes('hlx.live')
    || host.includes('stage.adobe')
    || host.includes('corp.adobe')) {
    return { ...ENVS.stage, consumer: conf.stage };
  }
  return { ...ENVS.prod, consumer: conf.prod };
  /* c8 ignore stop */
}

export function getLocale(locales, pathname = window.location.pathname) {
  if (!locales) {
    return { ietf: 'en-US', tk: 'hah7vzn.css', prefix: '' };
  }
  const split = pathname.split('/');
  const localeString = split[1];
  const locale = locales[localeString] || locales[''];
  if (localeString === LANGSTORE) {
    locale.prefix = `/${localeString}/${split[2]}`;
    if (
      Object.values(locales)
        .find((loc) => loc.ietf?.startsWith(split[2]))?.dir === 'rtl'
    ) locale.dir = 'rtl';
    return locale;
  }
  const isUS = locale.ietf === 'en-US';
  locale.prefix = isUS ? '' : `/${localeString}`;
  locale.region = isUS ? 'us' : localeString.split('_')[0];
  return locale;
}

export const [setConfig, updateConfig, getConfig] = (() => {
  let config = {};
  return [
    (conf) => {
      const origin = conf.origin || window.location.origin;
      const pathname = conf.pathname || window.location.pathname;
      config = { env: getEnv(conf), ...conf };
      config.codeRoot = conf.codeRoot ? `${origin}${conf.codeRoot}` : origin;
      config.base = config.miloLibs || config.codeRoot;
      config.locale = pathname ? getLocale(conf.locales, pathname) : getLocale(conf.locales);
      config.autoBlocks = conf.autoBlocks ? [...AUTO_BLOCKS, ...conf.autoBlocks] : AUTO_BLOCKS;
      config.doNotInline = conf.doNotInline
        ? [...DO_NOT_INLINE, ...conf.doNotInline]
        : DO_NOT_INLINE;
      const lang = getMetadata('content-language') || config.locale.ietf;
      document.documentElement.setAttribute('lang', lang);
      try {
        const dir = getMetadata('content-direction')
          || config.locale.dir
          || (config.locale.ietf && (new Intl.Locale(config.locale.ietf)?.textInfo?.direction))
          || 'ltr';
        document.documentElement.setAttribute('dir', dir);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log('Invalid or missing locale:', e);
      }
      config.locale.contentRoot = `${origin}${config.locale.prefix}${config.contentRoot ?? ''}`;
      config.useDotHtml = !PAGE_URL.origin.includes('.hlx.')
        && (conf.useDotHtml ?? PAGE_URL.pathname.endsWith('.html'));
      config.entitlements = handleEntitlements;
      config.consumerEntitlements = conf.entitlements || [];
      return config;
    },
    // eslint-disable-next-line no-return-assign
    (conf) => (config = conf),
    () => config,
  ];
})();

/**
 * log RUM if part of the sample.
 * @param {string} checkpoint identifies the checkpoint in funnel
 * @param {Object} data additional data for RUM sample
 * @param {Number} forceSampleRate force weight on specific RUM sampling
 */

export function sampleRUM(checkpoint, data = {}, forceSampleRate) {
  sampleRUM.defer = sampleRUM.defer || [];
  const defer = (fnname) => {
    sampleRUM[fnname] = sampleRUM[fnname]
      || ((...args) => sampleRUM.defer.push({ fnname, args }));
  };
  sampleRUM.drain = sampleRUM.drain
    || ((dfnname, fn) => {
      sampleRUM[dfnname] = fn;
      sampleRUM.defer
        .filter(({ fnname }) => dfnname === fnname)
        .forEach(({ fnname, args }) => sampleRUM[fnname](...args));
    });
  sampleRUM.on = (chkpnt, fn) => {
    sampleRUM.cases[chkpnt] = fn;
  };
  defer('observe');
  defer('cwv');
  defer('stash');
  try {
    window.hlx = window.hlx || {};
    if (!window.hlx.rum) {
      const usp = new URLSearchParams(window.location.search);
      const weight = (usp.get('rum') === 'on') ? 1 : forceSampleRate || window.RUM_LOW_SAMPLE_RATE;
      // eslint-disable-next-line no-bitwise
      const hashCode = (s) => s.split('').reduce((a, b) => (((a << 5) - a) + b.charCodeAt(0)) | 0, 0);
      const id = `${hashCode(window.location.href)}-${new Date().getTime()}-${Math.random().toString(16).substr(2, 14)}`;
      const random = Math.random();
      const isSelected = (random * weight < 1);
      // eslint-disable-next-line object-curly-newline
      window.hlx.rum = { weight, id, random, isSelected, sampleRUM };
    }
    const { id } = window.hlx.rum;
    if ((window.hlx && window.hlx.rum && window.hlx.rum.isSelected) || checkpoint === 'experiment') {
      const sendPing = (pdata = data) => {
        if (!window.hlx.rum.isSelected) {
          return;
        }
        // eslint-disable-next-line object-curly-newline, max-len, no-use-before-define
        const body = JSON.stringify({ weight: window.hlx.rum.weight, id, referer: window.location.href, generation: window.RUM_GENERATION, checkpoint, ...data });
        const url = `https://rum.hlx.page/.rum/${window.hlx.rum.weight}`;
        // eslint-disable-next-line no-unused-expressions
        navigator.sendBeacon(url, body);
        // eslint-disable-next-line no-console
        console.debug(`ping:${checkpoint}:${window.hlx.rum.weight}`, pdata);
      };
      sampleRUM.cases = sampleRUM.cases || {
        cwv: () => sampleRUM.cwv(data) || true,
        lazy: () => {
          // use classic script to avoid CORS issues
          const script = document.createElement('script');
          script.src = 'https://rum.hlx.page/.rum/@adobe/helix-rum-enhancer@^1/src/index.js';
          document.head.appendChild(script);
          sendPing(data);
          return true;
        },
        experiment: () => {
          // track experiments with higher sampling rate
          window.hlx.rum.weight = Math.min(window.hlx.rum.weight, window.RUM_HIGH_SAMPLE_RATE);
          window.hlx.rum.isSelected = (window.hlx.rum.random * window.hlx.rum.weight < 1);

          sampleRUM.drain('stash', sampleRUM);
          sendPing(data);
          return true;
        },
      };
      sendPing(data);
      if (sampleRUM.cases[checkpoint]) {
        sampleRUM.cases[checkpoint]();
      }
    } else {
      sampleRUM.stash(checkpoint, data); // save the event for later
    }
  } catch (error) {
    // something went wrong
  }
}

export function addPublishDependencies(url) {
  if (!Array.isArray(url)) {
    // eslint-disable-next-line no-param-reassign
    url = [url];
  }
  window.hlx = window.hlx || {};
  if (window.hlx.dependencies && Array.isArray(window.hlx.dependencies)) {
    window.hlx.dependencies.concat(url);
  } else {
    window.hlx.dependencies = url;
  }
}

export function toClassName(name) {
  return name && typeof name === 'string'
    ? name.trim().toLowerCase().replace(/[^0-9a-z]/gi, '-')
    : '';
}

export function createTag(tag, attributes, html) {
  const el = document.createElement(tag);
  if (html) {
    if (html instanceof HTMLElement
      || html instanceof SVGElement
      || html instanceof DocumentFragment) {
      el.append(html);
    } else if (Array.isArray(html)) {
      el.append(...html);
    } else {
      el.insertAdjacentHTML('beforeend', html);
    }
  }
  if (attributes) {
    Object.entries(attributes).forEach(([key, val]) => {
      el.setAttribute(key, val);
    });
  }
  return el;
}

// Get lottie animation HTML - remember to lazyLoadLottiePlayer() to see it.
export function getLottie(name, src, loop = true, autoplay = true, control = false, hover = false) {
  return (`<lottie-player class="lottie lottie-${name}" src="${src}" background="transparent" speed="1" ${(loop) ? 'loop ' : ''}${(autoplay) ? 'autoplay ' : ''}${(control) ? 'controls ' : ''}${(hover) ? 'hover ' : ''}></lottie-player>`);
}

// Lazy-load lottie player if you scroll to the block.
export function lazyLoadLottiePlayer($block = null) {
  const usp = new URLSearchParams(window.location.search);
  const lottie = usp.get('lottie');
  if (lottie !== 'off') {
    const loadLottiePlayer = () => {
      if (window['lottie-player']) return;
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.async = true;
      script.src = '/express/scripts/lottie-player.1.5.6.js';
      document.head.appendChild(script);
      window['lottie-player'] = true;
    };
    if ($block) {
      const addIntersectionObserver = (block) => {
        const observer = (entries) => {
          const entry = entries[0];
          if (entry.isIntersecting) {
            if (entry.intersectionRatio >= 0.25) {
              loadLottiePlayer();
            }
          }
        };
        const options = {
          root: null,
          rootMargin: '0px',
          threshold: [0.0, 0.25],
        };
        const intersectionObserver = new IntersectionObserver(observer, options);
        intersectionObserver.observe(block);
      };
      if (document.readyState === 'complete') {
        addIntersectionObserver($block);
      } else {
        window.addEventListener('load', () => {
          addIntersectionObserver($block);
        });
      }
    } else if (document.readyState === 'complete') {
      loadLottiePlayer();
    } else {
      window.addEventListener('load', () => {
        loadLottiePlayer();
      });
    }
  }
}

function createSVGWrapper(icon, sheetSize, alt, altSrc) {
  const svgWrapper = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgWrapper.classList.add('icon');
  svgWrapper.classList.add(`icon-${icon}`);
  svgWrapper.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns', 'http://www.w3.org/1999/xlink');
  if (alt) {
    svgWrapper.appendChild(createTag('title', { innerText: alt }));
  }
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  if (altSrc) {
    u.setAttribute('href', altSrc);
  } else {
    u.setAttribute('href', `https://unity-poc--express--adobecom.hlx.page/express/icons/ccx-sheet_${sanitizeInput(sheetSize)}.svg#${
      sanitizeInput(icon)}${sanitizeInput(sheetSize)}`);
  }
  svgWrapper.appendChild(u);
  return svgWrapper;
}

function getIcon(icons, alt, size = 44, altSrc) {
  // eslint-disable-next-line no-param-reassign
  icons = Array.isArray(icons) ? icons : [icons];
  const [defaultIcon, mobileIcon] = icons;
  const icon = (mobileIcon && window.innerWidth < 600) ? mobileIcon : defaultIcon;
  const symbols = [
    'adobefonts',
    'adobe-stock',
    'android',
    'animation',
    'blank',
    'brand',
    'brand-libraries',
    'brandswitch',
    'calendar',
    'certified',
    'color-how-to-icon',
    'changespeed',
    'check',
    'chevron',
    'cloud-storage',
    'crop-image',
    'crop-video',
    'convert',
    'convert-png-jpg',
    'cursor-browser',
    'desktop',
    'desktop-round',
    'download',
    'elements',
    'facebook',
    'globe',
    'incredibly-easy',
    'instagram',
    'image',
    'ios',
    'libraries',
    'library',
    'linkedin',
    'magicwand',
    'mergevideo',
    'mobile-round',
    'muteaudio',
    'palette',
    'photos',
    'photoeffects',
    'pinterest',
    'play',
    'premium-templates',
    'pricingfree',
    'pricingpremium',
    'privacy',
    'qr-code',
    'remove-background',
    'resize',
    'resize-video',
    'reversevideo',
    'rush',
    'snapchat',
    'sparkpage',
    'sparkvideo',
    'stickers',
    'templates',
    'text',
    'tiktok',
    'trim-video',
    'twitter',
    'up-download',
    'upload',
    'users',
    'webmobile',
    'youtube',
    'star',
    'star-half',
    'star-empty',
    'pricing-gen-ai',
    'pricing-features',
    'pricing-import',
    'pricing-motion',
    'pricing-stock',
    'pricing-one-click',
    'pricing-collaborate',
    'pricing-premium-plan',
    'pricing-sync',
    'pricing-brand',
    'pricing-calendar',
    'pricing-fonts',
    'pricing-libraries',
    'pricing-cloud',
    'pricing-support',
    'pricing-sharing',
    'pricing-history',
    'pricing-corporate',
    'pricing-admin',
  ];

  const size22Icons = [
    'chevron',
    'pricingfree',
    'pricingpremium',
  ];

  if (symbols.includes(icon) || altSrc) {
    let sheetSize = size;
    if (size22Icons.includes(icon)) sheetSize = 22;
    return createSVGWrapper(icon, sheetSize, alt, altSrc);
  } else {
    return createTag('img', {
      class: `icon icon-${icon}`,
      src: altSrc || `https://unity-poc--express--adobecom.hlx.page/express/icons/${icon}.svg`,
      alt: `${alt || icon}`,
    });
  }
}

export function getIconElement(icons, size, alt, additionalClassName, altSrc) {
  const icon = getIcon(icons, alt, size, altSrc);
  if (additionalClassName) icon.classList.add(additionalClassName);
  return icon;
}

export function transformLinkToAnimation($a, $videoLooping = true) {
  if (!$a || !$a.href.endsWith('.mp4')) {
    return null;
  }
  const params = new URL($a.href).searchParams;
  const attribs = {};
  const dataAttr = $videoLooping ? ['playsinline', 'autoplay', 'loop', 'muted'] : ['playsinline', 'autoplay', 'muted'];
  dataAttr.forEach((p) => {
    if (params.get(p) !== 'false') attribs[p] = '';
  });
  // use closest picture as poster
  const $poster = $a.closest('div').querySelector('picture source');
  if ($poster) {
    attribs.poster = $poster.srcset;
    $poster.parentNode.remove();
  }
  // replace anchor with video element
  const videoUrl = new URL($a.href);

  const isLegacy = videoUrl.hostname.includes('hlx.blob.core') || videoUrl.pathname.includes('media_');
  const $video = createTag('video', attribs);
  if (isLegacy) {
    const helixId = videoUrl.hostname.includes('hlx.blob.core') ? videoUrl.pathname.split('/')[2] : videoUrl.pathname.split('media_')[1].split('.')[0];
    const videoHref = `./media_${helixId}.mp4`;
    $video.innerHTML = `<source src="${videoHref}" type="video/mp4">`;
  } else {
    $video.innerHTML = `<source src="${videoUrl}" type="video/mp4">`;
  }

  const $innerDiv = $a.closest('div');
  $innerDiv.prepend($video);
  $innerDiv.classList.add('hero-animation-overlay');
  $video.setAttribute('tabindex', 0);
  $a.replaceWith($video);
  // autoplay animation
  $video.addEventListener('canplay', () => {
    $video.muted = true;
    const playPromise = $video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // ignore
      });
    }
  });
  return $video;
}

export function linkImage($elem) {
  const $a = $elem.querySelector('a');
  if ($a) {
    const $parent = $a.closest('div');
    $a.remove();
    $a.className = '';
    $a.innerHTML = '';
    $a.append(...$parent.children);
    $parent.append($a);
  }
}

export function readBlockConfig($block) {
  const config = {};
  $block.querySelectorAll(':scope>div').forEach(($row) => {
    if ($row.children) {
      const $cols = [...$row.children];
      if ($cols[1]) {
        const $value = $cols[1];
        const name = toClassName($cols[0].textContent.trim());
        let value;
        if ($value.querySelector('a')) {
          const $as = [...$value.querySelectorAll('a')];
          if ($as.length === 1) {
            value = $as[0].href;
          } else {
            value = $as.map(($a) => $a.href);
          }
        } else if ($value.querySelector('p')) {
          const $ps = [...$value.querySelectorAll('p')];
          if ($ps.length === 1) {
            value = $ps[0].textContent.trim();
          } else {
            value = $ps.map(($p) => $p.textContent.trim());
          }
        } else value = $row.children[1].textContent.trim();
        config[name] = value;
      }
    }
  });
  return config;
}

export function yieldToMain() {
  return new Promise((r) => {
    setTimeout(r, 0);
  });
}

export function removeIrrelevantSections(area) {
  if (!area) return;
  const selector = area === document ? 'body > main > div' : ':scope > div';
  area.querySelectorAll(selector).forEach((section) => {
    const sectionMetaBlock = section.querySelector('div.section-metadata');
    if (sectionMetaBlock) {
      const sectionMeta = readBlockConfig(sectionMetaBlock);

      // section meant for different device
      let sectionRemove = !!(sectionMeta.audience
        && sectionMeta.audience.toLowerCase() !== document.body.dataset?.device);

      // section visibility steered over metadata
      if (!sectionRemove && sectionMeta.showwith !== undefined) {
        let showWithSearchParam = null;
        if (!['www.adobe.com'].includes(window.location.hostname)) {
          const urlParams = new URLSearchParams(window.location.search);
          showWithSearchParam = urlParams.get(`${sectionMeta.showwith.toLowerCase()}`)
            || urlParams.get(`${sectionMeta.showwith}`);
        }
        sectionRemove = showWithSearchParam !== null ? showWithSearchParam !== 'on' : getMetadata(sectionMeta.showwith.toLowerCase()) !== 'on';
      }
      if (sectionRemove) section.remove();
    }
  });

  // floating CTA vs page CTA with same text or link logics
  if (['yes', 'y', 'true', 'on'].includes(getMetadata('show-floating-cta')?.toLowerCase())) {
    const { device } = document.body.dataset;
    const textToTarget = getMetadata(`${device}-floating-cta-text`)?.trim() || getMetadata('main-cta-text')?.trim();
    const linkToTarget = getMetadata(`${device}-floating-cta-link`)?.trim() || getMetadata('main-cta-link')?.trim();
    if (textToTarget || linkToTarget) {
      const linkToTargetURL = new URL(linkToTarget);
      const sameUrlCTAs = Array.from(area.querySelectorAll('a:any-link'))
        .filter((a) => {
          try {
            const currURL = new URL(a.href);
            const sameText = a.textContent.trim() === textToTarget;
            const samePathname = currURL.pathname === linkToTargetURL?.pathname;
            const sameHash = currURL.hash === linkToTargetURL?.hash;
            const isNotInFloatingCta = !a.closest('.block')?.classList.contains('floating-button');
            const notFloatingCtaIgnore = !a.classList.contains('floating-cta-ignore');

            return (sameText || (samePathname && sameHash))
              && isNotInFloatingCta && notFloatingCtaIgnore;
          } catch (err) {
            window.lana?.log(err);
            return false;
          }
        });

      sameUrlCTAs.forEach((cta) => {
        cta.classList.add('same-fcta');
      });
    }
  }
}

/**
 * Decorates a block.
 * @param {Element} block The block element
 */
export async function decorateBlock(block) {
  const blockName = block.classList[0];
  if (blockName) {
    const section = block.closest('.section');
    if (section) section.classList.add(`${[...block.classList].join('-')}-container`);

    const showWith = [...block.classList].filter((c) => c.toLowerCase().startsWith('showwith'));
    // block visibility steered over metadata
    if (showWith.length) {
      let blockRemove = true;
      if (!['www.adobe.com'].includes(window.location.hostname)) {
        let showWithSearchParam = null;
        showWith.forEach((showWithClass) => {
          if (!blockRemove) return;
          const featureFlag = showWithClass.replace('showwith', '');
          const caseInsensitiveParams = {};
          for (const [name, value] of new URLSearchParams(window.location.search)) {
            caseInsensitiveParams[name.toLowerCase()] = value.toLowerCase();
          }
          showWithSearchParam = caseInsensitiveParams[featureFlag];
          blockRemove = showWithSearchParam ? showWithSearchParam !== 'on' : getMetadata(featureFlag.toLowerCase()) !== 'on';
        });
      }
      if (blockRemove) {
        block.remove();
        return;
      }
    }

    // begin CCX custom block option class handling
    // split and add options with a dash
    // (fullscreen-center -> fullscreen-center + fullscreen + center)
    const extra = [];
    const skipList = ['same-fcta', 'meta-powered'];
    block.classList.forEach((className, index) => {
      if (index === 0 || skipList.includes(className)) return; // block name or skip, no split
      const split = className.split('-');
      if (split.length > 1) {
        split.forEach((part) => {
          extra.push(part);
        });
      }
    });
    block.classList.add(...extra);
    // end CCX custom block option class handling

    block.classList.add('block');

    if (getMetadata('sheet-powered') === 'Y') {
      const { setBlockTheme } = await import('./content-replace.js');
      setBlockTheme(block);
    }
  }
}

export function decorateSVG(a) {
  const { textContent, href } = a;
  if (!(textContent.includes('.svg') || href.includes('.svg'))) return a;
  try {
    // Mine for URL and alt text
    const splitText = textContent.split('|');
    const textUrl = new URL(splitText.shift().trim());
    const altText = splitText.join('|').trim();

    // Relative link checking
    const hrefUrl = a.href.startsWith('/')
      ? new URL(`${window.location.origin}${a.href}`)
      : new URL(a.href);

    const src = textUrl.hostname.includes('.hlx.') ? textUrl.pathname : textUrl;

    const img = createTag('img', { loading: 'lazy', src });
    if (altText) img.alt = altText;
    const pic = createTag('picture', null, img);

    if (textUrl.pathname === hrefUrl.pathname) {
      a.parentElement.replaceChild(pic, a);
      return pic;
    }
    a.textContent = '';
    a.append(pic);
    return a;
  } catch (e) {
    window.lana.log(`Failed to create SVG: ${e.message}`);
    return a;
  }
}

function getExtension(path) {
  const pageName = path.split('/').pop();
  return pageName.includes('.') ? pageName.split('.').pop() : '';
}

export function localizeLink(
  href,
  originHostName = window.location.hostname,
  overrideDomain = false,
) {
  try {
    const url = new URL(href);
    const relative = url.hostname === originHostName;
    const processedHref = relative ? href.replace(url.origin, '') : href;
    const { hash } = url;
    if (hash.includes('#_dnt')) return processedHref.replace('#_dnt', '');
    const path = url.pathname;
    const extension = getExtension(path);
    const allowedExts = ['', 'html', 'json'];
    if (!allowedExts.includes(extension)) return processedHref;
    const { locale, locales, prodDomains } = getConfig();
    if (!locale || !locales) return processedHref;
    const isLocalizable = relative || (prodDomains && prodDomains.includes(url.hostname))
      || overrideDomain;
    if (!isLocalizable) return processedHref;
    const isLocalizedLink = path.startsWith(`/${LANGSTORE}`) || Object.keys(locales)
      .some((loc) => loc !== '' && (path.startsWith(`/${loc}/`) || path.endsWith(`/${loc}`)));
    if (isLocalizedLink) return processedHref;
    const urlPath = `${locale.prefix}${path}${url.search}${hash}`;
    return relative ? urlPath : `${url.origin}${urlPath}`;
  } catch (error) {
    return href;
  }
}

function appendHtmlToLink(link) {
  const { useDotHtml } = getConfig();
  if (!useDotHtml) return;
  const href = link.getAttribute('href');
  if (!href?.length) return;

  const { autoBlocks = [], htmlExclude = [] } = getConfig();

  const HAS_EXTENSION = /\..*$/;
  let url = { pathname: href };

  try {
    url = new URL(href, PAGE_URL);
  } catch (e) {
    /* do nothing */
  }

  if (!(href.startsWith('/') || href.startsWith(PAGE_URL.origin))
    || url.pathname?.endsWith('/')
    || href === PAGE_URL.origin
    || HAS_EXTENSION.test(href.split('/').pop())
    || htmlExclude?.some((excludeRe) => excludeRe.test(href))) {
    return;
  }

  const relativeAutoBlocks = autoBlocks
    .map((b) => Object.values(b)[0])
    .filter((b) => b.startsWith('/'));
  const isAutoblockLink = relativeAutoBlocks.some((block) => href.includes(block));
  if (isAutoblockLink) return;

  try {
    const linkUrl = new URL(href.startsWith('http') ? href : `${PAGE_URL.origin}${href}`);
    if (linkUrl.pathname && !linkUrl.pathname.endsWith('.html')) {
      linkUrl.pathname = `${linkUrl.pathname}.html`;
      link.setAttribute('href', href.startsWith('/')
        ? `${linkUrl.pathname}${linkUrl.search}${linkUrl.hash}`
        : linkUrl.href);
    }
  } catch (e) {
    window.lana?.log(`Error while attempting to append '.html' to ${link}: ${e}`);
  }
}

function decorateImageLinks(el) {
  const images = el.querySelectorAll('img[alt*="|"]');
  if (!images.length) return;
  [...images].forEach((img) => {
    const [source, alt, icon] = img.alt.split('|');
    try {
      const url = new URL(source.trim());
      const href = url.hostname.includes('.hlx.') ? `${url.pathname}${url.hash}` : url.href;
      if (alt?.trim().length) img.alt = alt.trim();
      const pic = img.closest('picture');
      const picParent = pic.parentElement;
      const aTag = createTag('a', { href, class: 'image-link' });
      picParent.insertBefore(aTag, pic);
      if (icon) {
        import('./image-video-link.js').then((mod) => mod.default(picParent, aTag, icon));
      } else {
        aTag.append(pic);
      }
    } catch (e) {
      window.lana.log(`Error: ${e.message} '${source.trim()}'`);
    }
  });
}

export function decorateAutoBlock(a) {
  const config = getConfig();
  const { hostname } = window.location;
  let url;
  try {
    url = new URL(a.href);
  } catch (e) {
    window.lana?.log(`Cannot make URL from decorateAutoBlock - ${a?.href}: ${e.toString()}`);
    return false;
  }

  const href = hostname === url.hostname
    ? `${url.pathname}${url.search}${url.hash}`
    : a.href;

  return config.autoBlocks.find((candidate) => {
    const key = Object.keys(candidate)[0];
    const match = href.includes(candidate[key]);
    if (!match) return false;

    if (key === 'pdf-viewer' && !a.textContent.includes('.pdf')) {
      a.target = '_blank';
      return false;
    }

    if (key === 'fragment') {
      if (a.href === window.location.href) {
        return false;
      }

      const isInlineFrag = url.hash.includes('#_inline');
      if (url.hash === '' || isInlineFrag) {
        const { parentElement } = a;
        const { nodeName, innerHTML } = parentElement;
        const noText = innerHTML === a.outerHTML;
        if (noText && nodeName === 'P') {
          const div = createTag('div', null, a);
          parentElement.parentElement.replaceChild(div, parentElement);
        }
      }

      // previewing a fragment page with mp4 video
      if (a.textContent.match('media_.*.mp4')) {
        a.className = 'video link-block';
        return false;
      }

      // Modals
      if (url.hash !== '' && !isInlineFrag) {
        a.dataset.modalPath = url.pathname;
        a.dataset.modalHash = url.hash;
        a.href = url.hash;
        a.className = `modal link-block ${[...a.classList].join(' ')}`;
        return true;
      }
    }

    // slack uploaded mp4s
    if (key === 'video' && !a.textContent.match('media_.*.mp4')) {
      return false;
    }
    a.className = `${key} link-block`;
    return true;
  });
}

export function decorateLinks(el) {
  decorateImageLinks(el);
  const anchors = el.getElementsByTagName('a');
  return [...anchors].reduce((rdx, a) => {
    appendHtmlToLink(a);
    a.href = localizeLink(a.href);
    decorateSVG(a);
    if (a.href.includes('#_blank')) {
      a.setAttribute('target', '_blank');
      a.href = a.href.replace('#_blank', '');
    }
    if (a.href.includes('#_dnb')) {
      a.href = a.href.replace('#_dnb', '');
    } else {
      const autoBlock = decorateAutoBlock(a);
      if (autoBlock) {
        rdx.push(a);
      }
    }
    return rdx;
  }, []);
}

function decorateContent(el) {
  const children = [el];
  let child = el;
  while (child) {
    child = child.nextElementSibling;
    if (child && child.nodeName !== 'DIV') {
      children.push(child);
    } else {
      break;
    }
  }
  const block = document.createElement('div');
  // FIXME: in Milo, this className is 'content'
  block.className = 'default-content-wrapper';
  block.append(...children);
  block.dataset.block = '';
  return block;
}

export function decorateDefaults(el) {
  const firstChild = ':scope > *:not(div):first-child';
  const afterBlock = ':scope > div + *:not(div)';
  const children = el.querySelectorAll(`${firstChild}, ${afterBlock}`);
  children.forEach((child) => {
    const prev = child.previousElementSibling;
    const content = decorateContent(child);
    if (prev) {
      prev.insertAdjacentElement('afterend', content);
    } else {
      el.insertAdjacentElement('afterbegin', content);
    }
  });
}

export function filterDuplicatedLinkBlocks(blocks) {
  if (!blocks?.length) return [];
  const uniqueModalKeys = new Set();
  const uniqueBlocks = [];
  for (const obj of blocks) {
    if (obj.className.includes('modal')) {
      const key = `${obj.dataset.modalHash}-${obj.dataset.modalPath}`;
      if (!uniqueModalKeys.has(key)) {
        uniqueModalKeys.add(key);
        uniqueBlocks.push(obj);
      }
    } else {
      uniqueBlocks.push(obj);
    }
  }
  return uniqueBlocks;
}

// TODO: different from milo as it doesnot inline consumer blocks
function decorateSection(section, idx) {
  let links = decorateLinks(section);
  decorateDefaults(section);
  // TODO: not in milo
  /* process section metadata */
  const sectionMeta = section.querySelector('div.section-metadata');
  if (sectionMeta) {
    const meta = readBlockConfig(sectionMeta);
    const keys = Object.keys(meta);
    keys.forEach((key) => {
      if (key === 'style') {
        section.classList.add(...meta.style.split(', ').map(toClassName));
      } else if (key === 'anchor') {
        section.id = toClassName(meta.anchor);
      } else if (key === 'background') {
        section.style.background = meta.background;
      } else {
        section.dataset[key] = meta[key];
      }
    });
    sectionMeta.remove();
  }
  const blocks = section.querySelectorAll(':scope > div[class]:not(.default-content-wrapper)');

  const blockLinks = [...blocks].reduce((blkLinks, block) => {
    links.filter((link) => block.contains(link))
      .forEach((link) => {
        if (link.classList.contains('link-block')) {
          blkLinks.autoBlocks.push(link);
        }
      });
    return blkLinks;
  }, { inlineFrags: [], autoBlocks: [] });

  const embeddedLinks = [...blockLinks.inlineFrags, ...blockLinks.autoBlocks];
  if (embeddedLinks.length) {
    links = links.filter((link) => !embeddedLinks.includes(link));
  }
  section.classList.add('section', 'section-wrapper'); // TODO: section-wrapper backcomp
  section.dataset.status = 'decorated';
  section.dataset.idx = idx;
  return {
    blocks: [...links, ...blocks],
    el: section,
    idx,
    preloadLinks: filterDuplicatedLinkBlocks(blockLinks.autoBlocks),
  };
}

/**
 * Decorates all sections in a container element.
 * @param {Element} el The container element
 * @param {Boolean} isDoc Is document or fragment
 */
function decorateSections(el, isDoc) {
  const selector = isDoc ? 'body > main > div' : ':scope > div';
  return [...el.querySelectorAll(selector)].map(decorateSection);
}

/**
 * Updates all section status in a container element.
 * @param {Element} main The container element
 */
export function updateSectionsStatus(main) {
  const sections = [...main.querySelectorAll(':scope > div.section')];
  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i];
    const status = section.getAttribute('data-section-status');
    if (status !== 'loaded') {
      const loadingBlock = section.querySelector('.block[data-block-status="initialized"], .block[data-block-status="loading"]');
      if (loadingBlock) {
        section.setAttribute('data-section-status', 'loading');
        break;
      } else {
        section.setAttribute('data-section-status', 'loaded');
      }
    }
  }
}

export function getCookie(cname) {
  const name = `${cname}=`;
  const decodedCookie = decodeURIComponent(document.cookie);
  const ca = decodedCookie.split(';');
  for (let i = 0; i < ca.length; i += 1) {
    let c = ca[i];
    while (c.charAt(0) === ' ') {
      c = c.substring(1);
    }
    if (c.indexOf(name) === 0) {
      return c.substring(name.length, c.length);
    }
  }
  return '';
}

// TODO probably want to replace / merge this with new getEnv method
export function getHelixEnv() {
  let envName = sessionStorage.getItem('helix-env');
  if (!envName) {
    envName = 'stage';
    if (window.spark?.hostname === 'www.adobe.com') envName = 'prod';
  }
  const envs = {
    stage: {
      commerce: 'commerce-stg.adobe.com',
      adminconsole: 'stage.adminconsole.adobe.com',
      spark: 'stage.projectx.corp.adobe.com',
    },
    prod: {
      commerce: 'commerce.adobe.com',
      spark: 'express.adobe.com',
      adminconsole: 'adminconsole.adobe.com',
    },
  };
  const env = envs[envName];

  const overrideItem = sessionStorage.getItem('helix-env-overrides');
  if (overrideItem) {
    const overrides = JSON.parse(overrideItem);
    const keys = Object.keys(overrides);
    env.overrides = keys;

    for (const a of keys) {
      env[a] = overrides[a];
    }
  }

  if (env) {
    env.name = envName;
  }
  return env;
}

export async function fetchRelevantRows(path) {
  if (!window.relevantRows) {
    try {
      const { prefix } = getConfig().locale;
      const resp = await fetch(`${prefix}/express/relevant-rows.json`);
      window.relevantRows = resp.ok ? (await resp.json()).data : [];
    } catch {
      const resp = await fetch('/express/relevant-rows.json');
      window.relevantRows = resp.ok ? (await resp.json()).data : [];
    }
  }

  if (window.relevantRows.length) {
    const relevantRow = window.relevantRows.find((p) => path === p.path);
    const env = getHelixEnv();

    if (env && env.name === 'stage') {
      return relevantRow || null;
    }

    return relevantRow && relevantRow.live !== 'N' ? relevantRow : null;
  }

  return null;
}

export function addBlockClasses($block, classNames) {
  const $rows = Array.from($block.children);
  $rows.forEach(($row) => {
    classNames.forEach((className, i) => {
      $row.children[i].className = className;
    });
  });
}

// function addDivClasses($element, selector, classes) {
//   const $children = $element.querySelectorAll(selector);
//   $children.forEach(($div, i) => {
//     $div.classList.add(classes[i]);
//   });
// }

function decorateHeaderAndFooter() {
  const header = document.querySelector('header');

  header.addEventListener('click', (event) => {
    if (event.target.id === 'feds-topnav') {
      const root = window.location.href.split('/express/')[0];
      window.location.href = `${root}/express/`;
    }
  });

  const headerMeta = getMetadata('header');
  if (headerMeta !== 'off') header.innerHTML = '<div id="feds-header"></div>';
  else header.remove();
  const footerMeta = getMetadata('footer');
  const footer = document.querySelector('footer');
  if (footerMeta !== 'off') {
    footer.innerHTML = `
      <div id="feds-footer"></div>
    `;
    footer.setAttribute('data-status', 'loading');
  } else footer.remove();
}

export function loadLink(href, {
  as,
  callback,
  crossorigin,
  rel,
} = {}) {
  let link = document.head.querySelector(`link[href="${href}"]`);
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', rel);
    if (as) link.setAttribute('as', as);
    if (crossorigin) link.setAttribute('crossorigin', crossorigin);
    link.setAttribute('href', href);
    if (callback) {
      link.onload = (e) => callback(e.type);
      link.onerror = (e) => callback(e.type);
    }
    document.head.appendChild(link);
  } else if (callback) {
    callback('noop');
  }
  return link;
}

export function loadStyle(href, callback) {
  return loadLink(href, { rel: 'stylesheet', callback });
}

function resolveFragments() {
  Array.from(document.querySelectorAll('main > div div'))
    .filter(($cell) => $cell.childElementCount === 0)
    .filter(($cell) => /^\[[A-Za-z\d\s\-_—]+\]$/mg.test($cell.textContent.trim()))
    .forEach(($cell) => {
      const marker = $cell.textContent.trim()
        .substring(1, $cell.textContent.trim().length - 1)
        .toLocaleLowerCase()
        .trim();
      // find the fragment with the marker
      const $marker = Array.from(document.querySelectorAll('main > div h3'))
        .find(($title) => $title.textContent.trim().toLocaleLowerCase() === marker);
      if (!$marker) {
        return;
      }
      let $fragment = $marker.closest('main > div');
      const $markerContainer = $marker.parentNode;
      if ($markerContainer.children.length === 1) {
        // empty section with marker, remove and use content from next section
        const $emptyFragment = $markerContainer.parentNode;
        $fragment = $emptyFragment.nextElementSibling;
        $emptyFragment.remove();
      }
      if (!$fragment) {
        return;
      }
      setTimeout(() => {
        $cell.innerHTML = '';
        Array.from($fragment.children).forEach(($elem) => $cell.appendChild($elem));
        $marker.remove();
        $fragment.remove();
      }, 500);
    });
}

export function scrollToHashedElement(hash) {
  if (!hash) return;
  const elementId = decodeURIComponent(hash).slice(1);
  let targetElement;
  try {
    targetElement = document.querySelector(`#${elementId}:not(.dialog-modal)`);
  } catch (e) {
    window.lana?.log(`Could not query element because of invalid hash - ${elementId}: ${e.toString()}`);
  }
  if (!targetElement) return;
  const bufferHeight = document.querySelector('.global-navigation')?.offsetHeight || 0;
  const topOffset = targetElement.getBoundingClientRect().top + window.pageYOffset;
  window.scrollTo({
    top: topOffset - bufferHeight,
    behavior: 'smooth',
  });
}

/**
 * Builds a block DOM Element from a two dimensional array
 * @param {string} blockName name of the block
 * @param {any} content two dimensional array or string or object of content
 */
export function buildBlock(blockName, content) {
  const table = Array.isArray(content) ? content : [[content]];
  const blockEl = document.createElement('div');
  // build image block nested div structure
  blockEl.classList.add(blockName);
  table.forEach((row) => {
    const rowEl = document.createElement('div');
    row.forEach((col) => {
      const colEl = document.createElement('div');
      const vals = col.elems ? col.elems : [col];
      vals.forEach((val) => {
        if (val) {
          if (typeof val === 'string') {
            colEl.innerHTML += val;
          } else {
            colEl.appendChild(val);
          }
        }
      });
      rowEl.appendChild(colEl);
    });
    blockEl.appendChild(rowEl);
  });
  return (blockEl);
}

async function loadAndExecute(cssPath, jsPath, block, blockName, eager) {
  const cssLoaded = new Promise((resolve) => {
    loadStyle(cssPath, resolve);
  });
  const scriptLoaded = new Promise((resolve) => {
    (async () => {
      try {
        const { default: init } = await import(jsPath);
        await init(block, blockName, document, eager);
      } catch (err) {
        // eslint-disable-next-line no-console
        window.lana.log(`failed to load module for ${blockName}: ${err.message}\nError Stack:${err.stack}`, {
          sampleRate: 1,
          tags: 'module',
        });
      }
      resolve();
    })();
  });
  await Promise.all([cssLoaded, scriptLoaded]);
}

/**
 * Loads JS and CSS for a block.
 * @param {Element} block The block element
 */
export async function loadBlock(block, eager = false) {
  // TODO: different from milo as we have legacy decorateBlock()
  await decorateBlock(block);
  if (!(block.getAttribute('data-block-status') === 'loading' || block.getAttribute('data-block-status') === 'loaded')) {
    block.setAttribute('data-block-status', 'loading');
    const blockName = block.getAttribute('data-block-name') || block.classList[0];
    let cssPath = `/express/blocks/${blockName}/${blockName}.css`;
    let jsPath = `/express/blocks/${blockName}/${blockName}.js`;

    if (window.hlx.experiment && window.hlx.experiment.run) {
      const { experiment } = window.hlx;
      if (experiment.selectedVariant !== 'control') {
        const { control } = experiment.variants;
        if (control && control.blocks && control.blocks.includes(blockName)) {
          const blockIndex = control.blocks.indexOf(blockName);
          const variant = experiment.variants[experiment.selectedVariant];
          const blockPath = variant.blocks[blockIndex];
          cssPath = `/express/experiments/${experiment.id}/${blockPath}/${blockName}.css`;
          jsPath = `/express/experiments/${experiment.id}/${blockPath}/${blockName}.js`;
        }
      }
    }

    await loadAndExecute(cssPath, jsPath, block, blockName, eager);
    block.setAttribute('data-block-status', 'loaded');
  }
  return block;
}

export const loadScript = (url, type) => new Promise((resolve, reject) => {
  let script = document.querySelector(`head > script[src="${url}"]`);
  if (!script) {
    const { head } = document;
    script = document.createElement('script');
    script.setAttribute('src', url);
    if (type) {
      script.setAttribute('type', type);
    }
    head.append(script);
  }

  if (script.dataset.loaded) {
    resolve(script);
    return;
  }

  const onScript = (event) => {
    script.removeEventListener('load', onScript);
    script.removeEventListener('error', onScript);

    if (event.type === 'error') {
      reject(new Error(`error loading script: ${script.src}`));
    } else if (event.type === 'load') {
      script.dataset.loaded = true;
      resolve(script);
    }
  };

  script.addEventListener('load', onScript);
  script.addEventListener('error', onScript);
});

/**
 * fetches the string variables.
 * @returns {object} localized variables
 */

export async function fetchPlaceholders() {
 window.placeholders = {
  "total": 215,
  "offset": 0,
  "limit": 215,
  "data": [
    {
      "key": "edit this template",
      "value": "Edit this template",
      "note": ""
    },
    {
      "key": "view all",
      "value": "View all",
      "note": ""
    },
    {
      "key": "subscription",
      "value": "Subscription",
      "note": ""
    },
    {
      "key": "load more articles",
      "value": "Load more articles",
      "note": ""
    },
    {
      "key": "express",
      "value": "Home",
      "note": ""
    },
    {
      "key": "creative-cloud-express",
      "value": "Adobe Express logo",
      "note": "alt text"
    },
    {
      "key": "cc-express-logo",
      "value": "Adobe Express logo",
      "note": "alt text"
    },
    {
      "key": "rush",
      "value": "Adobe Premiere Rush logo",
      "note": "alt text"
    },
    {
      "key": "psx",
      "value": "Adobe Photoshop Express logo",
      "note": "alt text"
    },
    {
      "key": "ps-express",
      "value": "Adobe Photoshop Express logo",
      "note": "alt text"
    },
    {
      "key": "facebook",
      "value": "Facebook logo",
      "note": "alt text"
    },
    {
      "key": "youtube",
      "value": "YouTube logo",
      "note": "alt text"
    },
    {
      "key": "instagram",
      "value": "Instagram logo",
      "note": "alt text"
    },
    {
      "key": "tiktok",
      "value": "Tiktok logo",
      "note": "alt text"
    },
    {
      "key": "snapchat",
      "value": "Snapchat logo",
      "note": "alt text"
    },
    {
      "key": "pinterest",
      "value": "Pinterest logo",
      "note": "alt text"
    },
    {
      "key": "twitter",
      "value": "Twitter logo",
      "note": "alt text"
    },
    {
      "key": "linkedin",
      "value": "LinkedIn logo",
      "note": "alt text"
    },
    {
      "key": "sparkpage",
      "value": "Spark page",
      "note": "alt text"
    },
    {
      "key": "sparkvideo",
      "value": "Spark video",
      "note": "alt text"
    },
    {
      "key": "adobe-stock",
      "value": "Adobe Stock",
      "note": "alt text"
    },
    {
      "key": "adobefonts",
      "value": "Adobe Fonts",
      "note": "alt text"
    },
    {
      "key": "premium",
      "value": "Premium",
      "note": "alt text"
    },
    {
      "key": "pricingpremium",
      "value": "Premium pricing",
      "note": "alt text"
    },
    {
      "key": "pricingfree",
      "value": "Free pricing",
      "note": "alt text"
    },
    {
      "key": "users",
      "value": "Users",
      "note": "alt text"
    },
    {
      "key": "library",
      "value": "Library",
      "note": "alt text"
    },
    {
      "key": "libraries",
      "value": "Libraries",
      "note": "alt text"
    },
    {
      "key": "templates",
      "value": "Templates",
      "note": "alt text"
    },
    {
      "key": "premium-templates",
      "value": "Premium templates",
      "note": "alt text"
    },
    {
      "key": "brand",
      "value": "Brand",
      "note": "alt text"
    },
    {
      "key": "brandswitch",
      "value": "Switch brand",
      "note": "alt text"
    },
    {
      "key": "brand-libraries",
      "value": "Brand libraries",
      "note": "alt text"
    },
    {
      "key": "incredibly-easy",
      "value": "Incredibly easy",
      "note": "alt text"
    },
    {
      "key": "magicwand",
      "value": "Magic wand",
      "note": "alt text"
    },
    {
      "key": "blank",
      "value": "Blank",
      "note": "alt text"
    },
    {
      "key": "stickers",
      "value": "Stickers",
      "note": "alt text"
    },
    {
      "key": "elements",
      "value": "Elements",
      "note": "alt text"
    },
    {
      "key": "text",
      "value": "Text",
      "note": "alt text"
    },
    {
      "key": "image",
      "value": "Image",
      "note": "alt text"
    },
    {
      "key": "photos",
      "value": "Photos",
      "note": "alt text"
    },
    {
      "key": "photoeffects",
      "value": "Photo effects",
      "note": "alt text"
    },
    {
      "key": "animation",
      "value": "Animation",
      "note": "alt text"
    },
    {
      "key": "resize",
      "value": "Resize",
      "note": "alt text"
    },
    {
      "key": "trim-video",
      "value": "Trim video",
      "note": "alt text"
    },
    {
      "key": "resize-video",
      "value": "Resize video",
      "note": "alt text"
    },
    {
      "key": "crop-video",
      "value": "Crop video",
      "note": "alt text"
    },
    {
      "key": "mergevideo",
      "value": "Merge video",
      "note": "alt text"
    },
    {
      "key": "reversevideo",
      "value": "Reverse video",
      "note": "alt text"
    },
    {
      "key": "changespeed",
      "value": "Change speed",
      "note": "alt text"
    },
    {
      "key": "muteaudio",
      "value": "Mute audio",
      "note": "alt text"
    },
    {
      "key": "play",
      "value": "Play",
      "note": "alt text"
    },
    {
      "key": "convert",
      "value": "Convert",
      "note": "alt text"
    },
    {
      "key": "remove-watermark",
      "value": "Remove watermark",
      "note": "alt text"
    },
    {
      "key": "remove-background",
      "value": "Remove background",
      "note": "alt text"
    },
    {
      "key": "premium-remove-background",
      "value": "Premium remove background",
      "note": "alt text"
    },
    {
      "key": "up-download",
      "value": "Download",
      "note": "alt text"
    },
    {
      "key": "upload",
      "value": "Upload",
      "note": "alt text"
    },
    {
      "key": "download",
      "value": "Download",
      "note": "alt text"
    },
    {
      "key": "cloud-storage",
      "value": "Cloud storage",
      "note": "alt text"
    },
    {
      "key": "privacy",
      "value": "Privacy",
      "note": "alt text"
    },
    {
      "key": "certified",
      "value": "Certified",
      "note": "alt text"
    },
    {
      "key": "chevron",
      "value": "Chevron",
      "note": "alt text"
    },
    {
      "key": "globe",
      "value": "Globe",
      "note": "alt text"
    },
    {
      "key": "check",
      "value": "Check",
      "note": "alt text"
    },
    {
      "key": "desktop-round",
      "value": "Desktop",
      "note": "alt text"
    },
    {
      "key": "mobile-round",
      "value": "v",
      "note": "alt text"
    },
    {
      "key": "webmobile",
      "value": "Web and mobile",
      "note": "alt text"
    },
    {
      "key": "cursor-browser",
      "value": "Cursor browser",
      "note": "alt text"
    },
    {
      "key": "see-more",
      "value": "See more",
      "note": "Quick action cards block (expand)"
    },
    {
      "key": "see-less",
      "value": "See less",
      "note": "Quick action cards block (collapse)"
    },
    {
      "key": "one-star-rating",
      "value": "Disappointing",
      "note": "Ratings block"
    },
    {
      "key": "one-star-rating-text",
      "value": "We're sorry to hear that. What went wrong?",
      "note": "Ratings block"
    },
    {
      "key": "one-star-rating-input",
      "value": "Your feedback (Required)",
      "note": "Ratings block"
    },
    {
      "key": "two-star-rating",
      "value": "Insufficient",
      "note": "Ratings block"
    },
    {
      "key": "two-star-rating-text",
      "value": "We value your feedback. How can we improve?",
      "note": "Ratings block"
    },
    {
      "key": "two-star-rating-input",
      "value": "Your feedback (Required)",
      "note": "Ratings block"
    },
    {
      "key": "three-star-rating",
      "value": "Sufficient",
      "note": "Ratings block"
    },
    {
      "key": "three-star-rating-text",
      "value": "Sufficient is good, but what would make it great?",
      "note": "Ratings block"
    },
    {
      "key": "three-star-rating-input",
      "value": "Your feedback (Required)",
      "note": "Ratings block"
    },
    {
      "key": "four-star-rating",
      "value": "Helpful",
      "note": "Ratings block"
    },
    {
      "key": "four-star-rating-text",
      "value": "Was there more we could do to be better?",
      "note": "Ratings block"
    },
    {
      "key": "four-star-rating-input",
      "value": "Your feedback (Optional)",
      "note": "Ratings block"
    },
    {
      "key": "five-star-rating",
      "value": "Amazing",
      "note": "Ratings block"
    },
    {
      "key": "five-star-rating-text",
      "value": "That's great. Could you tell us what you loved?",
      "note": "Ratings block"
    },
    {
      "key": "five-star-rating-input",
      "value": "Your feedback (Optional)",
      "note": "Ratings block"
    },
    {
      "key": "rating-submit",
      "value": "Submit rating",
      "note": "Ratings block"
    },
    {
      "key": "rating-submission-title",
      "value": "Thank you for your feedback. \uD83D\uDC4D",
      "note": "Ratings block"
    },
    {
      "key": "rating-submission-text",
      "value": "We\u2019re always improving our tools to work better for you.",
      "note": "Ratings block"
    },
    {
      "key": "rating-default-title",
      "value": "Rate our Quick Action",
      "note": "Ratings block"
    },
    {
      "key": "rating-action-not-used",
      "value": "You need to use the Quick Action before you can rate it.",
      "note": "Ratings block"
    },
    {
      "key": "rating-already-submitted-title",
      "value": "This Quick Action is rated",
      "note": "Ratings block"
    },
    {
      "key": "rating-already-submitted-text",
      "value": "You have already submitted your rating for this action. Thank you for your feedback!",
      "note": "Ratings block"
    },
    {
      "key": "rating-votes",
      "value": "Votes",
      "note": "Ratings block"
    },
    {
      "key": "subscribe-cta",
      "value": "Get notified",
      "note": "Email subscribe block"
    },
    {
      "key": "free-plan-features-1",
      "value": "Free to use",
      "note": "Free plan widget"
    },
    {
      "key": "free-plan-check-1",
      "value": "Free to use",
      "note": "Free plan widget"
    },
    {
      "key": "free-plan-check-2",
      "value": "No credit card required",
      "note": "Free plan widget"
    },
    {
      "key": "entitled-plan-tag",
      "value": "Your membership includes access to all premium features, templates, and assets",
      "note": "Entitled plan widget"
    },
    {
      "key": "load-more",
      "value": "Load more",
      "note": "API powered grid button"
    },
    {
      "key": "tag-copied",
      "value": "Copied to clipboard",
      "note": "Green tag on app store blade block"
    },
    {
      "key": "apple-store-rating-score",
      "value": "4.9",
      "note": "App Store Blocks"
    },
    {
      "key": "apple-store-rating-count",
      "value": "233.8k",
      "note": "App Store Blocks"
    },
    {
      "key": "google-store-rating-score",
      "value": "4.6",
      "note": "App Store Blocks"
    },
    {
      "key": "google-store-rating-count",
      "value": "117k",
      "note": "App Store Blocks"
    },
    {
      "key": "app-store-ratings",
      "value": "4.9, 233.8k ratings; 4.6, 117k ratings; https://adobesparkpost.app.link/GJrBPFUWBBb",
      "note": "Apple store ratings ollowed by Android store ratings followed by app store link. score, number of ratings, separated by semi colon"
    },
    {
      "key": "app-store-blade-follow-block",
      "value": "link-list-container",
      "note": "Designate which block after which blade will be rendered"
    },
    {
      "key": "app-store-highlight-follow-block",
      "value": "columns-fullsize-center-container",
      "note": "Designate which block after which highlight will be rendered"
    },
    {
      "key": "free-in-app",
      "value": "Free in app",
      "note": "Free in app Badge"
    },
    {
      "key": "api-powered-grid-heading",
      "value": "Templates",
      "note": "API powered grid heading"
    },
    {
      "key": "choose-your-path-cc",
      "value": "See what you can do with Creative Cloud",
      "note": "Choose your path block"
    },
    {
      "key": "choose-your-path-express",
      "value": "Make a new project with Adobe Express",
      "note": "Choose your path block"
    },
    {
      "key": "learn-more",
      "value": "Learn more",
      "note": "free plan widget attachment"
    },
    {
      "key": "template-search-heading-singular",
      "value": "{{quantity}} {{type}} template.",
      "note": "templates seo pages api template grid heading text. search page specific with sigular result."
    },
    {
      "key": "template-search-heading-plural",
      "value": "{{quantity}} {{type}} templates.",
      "note": "templates seo pages api template grid heading text. search page specific."
    },
    {
      "key": "template-placeholder",
      "value": "{{quantity}} {{type}} templates",
      "note": "This is the placeholder for the toolbar title of the API powered SEO pages"
    },
    {
      "key": "template-search-placeholder",
      "value": "Search for over 50,000 templates",
      "note": ""
    },
    {
      "key": "template-filter-premium",
      "value": "{\n\"Premium & Free\":\"remove\",\n\"Free\":\"false\",\n\"Premium\":\"true\"\n}",
      "note": "Options for template list filtering. (Important: only change the text before the colons or the order of the pair)"
    },
    {
      "key": "template-filter-premium-icons",
      "value": "template-premium-and-free, template-free, template-premium",
      "note": ""
    },
    {
      "key": "template-filter-animated",
      "value": "{\n\"Static & Animated\":\"remove\",\n\"Static\":\"false\",\n\"Animated\":\"true\"\n}",
      "note": "Options for template list filtering. (Important: only change the text before the colons or the order of the pair)"
    },
    {
      "key": "template-filter-animated-icons",
      "value": "template-static-and-animated, template-static, template-animated",
      "note": ""
    },
    {
      "key": "template-x-sort",
      "value": "{\n\"Most Relevant\":\"\",\n\"Most Viewed\":\"&orderBy=-remixCount\",\n\"Rare & Original\":\"&orderBy=remixCount\",\n\"Newest to Oldest\":\"&orderBy=-createDate\",\n\"Oldest to Newest\":\"&orderBy=createDate\"\n}",
      "note": "Options for template list sorting. (Important: only change the text before the colons or the order of the pair)"
    },
    {
      "key": "template-sort",
      "value": "{\n\"Most Viewed\":\"-_score,-remixCount\",\n\"Rare & Original\":\"-_score,remixCount\",\n\"Newest to Oldest\":\"-_score,-created\",\n\"Oldest to Newest\":\"-_score,created\"\n}",
      "note": "Options for template list sorting. (Important: only change the text before the colons or the order of the pair)"
    },
    {
      "key": "template-x-sort-icons",
      "value": "sort, visibility-on, visibility-off, order-dsc, order-asc",
      "note": ""
    },
    {
      "key": "template-sort-icons",
      "value": "visibility-on, visibility-off, order-dsc, order-asc",
      "note": ""
    },
    {
      "key": "filter",
      "value": "Filter",
      "note": "translate word \"filter\""
    },
    {
      "key": "sort",
      "value": "Sort",
      "note": "translate word \"sort\""
    },
    {
      "key": "jump-to-category",
      "value": "see related designs",
      "note": "translate phrase \"see related \""
    },
    {
      "key": "apply-filters",
      "value": "Apply Filters",
      "note": "translate phrase \"apply filters\""
    },
    {
      "key": "free",
      "value": "Apply Filters",
      "note": "traslate word \"free\""
    },
    {
      "key": "static",
      "value": "Static",
      "note": ""
    },
    {
      "key": "animated",
      "value": "Animated",
      "note": ""
    },
    {
      "key": "versus-shorthand",
      "value": "vs",
      "note": ""
    },
    {
      "key": "search-from-scratch",
      "value": "Create {{template-type}} from scratch in the app.",
      "note": ""
    },
    {
      "key": "suggestions",
      "value": "Suggestions",
      "note": "translate word \"suggestions\""
    },
    {
      "key": "show-less",
      "value": "Show less",
      "note": "translate phrase \"show less\""
    },
    {
      "key": "show-more",
      "value": "Show more",
      "note": "translate phrase \"show more\""
    },
    {
      "key": "jump-to-category",
      "value": "Jump to Category",
      "note": ""
    },
    {
      "key": "search",
      "value": "Search",
      "note": "Enter Key Hint for Search Input"
    },
    {
      "key": "task-categories",
      "value": "{\n\"All\":\"''\",\n\"Banners\":\"banner\",\n\"Brochures\":\"brochure\",\n\"Cards\":\"card\",\n\"Facebook post\":\"facebook post\",\n\"Facebook story\":\"facebook story\",\n\"Flyer\":\"flyer\",\n\"Greeting card\":\"greeting card\",\n\"Instagram story\":\"instagram story\",\n\"Invitation\":\"invitation\",\n\"Logo\":\"logo\",\n\"Poster\":\"poster\",\n\"Presentation slide\":\"presentation slide\",\n\"Resume\":\"resume\"\n}",
      "note": "Options for jump to category list.  (Important: only translate the text before the colons or the order of the pair)"
    },
    {
      "key": "x-task-categories",
      "value": "{\n\"All\":\"\",\n\"Banners\":\"youtube-banner, twitch-banner\",\n\"Brochures\":\"brochure\",\n\"Cards\":\"card-greeting\",\n\"Facebook post\":\"facebook-post\",\n\"Facebook story\":\"facebook-story\",\n\"Flyer\":\"flyer\",\n\"Greeting card\":\"card-greeting\",\n\"Instagram story\":\"instagram-story\",\n\"Invitation\":\"invitation\",\n\"Logo\":\"logo\",\n\"Poster\":\"poster\",\n\"Presentation slide\":\"presentation\",\n\"Resume\":\"resume\"\n}",
      "note": "Options for jump to category list.  (Important: only translate the text before the colons or the order of the pair)"
    },
    {
      "key": "x-task-name-mapping",
      "value": "{\n\"\": [\"templates\", \"template\"],\n\"flyer\": [\"flyer\", \"flyers\"],\n\"youtube-banner, twitch-banner\": [\"banner\", \"banners\"],\n\"infographic\": [\"infographic\", \"infographics\"],\n\"brochure\": [\"brochure\", \"brochures\"],\n\"facebook-page-cover\": [\"facebook page cover\", \"facebook page covers\", \"facebook pages cover\", \"facebook pages covers\"],\n\"youtube-banner\": [\"youtube channel art\", \"youtube channel arts\", \"youtube arts\", \"youtube art\"],\n\"calendar\": [\"calendar\", \"calendars\"],\n\"certificate\": [\"certificate\", \"certificates\"],\n\"cover\": [\"cover\", \"covers\"],\n\"invitation\": [\"invitation\", \"invitations\"],\n\"invoice\": [\"invoice\", \"invoices\"],\n\"label\": [\"label\", \"labels\"],\n\"logo\": [\"logo\", \"logos\"],\n\"meme\": [\"meme\", \"memes\"],\n\"menu\": [\"menu\", \"menus\"],\n\"newsletter\": [\"newsletter\", \"newsletters\"],\n\"poster\": [\"poster\", \"posters\"],\n\"photo-book\": [\"photo book\", \"photo books\"],\n\"presentation\": [\"presentation slide\", \"presentation slides\", \"presentations slide\", \"presentation\", \"presentations\"],\n\"resume\": [\"resume\", \"resumes\"],\n\"facebook-ad\": [\"facebook ad\", \"facebook ads\"],\n\"planner\": [\"planner\", \"planners\"],\n\"background\": [\"background\", \"backgrounds\"],\n\"twitter-header\": [\"twitter header\", \"twitter headers\"],\n\"business-card\": [\"business card\", \"business cards\"],\n\"proposal\": [\"proposal\", \"proposals\"],\n\"card-greeting\": [\"card\", \"card greeting\", \"card greetings\", \"cards\"],\n\"graphic-organizer\": [\"graphic organizer\", \"graphic organizers\", \"graphics organizer\"],\n\"checklist\": [\"checklist\", \"checklists\"],\n\"coupon\": [\"coupon\", \"coupons\"],\n\"instagram-story\": [\"instagram story\", \"instagram stories\"],\n\"instagram-square-post\": [\"instagram square post\", \"instagram post sqaure\", \"instagram post sqaures\",  \"instagram-square-post\", \"instagram posts sqaure\"],\n\"instagram-reel\": [\"instagram reel\", \"instagram reels\"],\n\"letter\": [\"letter\", \"letters\"],\n\"letterhead\": [\"letterhead\", \"letterheads\"],\n\"facebook-post\": [\"facebook post\", \"facebook posts\"],\n\"instagram-post\": [\"instagram post\", \"instagram posts\"],\n\"program\": [\"program\", \"programs\"],\n\"schedule\": [\"schedule\", \"schedules\"],\n\"thumbnail\": [\"thumbnail\", \"thumbnails\"],\n\"wallpaper\": [\"wallpaper\", \"wallpapers\"],\n\"youtube-thumbnail\": [\"youtube thumbnail\", \"youtube end screen\", \"youtube end screens\"],\n\"graph\": [\"graph\", \"graphs\"],\n\"bookmark\": [\"bookmark\", \"bookmarks\"],\n\"gift-certificate\": [\"gift certificate\", \"gift certificates\"],\n\"postcard\": [\"postcard\", \"postcards\"],\n\"media-kit\": [\"media kit\", \"media kits\"],\n\"recipe-card\": [\"recipe card\", \"recipe cards\", \"recipes card\", \"recipes cards\"],\n\"report-card\": [\"report card\", \"report cards\"],\n\"tag\": [\"tag\", \"tags\"],\n\"ticket\": [\"ticket\", \"tickets\"],\n\"tiktok-video\": [\"tiktok video\", \"tiktok videos\"],\n\"worksheet\": [\"worksheet\", \"worksheets\"],\n\"facebook-profile-cover\": [\"facebook profile cover\", \"facebook profile covers\"],\n\"linkedin-profile-cover\": [\"linkedin profile cover\", \"linkedin profile coveres\"],\n\"youtube-profile-photo\": [\"youtube profile photo\", \"youtube profile photos\"],\n\"video\": [\"video\", \"videos\"],\n\"tshirt\":[\"tshirt\", \"tshirts\", \"t-shirt\"],\n\"mobile-video\": [\"mobile video\", \"mobile videos\"]\n}",
      "note": "Options for jump to category list.  (Important: only translate the text inside the [], keep the comma separation format. Add more comma if needed)"
    },
    {
      "key": "task-name-mapping",
      "value": "{\n\"''\": [\"templates\", \"template\"],\n\"flyer\": [\"flyer\", \"flyers\"],\n\"banner\": [\"banner\", \"banners\"],\n\"business card horizontal\": [\"business card horizontal\", \"business cards horizontal\"],\n\"infographic\": [\"infographic\", \"infographics\"],\n\"brochure\": [\"brochure\", \"brochures\"],\n\"facebook page cover\": [\"facebook page cover\", \"facebook page covers\", \"facebook pages cover\", \"facebook pages covers\"],\n\"youtube channel art\": [\"youtube channel art\", \"youtube channel arts\", \"youtube arts\", \"youtube art\"],\n\"calendar\": [\"calendar\", \"calendars\"],\n\"card\": [\"card\", \"cards\"],\n\"certificate\": [\"certificate\", \"certificates\"],\n\"cover\": [\"cover\", \"covers\"],\n\"invitation\": [\"invitation\", \"invitations\"],\n\"invoice\": [\"invoice\", \"invoices\"],\n\"label\": [\"label\", \"labels\"],\n\"logo\": [\"logo\", \"logos\"],\n\"meme\": [\"meme\", \"memes\"],\n\"menu\": [\"menu\", \"menus\"],\n\"newsletter\": [\"newsletter\", \"newsletters\"],\n\"poster\": [\"poster\", \"posters\"],\n\"presentation slide\": [\"presentation slide\", \"presentation slides\", \"presentations slide\", \"presentation\", \"presentations\"],\n\"resume\": [\"resume\", \"resumes\"],\n\"facebook ad\": [\"facebook ad\", \"facebook ads\"],\n\"planner\": [\"planner\", \"planners\"],\n\"background\": [\"background\", \"backgrounds\"],\n\"twitter header\": [\"twitter header\", \"twitter headers\"],\n\"business card\": [\"business card\", \"business cards\"],\n\"proposal\": [\"proposal\", \"proposals\"],\n\"greeting card\": [\"greeting card\", \"greeting cards\"],\n\"graphic organizer\": [\"graphic organizer\", \"graphic organizers\", \"graphics organizer\"],\n\"checklist\": [\"checklist\", \"checklists\"],\n\"coupon\": [\"coupon\", \"coupons\"],\n\"instagram story\": [\"instagram story\", \"instagram stories\"],\n\"letter\": [\"letter\", \"letters\"],\n\"letterhead\": [\"letterhead\", \"letterheads\"],\n\"facebook post\": [\"facebook post\", \"facebook posts\"],\n\"instagram post\": [\"instagram post\", \"instagram posts\"],\n\"program\": [\"program\", \"programs\"],\n\"schedule\": [\"schedule\", \"schedules\"],\n\"thumbnail\": [\"thumbnail\", \"thumbnails\"],\n\"wallpaper\": [\"wallpaper\", \"wallpapers\"],\n\"youtube end screen\": [\"youtube end screen\", \"youtube end screens\"],\n\"graph\": [\"graph\", \"graphs\"],\n\"bookmark\": [\"bookmark\", \"bookmarks\"],\n\"gift certificate\": [\"gift certificate\", \"gift certificates\"],\n\"postcard\": [\"postcard\", \"postcards\"],\n\"instagram post sqaure\": [\"instagram post sqaure\", \"instagram post sqaures\", \"instagram posts sqaure\"],\n\"media kit\": [\"media kit\", \"media kits\"],\n\"recipe card\": [\"recipe card\", \"recipe cards\", \"recipes card\", \"recipes cards\"],\n\"report card\": [\"report card\", \"report cards\"],\n\"tag\": [\"tag\", \"tags\"],\n\"ticket\": [\"ticket\", \"tickets\"],\n\"worksheet\": [\"worksheet\", \"worksheets\"]\n}",
      "note": "Options for jump to category list.  (Important: only translate the text inside the [], keep the comma separation format. Add more comma if needed)"
    },
    {
      "key": "task-category-icons",
      "value": "template-lightning, \ncategory-banner, \ncategory-brochure, \ncategory-card,\ncategory-facebook, \ncategory-facebook, \ncategory-flyer, \ncategory-card, \ncategory-instagram,\ncategory-invitation, \ncategory-logo, \ncategory-poster, \ncategory-presentation, \ncategory-resume,",
      "note": "Icon file names. Duplicate to different locales. No need for translation."
    },
    {
      "key": "edit-this-template",
      "value": "Edit this template",
      "note": ""
    },
    {
      "key": "open-to-see-animation",
      "value": "Open template to see animation",
      "note": ""
    },
    {
      "key": "all",
      "value": "All",
      "note": ""
    },
    {
      "key": "start-from-scratch",
      "value": "Start from scratch",
      "note": ""
    },
    {
      "key": "sign-in",
      "value": "Sign in",
      "note": ""
    },
    {
      "key": "relevant-rows-view-all",
      "value": "View all in app",
      "note": "View all in app button for relevant rows template-list block."
    },
    {
      "key": "relevant-rows-view-all-link",
      "value": "https://www.adobe.com/express",
      "note": "View all in app button link for relevant rows template-list block."
    },
    {
      "key": "relevant-rows-templates-limit",
      "value": "10",
      "note": "The limit of templates shown in relevant rows blocks."
    },
    {
      "key": "bundle-plan-description",
      "value": "When you choose to bundle Adobe Express Premium with {{ App Name }}.",
      "note": "The placeholder text for when a bundle plan is selected in the Pricing Hub block."
    },
    {
      "key": "pricing-hub-all-templates",
      "value": "",
      "note": ""
    },
    {
      "key": "pricing-hub-all-templates-mobile",
      "value": "",
      "note": ""
    },
    {
      "key": "breadcrumbs-create",
      "value": "Create",
      "note": ""
    },
    {
      "key": "breadcrumbs-feature",
      "value": "Feature",
      "note": ""
    },
    {
      "key": "breadcrumbs-business",
      "value": "For business",
      "note": ""
    },
    {
      "key": "breadcrumbs-discover",
      "value": "Discover",
      "note": ""
    },
    {
      "key": "search-branch-links",
      "value": "https://adobesparkpost.app.link/c4bWARQhWAb, https://adobesparkpost.app.link/lQEQ4Pi1YHb, https://adobesparkpost.app.link/9tmWXXDAhLb, https://adobesparkpost.app.link/6MZ5m93ypMb, https://adobesparkpost.app.link/9m3BY52WtJb",
      "note": ""
    },
    {
      "key": "fullscreen-marquee-desktop-video-app",
      "value": "https://main--express--adobecom.hlx.page/express/media_11ffe376e21cc1f2437a2c5c9c875a2c478b51d9a.png",
      "note": "The app background image for the video app variant of the fullscreen marquee."
    },
    {
      "key": "fullscreen-marquee-desktop-image-app",
      "value": "https://main--express--adobecom.hlx.page/express/media_1460fa1227fa59f6d998556d97df3d709f53c92b8.png",
      "note": "The app background image for the image app variant of the fullscreen marquee."
    },
    {
      "key": "fullscreen-marquee-desktop-video-editor",
      "value": "https://main--express--adobecom.hlx.page/express/media_11e5c3128ea43f271fd2a565c1e4d68cd1d62c985.png",
      "note": "The editor image for the video editor variant of the fullscreen marquee."
    },
    {
      "key": "fullscreen-marquee-desktop-image-editor",
      "value": "https://main--express--adobecom.hlx.page/express/media_1efec67aa1be9ac7f56eddbf1dd44dbbe4292d10d.png",
      "note": "The editor image for the image editor variant of the fullscreen marquee."
    },
    {
      "key": "how-to-steps-carousel-background-img",
      "value": "https://main--express--adobecom.hlx.page/express/media_1638b3cf741e8552c66582546674b1ebd4bae0d15.png",
      "note": "The editor image for the image editor of the how to steps carousel."
    },
    {
      "key": "how-to-steps-carousel-image-app",
      "value": "https://main--express--adobecom.hlx.page/express/media_1638b3cf741e8552c66582546674b1ebd4bae0d15.png",
      "note": "The editor image for the image editor of the how to steps carousel."
    },
    {
      "key": "search-suggestions-title",
      "value": "Suggestions",
      "note": ""
    },
    {
      "key": "search-trends-title",
      "value": "Trending Searches",
      "note": ""
    },
    {
      "key": "search-trends",
      "value": "{\n\"Resume\":\"/express/templates/resume\",\n\"Business Card\":\"/express/templates/business-card\",\n\"Certificate\":\"/express/templates/certificate\",\n\"Brochure\":\"/express/templates/brochure\",\n\"Photo Collage\":\"/express/templates/photo-collage\",\n\"Medical Certificate\":\"/express/templates/certificate/medical\"\n}",
      "note": ""
    },
    {
      "key": "templates-fallback-with-tasks",
      "value": "Sorry we couldn't find any results for what you searched for, try some of these popular {{tasks}} templates instead.",
      "note": ""
    },
    {
      "key": "templates-fallback-without-tasks",
      "value": "Explore 150,000+ free templates to make your own.",
      "note": ""
    },
    {
      "key": "play-animation",
      "value": "play animation",
      "note": ""
    },
    {
      "key": "pause-animation",
      "value": "pause animation",
      "note": ""
    },
    {
      "key": "free",
      "value": "Free",
      "note": ""
    },
    {
      "key": "generate",
      "value": "Generate",
      "note": ""
    },
    {
      "key": "gen-ai-input-placeholder",
      "value": "Try describing things, environments, people, moods. (English only)",
      "note": ""
    },
    {
      "key": "gen-ai-link-template",
      "value": "https://new.express.adobe.com/new?category=media&prompt={{prompt-text}}&action=text+to+image&width=1080&height=1080",
      "note": ""
    },
    {
      "key": "template-list-ace-title",
      "value": "Make a {{ace-dropdown}} poster {{breakline}} for",
      "note": ""
    },
    {
      "key": "template-list-ace-modal-title",
      "value": "Make a {{ace-dropdown}} poster",
      "note": ""
    },
    {
      "key": "template-list-ace-categories-dropdown",
      "value": "(select sub category), Art, Event, Health, Movie, Music, Nature, Sales, Travel",
      "note": ""
    },
    {
      "key": "template-list-ace-search-hint",
      "value": "Describe what you want to generate...",
      "note": ""
    },
    {
      "key": "template-list-ace-button",
      "value": "Generate Templates",
      "note": ""
    },
    {
      "key": "template-list-ace-button-refresh",
      "value": "Refresh results",
      "note": ""
    },
    {
      "key": "template-list-ace-suggestions-title",
      "value": "template-list-ace-suggestions-title",
      "note": ""
    },
    {
      "key": "template-list-ace-suggestions",
      "value": "Night of classical music,\nCeramics workshop,\nFashion sale August 15,\nMinimalist shapes",
      "note": ""
    },
    {
      "key": "template-list-ace-templates-title",
      "value": "Trending {{category}} poster templates",
      "note": ""
    },
    {
      "key": "template-list-ace-create-template-link",
      "value": "https://adobesparkpost.app.link/JsWr1mPk7gb",
      "note": ""
    },
    {
      "key": "cancel",
      "value": "Cancel",
      "note": ""
    },
    {
      "key": "pep-header",
      "value": "Taking you to Adobe Express",
      "note": ""
    },
    {
      "key": "pep-cancel",
      "value": "Cancel to stay on the page",
      "note": ""
    },
    {
      "key": "change-region",
      "value": "Choose your region",
      "note": ""
    },
    {
      "key": "change-region-description",
      "value": "Selecting a region changes the language and/or content on Adobe.com",
      "note": ""
    },
    {
      "key": "page-did-not-exist",
      "value": "This page did not exist for your locale.",
      "note": ""
    },
    {
      "key": "buy-now",
      "value": "Buy Now",
      "note": ""
    },
    {
      "key": "start-30-day-free-trial",
      "value": "Start 30-day free trial",
      "note": ""
    },
    {
      "key": "view-all-features",
      "value": "View all features",
      "note": "for localizing one-plans page"
    },
    {
      "key": "per-year",
      "value": "per year.",
      "note": "for localizing one-plans page"
    },
    {
      "key": "per-month-per-seat",
      "value": "per person monthly.",
      "note": "for localizing one-plans page"
    },
    {
      "key": "per-month",
      "value": "per month.",
      "note": "for localizing one-plans page"
    },
    {
      "key": "per-year-per-seat",
      "value": "per person annually.",
      "note": "for localizing one-plans page"
    },
    {
      "key": "vat-include-text",
      "value": "VAT included.",
      "note": "for localizing one-plans page"
    },
    {
      "key": "vat-exclude-text",
      "value": "VAT excluded.",
      "note": "for localizing one-plans page"
    },
    {
      "key": "monthly",
      "value": "Monthly",
      "note": ""
    },
    {
      "key": "annually",
      "value": "Annual, prepaid",
      "note": ""
    },
    {
      "key": "subscription-type",
      "value": "Subscription type:",
      "note": ""
    },
    {
      "key": "annual-billed-monthly",
      "value": "Annual, billed monthly",
      "note": ""
    },
    {
      "key": "file-type-not-supported",
      "value": "File type not supported.",
      "note": "for frictionless-qa block"
    },
    {
      "key": "file-size-not-supported",
      "value": "File size not supported.",
      "note": "for frictionless-qa block"
    },
    {
      "key": "describe-image-mobile",
      "value": "Describe your image...",
      "note": ""
    },
    {
      "key": "describe-image-desktop",
      "value": "Describe the image you want to create...",
      "note": ""
    },
    {
      "key": "generate",
      "value": "Generate",
      "note": ""
    },
    {
      "key": "use-this-prompt",
      "value": "Use this prompt",
      "note": ""
    },
    {
      "key": "prompt-title",
      "value": "Prompt used",
      "note": ""
    },
    {
      "key": "simplified-per-year",
      "value": "/year",
      "note": ""
    },
    {
      "key": "simplified-per-year-teams",
      "value": "/seat per year",
      "note": ""
    }
  ],
  ":type": "sheet"
}
return window.placeholders;
  let resolver;
  window.placeholders = new Promise((res) => {
    resolver = res;
  });
  const requestPlaceholders = async (url) => {
    const resp = await fetch(url);
    if (resp.ok) {
      const json = await resp.json();
      const placeholders = {};
      json.data.forEach((placeholder) => {
        if (placeholder.value) placeholders[placeholder.key] = placeholder.value;
        else if (placeholder.Text) placeholders[placeholder.Key] = placeholder.Text;
      });
      return placeholders;
    }
    return null;
  };
  try {
    const { prefix } = getConfig().locale;
    const placeholders = await requestPlaceholders(`${prefix}/express/placeholders.json`);
    if (!placeholders) throw new Error(`placeholders req failed in prefix: ${prefix}`);
    resolver(placeholders);
  } catch {
    resolver(await requestPlaceholders('/express/placeholders.json') || {});
  }
  return window.placeholders;
}

function addPromotion() {
  // check for existing promotion
  if (!document.querySelector('main .promotion')) {
    // extract category from metadata
    const category = getMetadata('category');
    if (category) {
      const promos = {
        photo: 'photoshop',
        design: 'illustrator',
        video: 'premiere',
      };
      // insert promotion at the bottom
      if (promos[category]) {
        const $promoSection = createTag('div', { class: 'section' });
        $promoSection.innerHTML = `<div class="promotion" data-block-name="promotion"><div><div>${promos[category]}</div></div></div>`;
        document.querySelector('main').append($promoSection);
        loadBlock($promoSection.querySelector(':scope .promotion'));
      }
    }
  }
}

let imsLoaded;
export function loadIms() {
  imsLoaded = imsLoaded || new Promise((resolve, reject) => {
    const {
      locale, imsClientId, imsScope, env, adobeid,
    } = getConfig();
    if (!imsClientId) {
      reject(new Error('Missing IMS Client ID'));
      return;
    }
    const [unavMeta, ahomeMeta] = [getMetadata('universal-nav')?.trim(), getMetadata('adobe-home-redirect')];
    const defaultScope = `AdobeID,openid,gnav${unavMeta && unavMeta !== 'off' ? ',pps.read,firefly_api,additional_info.roles,read_organizations' : ''}`;
    const timeout = setTimeout(() => reject(new Error('IMS timeout')), 5000);
    window.adobeid = {
      client_id: imsClientId,
      scope: imsScope || defaultScope,
      locale: locale?.ietf?.replace('-', '_') || 'en_US',
      redirect_uri: ahomeMeta === 'on'
        ? `https://www${env.name !== 'prod' ? '.stage' : ''}.adobe.com${locale.prefix}` : undefined,
      autoValidateToken: true,
      environment: env.ims,
      useLocalStorage: false,
      api_parameters: { check_token: { guest_allowed: true } },
      onReady: () => {
        resolve();
        clearTimeout(timeout);
      },
      onError: reject,
      ...adobeid,
    };
    if (getConfig().env.ims === 'stg1') {
      loadScript('https://auth-stg1.services.adobe.com/imslib/imslib.min.js');
    } else {
      loadScript('https://auth.services.adobe.com/imslib/imslib.min.js');
    }
  }).then(() => {
    if (!window.adobeIMS?.isSignedInUser() && getMetadata('xlg-entitlements') !== 'on') {
      getConfig().entitlements([]);
    } else {
      setTimeout(async () => {
        if (!(await window.alloyLoader)) {
          getConfig().entitlements([]);
        }
      }, 3000);
    }
  }).catch(() => {
    getConfig().entitlements([]);
  });

  return imsLoaded;
}

export async function loadMartech({
  persEnabled = false,
  persManifests = [],
  postLCP = false,
} = {}) {
  // eslint-disable-next-line no-underscore-dangle
  if (window.marketingtech?.adobe?.launch && window._satellite) {
    return true;
  }

  const query = PAGE_URL.searchParams.get('martech');
  if (query === 'off' || getMetadata('martech') === 'off') {
    return false;
  }

  window.targetGlobalSettings = { bodyHidingEnabled: false };
  loadIms().catch(() => {});

  const { default: initMartech } = await import('./martech.js');
  await initMartech({ persEnabled, persManifests, postLCP });

  return true;
}

function loadGnav() {
  const usp = new URLSearchParams(window.location.search);
  const gnav = usp.get('gnav') || getMetadata('gnav');

  const gnavUrl = '/express/scripts/gnav.js';
  if (!(gnav === 'off' || document.querySelector(`head script[src="${gnavUrl}"]`))) {
    loadScript(gnavUrl, 'module');
  }
}

function decorateHeroLCP() {
  const template = getMetadata('template');
  const h1 = document.querySelector('main h1');
  if (template !== 'blog') {
    if (h1 && !h1.closest('main > div > div')) {
      const heroPicture = h1.parentElement.querySelector('picture');
      let heroSection;
      const main = document.querySelector('main');
      if (main.children.length === 1) {
        heroSection = createTag('div', { id: 'hero' });
        const div = createTag('div');
        heroSection.append(div);
        if (heroPicture) {
          div.append(heroPicture);
        }
        div.append(h1);
        main.prepend(heroSection);
      } else {
        heroSection = h1.closest('main > div');
        heroSection.id = 'hero';
        heroSection.removeAttribute('style');
      }
      if (heroPicture) {
        heroPicture.classList.add('hero-bg');
      } else {
        heroSection.classList.add('hero-noimage');
      }
    }
  } else if (template === 'blog' && h1 && getMetadata('author') && getMetadata('publication-date')) {
    loadStyle(`${getConfig().codeRoot}/templates/blog/blog.css`);
    document.body.style.visibility = 'hidden';
    const heroSection = createTag('div', { id: 'hero' });
    const main = document.querySelector('main');
    main.prepend(heroSection);
  }
}

/**
 * Button style applicator function
 * @param {Object} el the container of the buttons to be decorated
 */

export function decorateButtons(el = document) {
  const noButtonBlocks = ['template-list', 'icon-list'];
  el.querySelectorAll(':scope a:not(.faas.link-block, .fragment.link-block)').forEach(($a) => {
    if ($a.closest('div.section > .text') && !($a.parentElement.tagName === 'STRONG' || $a.querySelector(':scope > strong'))) return;
    const originalHref = $a.href;
    const linkText = $a.textContent.trim();
    if ($a.children.length > 0) {
      // We can use this to eliminate styling so only text
      // propagates to buttons.
      $a.innerHTML = $a.innerHTML.replaceAll('<u>', '').replaceAll('</u>', '');
    }
    $a.title = $a.title || linkText;
    const $block = $a.closest('div.section > div > div');
    const { hash } = new URL($a.href);
    let blockName;
    if ($block) {
      blockName = $block.className;
    }

    if (!noButtonBlocks.includes(blockName)
      && originalHref !== linkText
      && !(linkText.startsWith('https') && linkText.includes('/media_'))
      && !/hlx\.blob\.core\.windows\.net/.test(linkText)
      && !linkText.endsWith(' >')
      && !(hash === '#embed-video')
      && !linkText.endsWith(' ›')
      && !linkText.endsWith('.svg')) {
      const $up = $a.parentElement;
      const $twoup = $a.parentElement.parentElement;
      if (!$a.querySelector('img')) {
        if ($up.childNodes.length === 1 && ($up.tagName === 'P' || $up.tagName === 'DIV')) {
          $a.classList.add('button', 'accent'); // default
          $up.classList.add('button-container');
        }
        if ($up.childNodes.length === 1 && $up.tagName === 'STRONG'
          && $twoup.children.length === 1 && $twoup.tagName === 'P') {
          $a.classList.add('button', 'accent');
          $twoup.classList.add('button-container');
        }
        if ($up.childNodes.length === 1 && $up.tagName === 'EM'
          && $twoup.children.length === 1 && $twoup.tagName === 'P') {
          $a.classList.add('button', 'accent', 'light');
          $twoup.classList.add('button-container');
        }
      }
      if (linkText.startsWith('{{icon-') && linkText.endsWith('}}')) {
        const $iconName = /{{icon-([\w-]+)}}/g.exec(linkText)[1];
        if ($iconName) {
          $a.appendChild(getIcon($iconName, `${$iconName} icon`));
          $a.classList.remove('button', 'primary', 'secondary', 'accent');
          $a.title = $iconName;
        }
      }
    }
  });
}

/**
 * Sanitizes a string and turns it into camel case.
 * @param {*} name The unsanitized string
 * @returns {string} The camel cased string
 */
export function toCamelCase(name) {
  return toClassName(name).replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}

/**
 * Gets the experiment name, if any for the page based on env, useragent, queyr params
 * @returns {string} experimentid
 */
export function getExperiment() {
  let experiment = toClassName(getMetadata('experiment'));
  if (window.location.hash) {
    experiment = '';
    // reason = 'suppressed by #';
  }

  if (navigator.userAgent.match(/bot|crawl|spider/i)) {
    experiment = '';
    // reason = 'bot detected';
  }

  const usp = new URLSearchParams(window.location.search);
  if (usp.has('experiment')) {
    [experiment] = usp.get('experiment').split('/');
  }

  return experiment;
}

/**
 * Gets experiment config from the manifest or the instant experiement
 * metdata and transforms it to more easily consumable structure.
 *
 * the manifest consists of two sheets "settings" and "experiences"
 *
 * "settings" is applicable to the entire test and contains information
 * like "Audience", "Status" or "Blocks".
 *
 * "experience" hosts the experiences in columns, consisting of:
 * a "Percentage Split", "Label" and a set of "Pages".
 *
 *
 * @param {string} experimentId
 * @returns {object} containing the experiment manifest
 */
export async function getExperimentConfig(experimentId) {
  const instantExperiment = getMetadata('instant-experiment');
  if (instantExperiment) {
    const config = {
      experimentName: `Instant Experiment: ${experimentId}`,
      audience: '',
      status: 'Active',
      id: experimentId,
      variants: {},
      variantNames: [],
    };

    const pages = instantExperiment.split(',').map((p) => new URL(p.trim()).pathname);
    const evenSplit = 1 / (pages.length + 1);

    config.variantNames.push('control');
    config.variants.control = {
      percentageSplit: '',
      pages: [window.location.pathname],
      blocks: [],
      label: 'Control',
    };

    pages.forEach((page, i) => {
      const vname = `challenger-${i + 1}`;
      config.variantNames.push(vname);
      config.variants[vname] = {
        percentageSplit: `${evenSplit}`,
        pages: [page],
        label: `Challenger ${i + 1}`,
      };
    });

    return (config);
  } else {
    const path = `/express/experiments/${experimentId}/manifest.json`;
    try {
      const config = {};
      const resp = await fetch(path);
      const json = await resp.json();
      json.settings.data.forEach((line) => {
        const key = toCamelCase(line.Name);
        config[key] = line.Value;
      });
      config.id = experimentId;
      config.manifest = path;
      const variants = {};
      let variantNames = Object.keys(json.experiences.data[0]);
      variantNames.shift();
      variantNames = variantNames.map((vn) => toCamelCase(vn));
      variantNames.forEach((variantName) => {
        variants[variantName] = {};
      });
      let lastKey = 'default';
      json.experiences.data.forEach((line) => {
        let key = toCamelCase(line.Name);
        if (!key) key = lastKey;
        lastKey = key;
        const vns = Object.keys(line);
        vns.shift();
        vns.forEach((vn) => {
          const camelVN = toCamelCase(vn);
          if (key === 'pages' || key === 'blocks') {
            variants[camelVN][key] = variants[camelVN][key] || [];
            if (key === 'pages') variants[camelVN][key].push(new URL(line[vn]).pathname);
            else variants[camelVN][key].push(line[vn]);
          } else {
            variants[camelVN][key] = line[vn];
          }
        });
      });
      config.variants = variants;
      config.variantNames = variantNames;
      return config;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('error loading experiment manifest: %s', path, e);
    }
    return null;
  }
}

async function loadAndRunExp(config, forcedExperiment, forcedVariant) {
  const promises = [import('./experiment.js')];
  const aepaudiencedevice = getMetadata('aepaudiencedevice').toLowerCase();
  if (aepaudiencedevice === 'all' || aepaudiencedevice === document.body.dataset?.device) {
    // rush martech-launch-alloy
    promises.push(loadMartech());
  }
  const [{ runExps }] = await Promise.all(promises);
  await runExps(config, forcedExperiment, forcedVariant);
}

/**
 * checks if a test is active on this page and if so executes the test
 */
async function decorateTesting() {
  try {
    const usp = new URLSearchParams(window.location.search);

    const experiment = getExperiment();
    const [forcedExperiment, forcedVariant] = usp.get('experiment') ? usp.get('experiment').split('/') : [];

    if (experiment) {
      const config = await getExperimentConfig(experiment);
      if (config && (toCamelCase(config.status) === 'active' || forcedExperiment)) {
        await loadAndRunExp(config, forcedExperiment, forcedVariant);
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('error testing', e);
  }
}

/**
 * Icon loader using altText
 * @param {Object} el the container of the buttons to be decorated
 */

export async function fixIcons(el = document) {
  /* backwards compatible icon handling, deprecated */
  el.querySelectorAll('svg use[href^="./_icons_"]').forEach(($use) => {
    $use.setAttribute('href', `/express/icons.svg#${$use.getAttribute('href').split('#')[1]}`);
  });
  const placeholders = await fetchPlaceholders();
  /* new icons handling */
  el.querySelectorAll('img').forEach(($img) => {
    const alt = $img.getAttribute('alt');
    if (alt) {
      const lowerAlt = alt.toLowerCase();
      if (lowerAlt.includes('icon:')) {
        const [icon, mobileIcon] = lowerAlt
          .split(';')
          .map((i) => {
            if (i) {
              return toClassName(i.split(':')[1].trim());
            }
            return null;
          });
        let altText = null;
        if (placeholders[icon]) {
          altText = placeholders[icon];
        } else if (placeholders[mobileIcon]) {
          altText = placeholders[mobileIcon];
        }
        const $picture = $img.closest('picture');
        const $block = $picture.closest('.block');
        let size = 44;
        if ($block) {
          const blockName = $block.getAttribute('data-block-name') || $block.classList[0];
          // use small icons in .columns (except for .columns.offer)
          if (blockName === 'columns') {
            size = $block.classList.contains('offer') ? 44 : 22;
          } else if (blockName === 'toc') {
            // ToC block has its own logic
            return;
          }
        }
        $picture.parentElement
          .replaceChild(getIconElement([icon, mobileIcon], size, altText), $picture);
      }
    }
  });
}

function unwrapBlock($block) {
  const $section = $block.parentNode;
  const $elems = [...$section.children];

  if ($elems.length <= 1) return;

  const $blockSection = createTag('div');
  const $postBlockSection = createTag('div');
  const $nextSection = $section.nextElementSibling;
  $section.parentNode.insertBefore($blockSection, $nextSection);
  $section.parentNode.insertBefore($postBlockSection, $nextSection);

  let $appendTo;
  $elems.forEach(($e) => {
    if ($e === $block || ($e.className === 'section-metadata')) {
      $appendTo = $blockSection;
    }

    if ($appendTo) {
      $appendTo.appendChild($e);
      $appendTo = $postBlockSection;
    }
  });

  if (!$postBlockSection.hasChildNodes()) {
    $postBlockSection.remove();
  }
}

export function normalizeHeadings(block, allowedHeadings) {
  const allowed = allowedHeadings.map((h) => h.toLowerCase());
  block.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((tag) => {
    const h = tag.tagName.toLowerCase();
    if (allowed.indexOf(h) === -1) {
      // current heading is not in the allowed list -> try first to "promote" the heading
      let level = parseInt(h.charAt(1), 10) - 1;
      while (allowed.indexOf(`h${level}`) === -1 && level > 0) {
        level -= 1;
      }
      if (level === 0) {
        // did not find a match -> try to "downgrade" the heading
        while (allowed.indexOf(`h${level}`) === -1 && level < 7) {
          level += 1;
        }
      }
      if (level !== 7) {
        tag.outerHTML = `<h${level}>${tag.textContent.trim()}</h${level}>`;
      }
    }
  });
}

export async function fetchBlockFragDecorated(url, blockName) {
  const location = new URL(window.location);
  const { prefix } = getConfig().locale;
  const fragmentUrl = `${location.origin}${prefix}${url}`;

  const path = new URL(fragmentUrl).pathname.split('.')[0];
  const resp = await fetch(`${path}.plain.html`);
  if (resp.status === 404) {
    return null;
  } else {
    const html = await resp.text();
    const section = createTag('div');
    section.innerHTML = html;
    section.className = `section section-wrapper ${blockName}-container`;
    const block = section.querySelector(`.${blockName}`);
    block.dataset.blockName = blockName;
    block.parentElement.className = `${blockName}-wrapper`;
    block.classList.add('block');
    const img = section.querySelector('img');
    if (img) {
      img.setAttribute('loading', 'lazy');
    }
    return section;
  }
}

async function buildAutoBlocks(main) {
  const lastDiv = main.querySelector(':scope > div:last-of-type');

  if (['yes', 'true', 'on'].includes(getMetadata('show-relevant-rows').toLowerCase()) && document.body.dataset.device === 'mobile') {
    const authoredRRFound = [
      '.template-list.horizontal.fullwidth.mini',
      '.link-list.noarrows',
      '.collapsible-card',
    ].every((block) => main.querySelector(block));

    if (!authoredRRFound && !window.relevantRowsLoaded) {
      const relevantRowsData = await fetchRelevantRows(window.location.pathname);

      if (relevantRowsData) {
        const relevantRowsSection = createTag('div');
        const fragment = buildBlock('fragment', '/express/fragments/relevant-rows-default-v2');
        relevantRowsSection.dataset.audience = 'mobile';
        relevantRowsSection.append(fragment);
        main.prepend(relevantRowsSection);
        window.relevantRowsLoaded = true;
      }
    }
  }

  async function loadFloatingCTA(BlockMediator) {
    const validButtonVersion = ['floating-button', 'multifunction-button', 'bubble-ui-button'];
    const device = document.body.dataset?.device;
    const blockName = getMetadata(`${device}-floating-cta`);

    if (blockName && validButtonVersion.includes(blockName) && lastDiv) {
      const button = buildBlock(blockName, device);
      button.classList.add('meta-powered');
      lastDiv.append(button);
      BlockMediator.set('floatingCtasLoaded', true);
    }
  }

  if (['yes', 'y', 'true', 'on'].includes(getMetadata('show-floating-cta')?.toLowerCase())) {
    const { default: BlockMediator } = await import('./block-mediator.min.js');

    if (!BlockMediator.get('floatingCtasLoaded')) {
      await loadFloatingCTA(BlockMediator);
    }
  }

  if (getMetadata('show-quick-action-card') && !['no', 'false', 'off'].includes(getMetadata('show-quick-action-card').toLowerCase())) {
    const fragmentName = getMetadata('show-quick-action-card').toLowerCase();
    const quickActionCardBlock = buildBlock('quick-action-card', fragmentName);
    quickActionCardBlock.classList.add('spreadsheet-powered');
    if (lastDiv) {
      lastDiv.append(quickActionCardBlock);
    }
  }
}

function splitSections(area) {
  const blocks = area.querySelectorAll(`:scope${area === document ? ' main' : ''} > div > div`);
  blocks.forEach((block) => {
    const blocksToSplit = ['template-list', 'banner', 'promotion'];
    // work around for splitting columns and sixcols template list
    // add metadata condition to minimize impact on other use cases

    if (blocksToSplit.includes(block.className)) {
      unwrapBlock(block);
    }
  });
}

/**
 * Adds the favicon.
 * @param {string} href The favicon URL
 */
export function addFavIcon(href) {
  const link = document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  link.href = href;
  const existingLink = document.querySelector('head link[rel="icon"]');
  if (existingLink) {
    existingLink.replaceWith(link);
  } else {
    document.getElementsByTagName('head')[0].appendChild(link);
  }
}

function decorateSocialIcons(el) {
  el.querySelectorAll(':scope a').forEach(($a) => {
    const urlObject = new URL($a.href);

    if (urlObject.hash === '#embed-video') return;
    if ($a.closest('.block')?.dataset.blockName === 'embed') return;

    if ($a.href === $a.textContent.trim()) {
      let icon = '';
      if (urlObject.hostname === 'www.instagram.com') {
        icon = 'instagram';
      }
      if (urlObject.hostname === 'www.twitter.com') {
        icon = 'twitter';
      }
      if (urlObject.hostname.split('.')[1] === 'pinterest') {
        icon = 'pinterest';
      }
      if (urlObject.hostname.split('.')[1] === 'facebook') {
        icon = 'facebook';
      }
      if (urlObject.hostname === 'www.linkedin.com') {
        icon = 'linkedin';
      }
      if (urlObject.hostname === 'www.youtube.com') {
        icon = 'youtube';
      }
      if (urlObject.hostname === 'www.tiktok.com') {
        icon = 'tiktok';
      }
      const $parent = $a.parentElement;
      if (!icon && $parent.previousElementSibling && $parent.previousElementSibling.classList.contains('social-links')) {
        icon = 'globe';
      }

      if (icon) {
        $a.innerHTML = '';
        const $icon = getIconElement(icon, 22);
        $icon.classList.add('social');
        $a.appendChild($icon);
        if ($parent.previousElementSibling && $parent.previousElementSibling.classList.contains('social-links')) {
          $parent.previousElementSibling.appendChild($a);
          $parent.remove();
        } else {
          $parent.classList.add('social-links');
        }
      }
    }
  });
}

function displayOldLinkWarning() {
  if (window.location.hostname.includes('localhost') || window.location.hostname.includes('.hlx.page')) {
    document.querySelectorAll('main a[href^="https://spark.adobe.com/"]').forEach(($a) => {
      $a.style.border = '10px solid red';
    });
  }
}

function setHelixEnv(name, overrides) {
  if (name) {
    sessionStorage.setItem('helix-env', name);
    if (overrides) {
      sessionStorage.setItem('helix-env-overrides', JSON.stringify(overrides));
    } else {
      sessionStorage.removeItem('helix-env-overrides');
    }
  } else {
    sessionStorage.removeItem('helix-env');
    sessionStorage.removeItem('helix-env-overrides');
  }
}

function displayEnv() {
  try {
    /* setup based on URL Params */
    const usp = new URLSearchParams(window.location.search);
    if (usp.has('helix-env')) {
      const env = usp.get('helix-env');
      setHelixEnv(env);
    }

    /* setup based on referrer */
    if (document.referrer) {
      const url = new URL(document.referrer);
      const expressEnvs = ['express-stage.adobe.com', 'express-qa.adobe.com', 'express-dev.adobe.com'];
      if (url.hostname.endsWith('.adobeprojectm.com') || expressEnvs.includes(url.hostname)) {
        setHelixEnv('stage', { spark: url.host });
      }
      if (window.location.hostname !== url.hostname) {
        // eslint-disable-next-line no-console
        console.log(`external referrer detected: ${document.referrer}`);
      }
    }

    const env = sessionStorage.getItem('helix-env');
    if (env) {
      const $helixEnv = createTag('div', { class: 'helix-env' });
      $helixEnv.textContent = env + (getHelixEnv() ? '' : ' [not found]');
      document.body.appendChild($helixEnv);
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(`display env failed: ${e.message}`);
  }
}

/**
 * Returns a picture element with webp and fallbacks
 * @param {string} src The image URL
 * @param {string} alt The alt text of the image
 * @param {boolean} eager load image eager
 * @param {Array} breakpoints breakpoints and corresponding params (eg. width)
 */

export function createOptimizedPicture(src, alt = '', eager = false, breakpoints = [{ media: '(min-width: 600px)', width: '2000' }, { width: '750' }]) {
  const url = new URL(src, window.location.href);
  const picture = document.createElement('picture');
  const { pathname } = url;
  const ext = pathname.substring(pathname.lastIndexOf('.') + 1);

  // webp
  breakpoints.forEach((br) => {
    const source = document.createElement('source');
    if (br.media) source.setAttribute('media', br.media);
    source.setAttribute('type', 'image/webp');
    source.setAttribute('srcset', `${pathname}?width=${br.width}&format=webply&optimize=medium`);
    picture.appendChild(source);
  });

  // fallback
  breakpoints.forEach((br, i) => {
    if (i < breakpoints.length - 1) {
      const source = document.createElement('source');
      if (br.media) source.setAttribute('media', br.media);
      source.setAttribute('srcset', `${pathname}?width=${br.width}&format=${ext}&optimize=medium`);
      picture.appendChild(source);
    } else {
      const img = document.createElement('img');
      img.setAttribute('loading', eager ? 'eager' : 'lazy');
      img.setAttribute('alt', alt);
      picture.appendChild(img);
      img.setAttribute('src', `${pathname}?width=${br.width}&format=${ext}&optimize=medium`);
    }
  });

  return picture;
}

export function toggleVideo(target) {
  const videos = target.querySelectorAll('video');
  const paused = videos[0] ? videos[0].paused : false;
  videos.forEach((video) => {
    if (paused) {
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // ignore
        });
      }
    } else video.pause();
  });
}

export function addAnimationToggle(target) {
  target.addEventListener('click', () => {
    toggleVideo(target);
  }, true);
  target.addEventListener('keypress', (e) => {
    if (e.key !== 'Enter' && e.keyCode !== 32 && e.key !== ' ') {
      return;
    }
    e.preventDefault();
    toggleVideo(target);
  }, true);
}

/**
 * Searches for Japanese text in headings and applies a smart word-breaking algorithm by surrounding
 * semantic blocks with spans. This allows browsers to break japanese sentences correctly.
 */
async function wordBreakJapanese(area) {
  if (getConfig().locale.region !== 'jp') {
    return;
  }
  const { loadDefaultJapaneseParser } = await import('./budoux-index-ja.min.js');
  const parser = loadDefaultJapaneseParser();
  area.querySelectorAll('h1, h2, h3, h4, h5').forEach((el) => {
    el.classList.add('budoux');
    parser.applyElement(el);
  });

  const BalancedWordWrapper = (await import('./bw2.js')).default;
  const bw2 = new BalancedWordWrapper();
  area.querySelectorAll('h1, h2, h3, h4, h5').forEach((el) => {
    // apply balanced word wrap to headings
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => {
        bw2.applyElement(el);
      });
    } else {
      window.setTimeout(() => {
        bw2.applyElement(el);
      }, 1000);
    }
  });
}

/**
 * Calculate a relatively more accurate "character count" for mixed Japanese
 * + English texts, for the purpose of heading auto font sizing.
 *
 * The rationale is that English characters are usually narrower than Japanese
 * ones. Hence each English character (and space character) is multiplied by an
 * coefficient before being added to the total character count. The current
 * coefficient value, 0.57, is an empirical value from some tests.
 */
function getJapaneseTextCharacterCount(text) {
  const headingEngCharsRegEx = /[a-zA-Z0-9 ]+/gm;
  const matches = text.matchAll(headingEngCharsRegEx);
  const eCnt = [...matches].map((m) => m[0]).reduce((cnt, m) => cnt + m.length, 0);
  const jtext = text.replaceAll(headingEngCharsRegEx, '');
  const jCnt = jtext.length;
  return eCnt * 0.57 + jCnt;
}

/**
 * Add dynamic font sizing CSS class names to headings
 *
 * The CSS class names are determined by character counts.
 * @param {Element} $block The container element
 * @param {string} classPrefix Prefix in CSS class names before "-long", "-very-long", "-x-long".
 * Default is "heading".
 * @param {string} selector CSS selector to select the target heading tags. Default is "h1, h2".
 */
export function addHeaderSizing($block, classPrefix = 'heading', selector = 'h1, h2') {
  const headings = $block.querySelectorAll(selector);
  // Each threshold of JP should be smaller than other languages
  // because JP characters are larger and JP sentences are longer
  const sizes = getConfig().locale.region === 'jp'
    ? [
      { name: 'long', threshold: 8 },
      { name: 'very-long', threshold: 11 },
      { name: 'x-long', threshold: 15 },
    ]
    : [
      { name: 'long', threshold: 30 },
      { name: 'very-long', threshold: 40 },
      { name: 'x-long', threshold: 50 },
    ];
  headings.forEach((h) => {
    const length = getConfig().locale.region === 'jp'
      ? getJapaneseTextCharacterCount(h.textContent.trim())
      : h.textContent.trim().length;
    sizes.forEach((size) => {
      if (length >= size.threshold) h.classList.add(`${classPrefix}-${size.name}`);
    });
  });
}

export function decorateArea(area = document) {
  removeIrrelevantSections(area);
}

/**
 * Call `addHeaderSizing` on default content blocks in all section blocks
 * in all Japanese pages except blog pages.
 */
function addJapaneseSectionHeaderSizing(area) {
  if (getConfig().locale.region === 'jp') {
    area.querySelectorAll('body:not(.blog) .section .default-content-wrapper').forEach((el) => {
      addHeaderSizing(el);
    });
  }
}

/**
 * Detects legal copy based on a * or † prefix and applies a smaller font size.
 * @param {Element} main The main element
 */
function decorateLegalCopy(area) {
  const legalCopyPrefixes = ['*', '†'];
  area.querySelectorAll('p').forEach(($p) => {
    const pText = $p.textContent.trim() ? $p.textContent.trim().charAt(0) : '';
    if (pText && legalCopyPrefixes.includes(pText)) {
      $p.classList.add('legal-copy');
    }
  });
}

export function loadLana(options = {}) {
  if (window.lana) return;

  const lanaError = (e) => {
    window.lana.log(e.reason || e.error || e.message, {
      errorType: 'i',
    });
  };

  window.lana = {
    log: async (...args) => {
      await import('./lana.js');
      window.removeEventListener('error', lanaError);
      window.removeEventListener('unhandledrejection', lanaError);
      return window.lana.log(...args);
    },
    debug: false,
    options,
  };

  window.addEventListener('error', lanaError);
  window.addEventListener('unhandledrejection', lanaError);
}

function removeMetadata() {
  document.head.querySelectorAll('meta').forEach((meta) => {
    if (meta.content && meta.content.includes('--none--')) {
      meta.remove();
    }
  });
}

const getMepValue = (val) => {
  const valMap = { on: true, off: false, gnav: 'gnav' };
  const finalVal = val?.toLowerCase().trim();
  if (finalVal in valMap) return valMap[finalVal];
  return finalVal;
};

export const getMepEnablement = (mdKey, paramKey = false) => {
  const paramValue = PAGE_URL.searchParams.get(paramKey || mdKey);
  if (paramValue) return getMepValue(paramValue);
  const mdValue = getMetadata(mdKey);
  if (!mdValue) return false;
  return getMepValue(mdValue);
};

export const combineMepSources = async (persEnabled, promoEnabled, mepParam) => {
  let persManifests = [];

  if (persEnabled) {
    persManifests = persEnabled.toLowerCase()
      .split(/,|(\s+)|(\\n)/g)
      .filter((path) => path?.trim())
      .map((manifestPath) => ({ manifestPath }));
  }

  if (promoEnabled) {
    const { default: getPromoManifests } = await import('../features/personalization/promo-utils.js');
    persManifests = persManifests.concat(getPromoManifests(promoEnabled, PAGE_URL.searchParams));
  }

  if (mepParam && mepParam !== 'off') {
    const persManifestPaths = persManifests.map((manifest) => {
      const { manifestPath } = manifest;
      if (manifestPath.startsWith('/')) return manifestPath;
      try {
        const url = new URL(manifestPath);
        return url.pathname;
      } catch (e) {
        return manifestPath;
      }
    });

    mepParam.split('---').forEach((manifestPair) => {
      const manifestPath = manifestPair.trim().toLowerCase().split('--')[0];
      if (!persManifestPaths.includes(manifestPath)) {
        persManifests.push({ manifestPath });
      }
    });
  }
  return persManifests;
};

async function checkForPageMods() {
  const { mep: mepParam } = Object.fromEntries(PAGE_URL.searchParams);
  if (mepParam === 'off') return;
  const persEnabled = getMepEnablement('personalization');
  const promoEnabled = getMepEnablement('manifestnames', 'promo');
  const targetEnabled = getMepEnablement('target');
  const mepEnabled = persEnabled || targetEnabled || promoEnabled || mepParam;
  if (!mepEnabled) return;

  const config = getConfig();
  config.mep = { targetEnabled };
  loadLink(
    `${config.base}/features/personalization/personalization.js`,
    { as: 'script', rel: 'modulepreload' },
  );

  const persManifests = await combineMepSources(persEnabled, promoEnabled, mepParam);
  if (targetEnabled === true) {
    await loadMartech({ persEnabled: true, persManifests, targetEnabled });
    return;
  }
  if (!persManifests.length) return;

  loadIms()
    .then(() => {
      if (window.adobeIMS.isSignedInUser() || getMetadata('xlg-entitlements')) loadMartech();
    })
    // eslint-disable-next-line no-console
    .catch((e) => { console.log('Unable to load IMS:', e); });

  const { preloadManifests, applyPers } = await import('../features/personalization/personalization.js');
  const manifests = preloadManifests({ persManifests }, { getConfig, loadLink });

  await applyPers(manifests);
}

export async function loadTemplate() {
  const template = getMetadata('template');
  if (!template) return;
  const name = template.toLowerCase().replace(/[^0-9a-z]/gi, '-');
  document.body.classList.add(name);
  const { miloLibs, codeRoot } = getConfig();
  const base = miloLibs && MILO_TEMPLATES.includes(name) ? miloLibs : codeRoot;
  const styleLoaded = new Promise((resolve) => {
    loadStyle(`${base}/templates/${name}/${name}.css`, resolve);
  });
  const scriptLoaded = new Promise((resolve) => {
    (async () => {
      try {
        await import(`${base}/templates/${name}/${name}.js`);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.log(`failed to load module for ${name}`, err);
      }
      resolve();
    })();
  });
  await Promise.all([styleLoaded, scriptLoaded]);
}

function loadTOC() {
  if (getMetadata('toc-seo') === 'on') {
    const handler = () => {
      loadStyle('/express/features/table-of-contents-seo/table-of-contents-seo.css');
      import('../features/table-of-contents-seo/table-of-contents-seo.js').then(({ default: setTOCSEO }) => setTOCSEO());
    };
    window.addEventListener('express:LCP:loaded', handler);
  }
}

async function loadPostLCP(config) {
  // post LCP actions go here
  sampleRUM('lcp');
  loadTOC();

  window.dispatchEvent(new Event('express:LCP:loaded'));
  if (config.mep?.targetEnabled === 'gnav') {
    await loadMartech({ persEnabled: true, postLCP: true });
  } else {
    loadMartech();
  }
  loadGnav();
  loadTemplate();
  const { default: loadFonts } = await import('./fonts.js');
  loadFonts(config.locale, loadStyle);
  if (config.mep?.preview) {
    import('../features/personalization/preview.js')
      .then(({ default: decoratePreviewMode }) => decoratePreviewMode());
  }
}

function initSidekick() {
  const initPlugins = async () => {
    const { default: init } = await import('./utils/sidekick.js');
    init();
  };

  if (document.querySelector('helix-sidekick')) {
    initPlugins();
  } else {
    document.addEventListener('sidekick-ready', () => {
      initPlugins();
    });
  }
}

export async function loadDeferred(area, blocks, config) {
  const event = new Event(MILO_EVENTS.DEFERRED);
  area.dispatchEvent(event);

  if (area !== document) {
    return;
  }

  config.resolveDeferred?.(true);

  if (config.links === 'on') {
    const path = `${config.contentRoot || ''}${getMetadata('links-path') || '/seo/links.json'}`;
    import('../features/links.js').then((mod) => mod.default(path, area));
  }

  sampleRUM('lazy');
  sampleRUM.observe(blocks);
  sampleRUM.observe(area.querySelectorAll('picture > img'));
}

async function documentPostSectionLoading(config) {
  // TODO: different from milo
  addFavIcon('https://unity-poc--express--adobecom.hlx.page/express/icons/cc-express.svg');
  if (config.experiment?.selectedVariant?.scripts?.length) {
    config.experiment.selectedVariant.scripts.forEach((script) => loadScript(script));
  }
  initSidekick();

  const { default: delayed } = await import('./delayed.js');
  delayed([getConfig, getMetadata, loadScript, loadStyle]);

  import('./attributes.js').then((analytics) => {
    document.querySelectorAll('main > div').forEach((section, idx) => analytics.decorateSectionAnalytics(section, idx, config));
  });

  document.body.appendChild(createTag('div', { id: 'page-load-ok-milo', style: 'display: none;' }));
}

async function processSection(section, config, isDoc) {
  const inlineFrags = [...section.el.querySelectorAll('a[href*="#_inline"]')];
  if (inlineFrags.length) {
    const { default: loadInlineFrags } = await import('../blocks/fragment/fragment.js');
    const fragPromises = inlineFrags.map((link) => loadInlineFrags(link));
    await Promise.all(fragPromises);
    // await decoratePlaceholders(section.el, config);
    const newlyDecoratedSection = decorateSection(section.el, section.idx);
    section.blocks = newlyDecoratedSection.blocks;
    section.preloadLinks = newlyDecoratedSection.preloadLinks;
  }

  if (section.preloadLinks.length) {
    const preloads = section.preloadLinks.map((block) => loadBlock(block));
    await Promise.all(preloads);
  }

  const loaded = section.blocks.map((block) => loadBlock(block));

  // await decorateIcons(section.el, config);

  // Only move on to the next section when all blocks are loaded.
  await Promise.all(loaded);

  // Show the section when all blocks inside are done.
  delete section.el.dataset.status;

  if (isDoc && section.el.dataset.idx === '0') {
    await loadPostLCP(config);
  }

  delete section.el.dataset.idx;

  return section.blocks;
}

// logic in express but not in milo
async function decorateExpressPage(main) {
  if (main) {
    displayEnv();
    displayOldLinkWarning();
  }
  const footer = document.querySelector('footer');
  if (footer && footer.dataset) delete footer.dataset.status;

  addPromotion();
  loadStyle('/express/styles/lazy-styles.css');

  // TODO: check if can deprecate support for these 2 patterns
  resolveFragments();
  removeMetadata();

  const params = new URLSearchParams(window.location.search);
  const buttonOff = params.get('button') === 'off';
  if ((window.location.hostname.endsWith('hlx.page') || window.location.hostname === ('localhost')) && !buttonOff) {
    import('../../tools/preview/preview.js');
  }
}

function fragmentBlocksToLinks(area) {
  area.querySelectorAll('div.fragment').forEach((blk) => {
    let fragLink = blk.querySelector('a');
    if (!fragLink) {
      try {
        const firstDiv = blk.querySelector('div');
        const textContent = firstDiv?.textContent?.trim();
        const fragURL = new URL(textContent, window.location.origin);
        firstDiv.textContent = '';
        fragLink = createTag('a', { href: fragURL.href });
      } catch (error) {
        blk.remove();
        window.lana.log(`Failed creating a url from an old fragment block: ${error.message}`);
      }
    }
    if (fragLink) {
      blk.parentElement.replaceChild(fragLink, blk);
      fragLink.setAttribute('ax-old-fragment', 'on');
    }
  });
}

export async function loadArea(area = document) {
  const isDoc = area === document;

  const main = area.querySelector('main');
  if (isDoc) {
    await checkForPageMods();
    removeIrrelevantSections(main);
    if (getMetadata('template-search-page') === 'Y') {
      const { default: redirect } = await import('./template-redirect.js');
      await redirect();
    }
    if (getMetadata('sheet-powered') === 'Y' || window.location.href.includes('/express/templates/')) {
      const { default: replaceContent } = await import('./content-replace.js');
      await replaceContent(main);
    }
    decorateHeaderAndFooter();
    if (window.hlx.testing) await decorateTesting();
    await buildAutoBlocks(main);
    decorateHeroLCP();
  }
  const config = getConfig();

  fragmentBlocksToLinks(area);

  splitSections(area);
  decorateButtons(area);
  await fixIcons(area);
  decorateSocialIcons(area);

  const sections = decorateSections(area, isDoc);
  decorateLegalCopy(area);
  addJapaneseSectionHeaderSizing(area);
  wordBreakJapanese(area);

  // appending express-specific branch parameters
  const links = isDoc ? area.querySelectorAll('main a[href*="adobesparkpost"]') : area.querySelectorAll(':scope a[href*="adobesparkpost"]');
  if (links.length) {
    import('./branchlinks.js').then((mod) => mod.default(links));
  }

  const areaBlocks = [];
  for (const section of sections) {
    // eslint-disable-next-line no-await-in-loop
    const sectionBlocks = await processSection(section, config, isDoc);
    areaBlocks.push(...sectionBlocks);

    areaBlocks.forEach((block) => {
      if (!block.className.includes('metadata')) block.dataset.block = '';
    });
  }

  if (isDoc) await decorateExpressPage(main);

  const currentHash = window.location.hash;
  if (currentHash) {
    scrollToHashedElement(currentHash);
  }

  if (isDoc) await documentPostSectionLoading(config);

  await loadDeferred(area, areaBlocks, config);
}

export function getMobileOperatingSystem() {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;

  // Windows Phone must come first because its UA also contains "Android"
  if (/windows phone/i.test(userAgent)) {
    return 'Windows Phone';
  }

  if (/android/i.test(userAgent)) {
    return 'Android';
  }

  if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
    return 'iOS';
  }

  return 'unknown';
}

export function titleCase(str) {
  const splitStr = str.toLowerCase().split(' ');
  for (let i = 0; i < splitStr.length; i += 1) {
    splitStr[i] = splitStr[i].charAt(0).toUpperCase() + splitStr[i].substring(1);
  }
  return splitStr.join(' ');
}

export function createIntersectionObserver({
  el, callback, once = true, options = {},
}) {
  const io = new IntersectionObserver((entries, observer) => {
    entries.forEach(async (entry) => {
      if (entry.isIntersecting) {
        if (once) observer.unobserve(entry.target);
        callback(entry.target, entry);
      }
    });
  }, options);
  io.observe(el);
  return io;
}

/*
 * lighthouse performance instrumentation helper
 * (needs a refactor)
 */

export function stamp(message) {
  if (window.name.includes('performance')) {
    // eslint-disable-next-line no-console
    console.log(`${new Date() - performance.timing.navigationStart}:${message}`);
  }
}

export function registerPerformanceLogger() {
  try {
    const polcp = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      stamp(JSON.stringify(entries));
      // eslint-disable-next-line no-console
      console.log(entries[0].element);
    });
    polcp.observe({ type: 'largest-contentful-paint', buffered: true });

    const pols = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      stamp(JSON.stringify(entries));
      // eslint-disable-next-line no-console
      console.log(entries[0].sources[0].node);
    });
    pols.observe({ type: 'layout-shift', buffered: true });

    const polt = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // Log the entry and all associated details.
        stamp(JSON.stringify(entry));
      }
    });

    // Start listening for `longtask` entries to be dispatched.
    polt.observe({ type: 'longtask', buffered: true });

    const pores = new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      entries.forEach((entry) => {
        stamp(`resource loaded: ${entry.name} - [${Math.round(entry.startTime + entry.duration)}]`);
      });
    });

    pores.observe({ type: 'resource', buffered: true });
  } catch (e) {
    // no output
  }
}

export const [setLibs, getLibs] = (() => {
  let libs;
  return [
    (prodLibs, force = false) => {
      if (force) {
        libs = prodLibs;
        return libs;
      }
      const { hostname } = window.location;
      if (!hostname.includes('hlx.page')
        && !hostname.includes('hlx.live')
        && !hostname.includes('localhost')) {
        libs = prodLibs;
        return libs;
      }
      const branch = new URLSearchParams(window.location.search).get('milolibs') || 'main';
      if (branch === 'local') {
        libs = 'http://localhost:6456/libs';
        return libs;
      }
      if (branch.indexOf('--') > -1) {
        libs = `https://${branch}.hlx.live/libs`;
        return libs;
      }
      libs = `https://${branch}--milo--adobecom.hlx.live/libs`;
      return libs;
    }, () => libs,
  ];
})();
