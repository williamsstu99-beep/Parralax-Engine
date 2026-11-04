import type { Metadata } from "next";
import LessonStudio from "@/components/lesson/LessonStudio";

export const metadata: Metadata = { title: "Physics engine · Dynamic Learning" };

export default function Page() {
  return <LessonStudio engine="physics" />;
}
