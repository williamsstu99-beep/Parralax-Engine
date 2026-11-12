import type { Metadata } from "next";
import Studio from "@/components/studio/Studio";

export const metadata: Metadata = { title: "Studio · Auracle" };

export default function Page() {
  return <Studio />;
}
