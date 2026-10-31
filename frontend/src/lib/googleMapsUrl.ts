const normalize = (value: string) => value.normalize("NFC").replace(/\s+/gu, " ").trim();
export function generateGoogleMapsSearchUrl(category: string, location: string, eventType = "", keyword = ""): string {
  const inputs = [category, location, eventType, keyword].map(normalize);
  if (!inputs[0] || !inputs[1]) throw new Error("Choose a service and enter a city or location.");
  if (inputs.some((value, index) => value.length > [120, 120, 80, 80][index] || /[\p{Cc}]/u.test(value)))
    throw new Error("Use shorter search details (service/city up to 120 characters; event/keyword up to 80).");
  const [service, city, event, extra] = inputs;
  const seen = new Set<string>();
  // Include the location once, and suppress repeated event/category/keyword tokens.
  const locationWords = new Set(city.toLocaleLowerCase().split(/[\s,]+/u));
  const terms = [event, service, extra].flatMap(part => part.split(" ")).filter(word => {
    const key = word.toLocaleLowerCase();
    if (!key || key === "in" || locationWords.has(key) || seen.has(key)) return false;
    seen.add(key); return true;
  });
  if (!terms.length) throw new Error("Enter a service distinct from the location.");
  const url = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(`${terms.join(" ")} in ${city}`);
  if (url.length > 2048) throw new Error("Search is too long. Shorten the location or keywords.");
  return url;
}
