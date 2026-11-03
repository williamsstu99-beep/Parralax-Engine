import type { Metadata } from "next";
import PipeScene from "@/components/workshop/PipeScene";

export const metadata: Metadata = { title: "Flow in a pipe · Dynamic Learning" };

export default function Page() {
  return <PipeScene />;
}
