import type { Metadata } from "next";
import LessonStudio from "@/components/lesson/LessonStudio";

export const metadata: Metadata = { title: "Lesson studio · Dynamic Learning" };

export default function Page() {
  return <LessonStudio />;
}
