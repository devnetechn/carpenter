export function isWithinServiceArea(zip: string, serviceAreaZips: string[]): boolean {
  return serviceAreaZips.includes(zip.trim());
}
