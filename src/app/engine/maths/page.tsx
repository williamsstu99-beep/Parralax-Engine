import type { Metadata } from "next";
import LessonStudio from "@/components/lesson/LessonStudio";

export const metadata: Metadata = { title: "Mathematics engine · Dynamic Learning" };

export default function Page() {
  return <LessonStudio engine="maths" />;
}
