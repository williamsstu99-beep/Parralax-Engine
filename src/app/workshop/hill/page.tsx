import type { Metadata } from "next";
import HillScene from "@/components/workshop/HillScene";

export const metadata: Metadata = { title: "Voltage is a hill · Dynamic Learning" };

export default function Page() {
  return <HillScene />;
}
