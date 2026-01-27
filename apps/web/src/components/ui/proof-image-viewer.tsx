"use client";

import { useState } from "react";
import Image from "next/image";
import { Download, Maximize2, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
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
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="gap-2"
        onClick={() => setIsOpen(true)}
      >
        <Maximize2 className="h-4 w-4" />
        View proof
      </Button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/80 p-6">
          <div className="relative w-full max-w-3xl rounded-2xl border border-divider/40 bg-content1/90 p-4 shadow-lg backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-sm font-semibold text-default-600">Proof image</h3>
              <div className="flex items-center gap-2">
                <Button
                  as="a"
                  href={src}
                  download
                  size="sm"
                  variant="outline"
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={rotate}
                >
                  <RotateCw className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setIsOpen(false);
                    setRotation(0);
                  }}
                >
                  Close
                </Button>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-center rounded-xl border border-divider/40 bg-content2/70 p-4">
              <Image
                src={src}
                alt={alt}
                width={1200}
                height={800}
                className="max-h-[35vh] w-auto rounded-lg object-contain"
                style={{ transform: `rotate(${rotation}deg)` }}
                unoptimized
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
