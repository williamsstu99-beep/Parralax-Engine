import type { Metadata } from "next";
import MotionLab from "@/components/lab/MotionLab";

export const metadata: Metadata = { title: "Motion lab · Dynamic Learning" };

export default function Page() {
  return <MotionLab />;
}
