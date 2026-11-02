import type { Metadata } from "next";
import MagnetScene from "@/components/workshop/MagnetScene";

export const metadata: Metadata = { title: "Magnets · Dynamic Learning" };

export default function Page() {
  return <MagnetScene />;
}
