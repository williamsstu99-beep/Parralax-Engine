import type { Metadata } from "next";
import WingScene from "@/components/workshop/WingScene";

export const metadata: Metadata = { title: "How a wing lifts · Dynamic Learning" };

export default function Page() {
  return <WingScene />;
}
