function isIPad(userAgent) {
  const ua = userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (typeof navigator !== 'undefined' && navigator.userAgentData) {
    const platform = navigator.userAgentData.platform.toLowerCase();
    const isMobile = navigator.userAgentData.mobile;
    if (isMobile && platform === 'ios') {
      return true;
    }
  }
  if (typeof navigator !== 'undefined') {
    if (navigator.maxTouchPoints && navigator.maxTouchPoints > 2 && /Macintosh/.test(ua)) {
      return true;
    }
  }
  return /iPad/.test(ua);
}

function isWindowsTablet(userAgent) {
  const ua = userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (typeof navigator !== 'undefined' && navigator.userAgentData) {
    const platform = navigator.userAgentData.platform.toLowerCase();
    const isMobile = navigator.userAgentData.mobile;
    if (isMobile && platform === 'windows') {
      return true;
    }
  }
  if (/Windows Phone|Windows Mobile/i.test(ua)) return true;
  if (/Windows NT/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 2) {
    if (/Touch|Tablet|ARM|Windows.*Tablet PC/i.test(ua)) {
      if (!/Laptop|Desktop/i.test(ua)) return true;
    }
  }
  return false;
}

function hasTouch() {
  if (typeof window === 'undefined') return false;
  if (typeof navigator !== 'undefined' && navigator.maxTouchPoints) {
    return navigator.maxTouchPoints > 0;
  }
  return 'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.msMaxTouchPoints > 0);
}

function hasMouse() {
  if (typeof window === 'undefined') return false;
  return 'onmouseover' in window;
}

function getPlatformInfo(userAgent) {
  const ua = userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  if (typeof navigator !== 'undefined' && navigator.userAgentData) {
    return {
      platform: navigator.userAgentData.platform.toLowerCase(),
      isMobile: navigator.userAgentData.mobile,
    };
  }
  const uaLower = ua.toLowerCase();
  let platform = 'unknown';
  if (/android/.test(uaLower)) {
    platform = 'android';
  } else if (/iphone|ipad|ipod|ios/.test(uaLower)) {
    platform = 'ios';
  } else if (/windows/.test(uaLower)) {
    platform = 'windows';
  } else if (/macintosh|mac os x/.test(uaLower)) {
    platform = 'macos';
  } else if (/linux/.test(uaLower)) {
    platform = 'linux';
  }
  return {
    platform,
    isMobile: /mobile|android|ios|iphone|ipad|ipod|windows phone/i.test(uaLower),
  };
}

export default function isDesktop(userAgent) {
  const ua = userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const platformInfo = getPlatformInfo(ua);
  const isMobileOS = platformInfo.isMobile;
  if (isMobileOS) return false;
  const isDesktopOS = ['windows', 'macos', 'linux'].includes(platformInfo.platform);
  if (!isDesktopOS) return false;
  const isTabletIPad = isIPad(ua);
  const isTabletWindows = isWindowsTablet(ua);
  const deviceHasTouch = hasTouch();
  const deviceHasMouse = hasMouse();
  const isWindowsTouch = /Windows NT/.test(ua) && deviceHasTouch;
  const isWindowsLaptopWithTouch = isWindowsTouch && !isTabletWindows;
  return !isTabletIPad
    && !isTabletWindows
    && (!deviceHasTouch || isWindowsLaptopWithTouch || (deviceHasTouch && deviceHasMouse));
}
