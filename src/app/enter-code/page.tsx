import { redirect } from "next/navigation";

/** The code is now asked for in the prompt box itself; old links land there. */
export default function EnterCode() {
  redirect("/");
}
