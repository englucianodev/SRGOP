export function isMobileDevice(device = globalThis.navigator) {
  if (!device) return false;
  return Boolean(
    device.userAgentData?.mobile ||
    /Android|iPhone|iPad|iPod|IEMobile/i.test(device.userAgent || '') ||
    (device.platform === 'MacIntel' && device.maxTouchPoints > 1),
  );
}
