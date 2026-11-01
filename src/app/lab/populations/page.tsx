import type { Metadata } from "next";
import PopulationLab from "@/components/lab/PopulationLab";

export const metadata: Metadata = { title: "Populations lab · Dynamic Learning" };

export default function Page() {
  return <PopulationLab />;
}
