"use client";

import { useState } from "react";
import { Download, Maximize2, RotateCw } from "lucide-react";

import { cn } from "@/lib/utils";

type ProofImageViewerProps = {
  src: string;
  alt: string;
  className?: string;
};

export const ProofImageViewer = ({ src, alt, className }: ProofImageViewerProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [rotation, setRotation] = useState(0);

  const rotate = () => setRotation((prev) => (prev + 90) % 360);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <button
        type="button"
        className="inline-flex items-center gap-2 text-sm font-semibold text-primary"
        onClick={() => setIsOpen(true)}
      >
        <Maximize2 className="h-4 w-4" />
        View proof
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-6">
          <div className="relative w-full max-w-3xl rounded-2xl bg-white p-4 shadow-lg">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-semibold text-slate-700">Proof image</h3>
              <div className="flex items-center gap-2">
                <a
                  href={src}
                  download
                  className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-600"
                >
                  <Download className="mr-1 inline-block h-4 w-4" />
                  Download
                </a>
                <button
                  type="button"
                  className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-600"
                  onClick={rotate}
                >
                  <RotateCw className="mr-1 inline-block h-4 w-4" />
                  Rotate
                </button>
                <button
                  type="button"
                  className="rounded-full bg-slate-900 px-3 py-1 text-sm font-semibold text-white"
                  onClick={() => {
                    setIsOpen(false);
                    setRotation(0);
                  }}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-center rounded-xl bg-slate-100 p-4">
              <img
                src={src}
                alt={alt}
                className="max-h-[70vh] w-auto rounded-lg object-contain"
                style={{ transform: `rotate(${rotation}deg)` }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
