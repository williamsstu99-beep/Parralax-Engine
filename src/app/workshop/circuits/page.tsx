import type { Metadata } from "next";
import CircuitScene from "@/components/workshop/CircuitScene";

export const metadata: Metadata = { title: "Circuits workshop · Dynamic Learning" };

export default function Page() {
  return <CircuitScene />;
}
