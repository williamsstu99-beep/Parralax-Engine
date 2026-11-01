import type { Metadata } from "next";
import CircuitLab from "@/components/lab/CircuitLab";

export const metadata: Metadata = { title: "Circuits lab · Dynamic Learning" };

export default function Page() {
  return <CircuitLab />;
}
