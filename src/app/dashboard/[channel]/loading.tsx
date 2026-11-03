import { LoaderCircle } from "lucide-react";

export default function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle size={18} strokeWidth={1.5} />
      <span>Reading your catalog… the first load takes a few seconds.</span>
    </div>
  );
}
