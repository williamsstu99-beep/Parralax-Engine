import type { Metadata } from "next";
import CodeForm from "./CodeForm";

export const metadata: Metadata = { title: "Enter code · Dynamic Learning" };

export default function EnterCode() {
  return <CodeForm />;
}
