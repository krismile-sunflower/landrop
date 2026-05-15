import type { DeviceType } from './types';

export function detectDeviceType(): DeviceType {
  const userAgent = navigator.userAgent.toLowerCase();
  if (/ipad|tablet/.test(userAgent)) {
    return 'tablet';
  }

  if (/mobi|android|iphone/.test(userAgent)) {
    return 'mobile';
  }

  return 'desktop';
}

export function defaultDeviceName(t?: (key: string) => string) {
  const browser = getBrowserName();
  const platform = navigator.platform || (t ? t('device.device') : 'Device');
  const on = t ? t('browser.on') : 'on';
  return `${browser} ${on} ${platform}`.slice(0, 48);
}

function getBrowserName() {
  const userAgent = navigator.userAgent;
  if (userAgent.includes('Edg/')) {
    return 'Edge';
  }

  if (userAgent.includes('Firefox/')) {
    return 'Firefox';
  }

  if (userAgent.includes('Chrome/')) {
    return 'Chrome';
  }

  if (userAgent.includes('Safari/')) {
    return 'Safari';
  }

  return 'Browser';
}
