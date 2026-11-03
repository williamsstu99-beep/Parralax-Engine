import type { Metadata } from "next";
import PlaneScene from "@/components/workshop/PlaneScene";

export const metadata: Metadata = { title: "Four forces on a plane · Dynamic Learning" };

export default function Page() {
  return <PlaneScene />;
}
