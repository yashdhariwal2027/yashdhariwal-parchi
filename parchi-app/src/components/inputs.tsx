import { useEffect, useState, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number;
  onValue: (n: number) => void;
  /** Allow decimals (prices, kg). Default true. */
  decimals?: boolean;
  /** Show a ₹ sign inside the field */
  rupee?: boolean;
};

function show(n: number): string {
  return Number.isFinite(n) && n !== 0 ? String(n) : "";
}

/** A text box for numbers that lets people type freely ("12.", "") without fighting them. */
export function NumberInput({ value, onValue, decimals = true, rupee, className, ...rest }: Props) {
  const [text, setText] = useState(show(value));
  useEffect(() => {
    const parsed = text === "" ? 0 : Number(text);
    if (parsed !== value) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const input = (
    <input
      {...rest}
      type="text"
      inputMode={decimals ? "decimal" : "numeric"}
      autoComplete="off"
      className={cn("input tabular", rupee && "pl-7", className)}
      value={text}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, "").replace(decimals ? /[^\d.]/g : /\D/g, "");
        const clean = decimals ? raw.replace(/^(\d*\.?\d{0,3}).*$/, "$1") : raw;
        setText(clean);
        const n = clean === "" || clean === "." ? 0 : Number(clean);
        if (Number.isFinite(n)) onValue(n);
      }}
    />
  );
  if (!rupee) return input;
  return (
    <div className="relative">
      <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[15px] text-muted">
        ₹
      </span>
      {input}
    </div>
  );
}
