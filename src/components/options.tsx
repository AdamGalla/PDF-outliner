import { ModeToggle } from "./theme/ModeToggle";
import { Button } from "./ui/button";

export default function Options() {
  return <div className="p-2 flex justify-between gap-2">
    <ModeToggle />
    <Button variant="default">Save</Button>
  </div>
}
