import type { VendorCategory } from "../api/types";
// Search variants use existing engine categories, so assignments keep their contract.
/** Service chips and search labels for keyless vendor discovery. */
export const vendorDiscoveryCategories: Record<VendorCategory, readonly string[]> = {
  photographer: ["Photographers", "Videographers"],
  caterer: ["Caterers"],
  decorator: ["Decorators", "Florists", "Event planners", "Tent and equipment rentals"],
  music: ["DJs", "Music services", "Sound and lighting providers"],
  makeup: ["Makeup artists"],
  venue: ["Venues", "Banquet halls"],
  transport: ["Transport services"],
};
