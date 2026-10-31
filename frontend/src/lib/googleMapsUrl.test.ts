import { expect, it } from "vitest";
import { generateGoogleMapsSearchUrl as url } from "./googleMapsUrl";
it.each([
 ["Photographers", "Amritsar", "Wedding", "Wedding Photographers in Amritsar"],
 ["Caterers", "Chandigarh", "Event", "Event Caterers in Chandigarh"],
 ["DJs", "New Delhi", "", "DJs in New Delhi"],
 ["Decorators", "Mumbai", "", "Decorators in Mumbai"],
 ["Wedding photographers", "Amritsar", "Wedding", "Wedding photographers in Amritsar"],
 ["Florists", "São Paulo, BR & भारत", "", "Florists in São Paulo, BR & भारत"],
])("encodes %s in %s", (category, location, event, expected) => {
 const result = new URL(url(category, location, event));
 expect(result.searchParams.get("query")).toBe(expected);
 expect(result.searchParams.get("api")).toBe("1"); expect(result.href.length).toBeLessThanOrEqual(2048);
});
it("normalizes whitespace and removes repeated location/keyword terms", () => {
 expect(new URL(url(" photographers ", " Amritsar ", "Wedding", "in Amritsar photographers")).searchParams.get("query")).toBe("Wedding photographers in Amritsar");
});
it("rejects empty, excessive and malformed inputs", () => {
 for (const [a,b,c,d] of [["", "Pune"], ["Venue", " "], ["x".repeat(121), "Pune"], ["Venue", "Pune", "", "x".repeat(81)], ["Venue", "\ud800"]])
  expect(() => url(a,b,c,d)).toThrow();
 expect(() => url("場".repeat(120), "市".repeat(120), "式".repeat(80), "花".repeat(80))).toThrow();
});
