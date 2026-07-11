import { Linking } from "react-native";

/** Open the dialer for a customer phone — UI affordance only. */
export function openPhoneDialer(phone: string) {
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (!cleaned) return;
  void Linking.openURL(`tel:${cleaned}`);
}

/** Open maps search for an address — UI affordance only. */
export function openAddressInMaps(address: string) {
  const q = address.trim();
  if (!q || q === "—") return;
  void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`);
}
