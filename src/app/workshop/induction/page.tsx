import type { Metadata } from "next";
import InductionScene from "@/components/workshop/InductionScene";

export const metadata: Metadata = { title: "Make electricity with a magnet · Dynamic Learning" };

export default function Page() {
  return <InductionScene />;
}
