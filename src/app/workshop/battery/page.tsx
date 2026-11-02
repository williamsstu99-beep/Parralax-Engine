import type { Metadata } from "next";
import BatteryScene from "@/components/workshop/BatteryScene";

export const metadata: Metadata = { title: "Inside a battery · Dynamic Learning" };

export default function Page() {
  return <BatteryScene />;
}
